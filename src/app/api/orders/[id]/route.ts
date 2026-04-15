import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  if (body.estado && !ESTADOS_VALIDOS.includes(body.estado))
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

  // Verificar que el pedido pertenece a la ferretería del dueño
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp')
    .eq('owner_id', user.id)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('pedidos')
    .update({ estado: body.estado, notas: body.notas })
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)
    .select('*, clientes(nombre, telefono), items_pedido(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
