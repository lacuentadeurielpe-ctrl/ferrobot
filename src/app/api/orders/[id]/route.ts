import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { generarYEnviarComprobante } from '@/lib/pdf/generar-comprobante'

const ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado']

// Mensajes WhatsApp al cliente según el nuevo estado
function mensajeEstado(numeroPedido: string, estado: string, nombreFerreteria: string): string | null {
  switch (estado) {
    case 'confirmado':
      return `✅ *${nombreFerreteria}*\n\nSu pedido *${numeroPedido}* ha sido *confirmado*. Estamos preparando su pedido. ¡Gracias por su preferencia! 🙏`
    case 'en_preparacion':
      return `📦 *${nombreFerreteria}*\n\nSu pedido *${numeroPedido}* está siendo preparado. Le avisaremos cuando esté listo.`
    case 'enviado':
      return `🚚 *${nombreFerreteria}*\n\nSu pedido *${numeroPedido}* está *en camino*. Pronto llegará a su dirección.`
    case 'entregado':
      return `🎉 *${nombreFerreteria}*\n\nSu pedido *${numeroPedido}* ha sido *entregado*. Esperamos que todo sea de su agrado. ¡Hasta la próxima!`
    case 'cancelado':
      return `❌ *${nombreFerreteria}*\n\nLamentamos informarle que su pedido *${numeroPedido}* ha sido *cancelado*. Para más información contáctenos por este mismo chat.`
    default:
      return null
  }
}

// PATCH /api/orders/[id] — actualizar estado del pedido
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  if (body.estado && !ESTADOS_VALIDOS.includes(body.estado))
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

  // Obtener datos de la ferretería (para mensajes WhatsApp y validación)
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp, modo_asignacion_delivery')
    .eq('id', session.ferreteriaId)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Obtener estado actual del pedido antes de actualizar (para gestión de stock y validación de pago)
  const { data: pedidoActual } = await supabase
    .from('pedidos')
    .select('estado, metodo_pago, estado_pago')
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)
    .single()

  // Validar pago antes de avanzar a en_preparacion o enviado
  // Solo tarjeta/POS requiere confirmación anticipada — el resto puede cobrarse contra entrega
  if (body.estado && ['en_preparacion', 'enviado'].includes(body.estado)) {
    const metodo = pedidoActual?.metodo_pago
    const estadoPago = pedidoActual?.estado_pago
    if (metodo === 'tarjeta' && estadoPago !== 'pagado') {
      return NextResponse.json({
        error: 'Los pagos con tarjeta/POS deben confirmarse antes de preparar el pedido',
        codigo: 'PAGO_PENDIENTE',
        estado_pago: estadoPago,
      }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({
      estado: body.estado,
      notas: body.notas,
      ...(body.estado === 'cancelado' && body.motivo_cancelacion
        ? { motivo_cancelacion: body.motivo_cancelacion }
        : {}),
    })
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)
    .select('*, clientes(nombre, telefono), items_pedido(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Gestión de stock ───────────────────────────────────────────────────────
  const estadoAnterior = pedidoActual?.estado
  const estadosConfirmados = ['confirmado', 'en_preparacion', 'enviado', 'entregado']

  if (estadoAnterior === 'pendiente' && estadosConfirmados.includes(body.estado)) {
    // Descontar stock al salir de pendiente hacia cualquier estado confirmado
    // (cubre el caso de saltar directo a en_preparacion, enviado o entregado)
    await supabase.rpc('reducir_stock_pedido', { p_pedido_id: id })
      .then(({ error: e }) => {
        if (e) console.error('[Stock] Error descontando stock:', e.message)
        else console.log(`[Stock] Stock descontado para pedido ${id}`)
      })
  } else if (body.estado === 'cancelado' && estadoAnterior && estadosConfirmados.includes(estadoAnterior)) {
    // Restaurar stock si se cancela un pedido que ya tenía stock descontado
    await supabase.rpc('restaurar_stock_pedido', { p_pedido_id: id })
      .then(({ error: e }) => {
        if (e) console.error('[Stock] Error restaurando stock:', e.message)
        else console.log(`[Stock] Stock restaurado para pedido ${id}`)
      })
  }

  // Enviar notificación WhatsApp al cliente si hay API key y el estado lo amerita
  if (body.estado && process.env.YCLOUD_API_KEY && process.env.YCLOUD_API_KEY !== 'your_ycloud_api_key') {
    const msg = mensajeEstado(data.numero_pedido, body.estado, ferreteria.nombre)
    const telefono = (data.clientes as any)?.telefono ?? data.telefono_cliente

    if (msg && telefono) {
      try {
        await enviarMensaje({
          from: ferreteria.telefono_whatsapp.replace(/^\+/, ''),
          to: telefono,
          texto: msg,
        })
      } catch (e) {
        console.error('[API] Error enviando notificación de estado:', e)
        // No fallar — el estado ya se actualizó
      }
    }
  }

  // Modo libre: notificar a todos los repartidores activos con teléfono al confirmar
  if (body.estado === 'confirmado' && data.modalidad === 'delivery' && (ferreteria as any).modo_asignacion_delivery === 'libre' && process.env.YCLOUD_API_KEY) {
    const { data: repartidores } = await supabase
      .from('repartidores')
      .select('id, nombre, telefono, token')
      .eq('ferreteria_id', ferreteria.id)
      .eq('activo', true)
      .not('telefono', 'is', null)

    if (repartidores?.length) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const zona = (data as any).zonas_delivery?.nombre ?? null
      const nombre = (data.clientes as any)?.nombre ?? data.nombre_cliente ?? 'Cliente'

      for (const rep of repartidores) {
        const msg = `🚚 *Nuevo pedido disponible — ${ferreteria.nombre}*\n\nPedido: *${data.numero_pedido}*\nCliente: ${nombre}${zona ? `\nZona: ${zona}` : ''}\nTotal: S/ ${data.total.toFixed(2)}\n\n👉 Entra a tu app para aceptarlo:\n${baseUrl}/delivery/${rep.token}`
        enviarMensaje({
          from: ferreteria.telefono_whatsapp.replace(/^\+/, ''),
          to: rep.telefono!,
          texto: msg,
        }).catch((e) => console.error(`[ModoLibre] Error notificando a ${rep.nombre}:`, e))
      }
    }
  }

  // Generar y enviar comprobante automáticamente al confirmar el pedido
  if (body.estado === 'confirmado') {
    generarYEnviarComprobante({
      pedidoId: id,
      ferreteriaId: ferreteria.id,
    }).catch((err) => {
      console.error('[Comprobante] Error generando automáticamente:', err)
    })
  }

  return NextResponse.json(data)
}

// GET /api/orders/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
