// PATCH /api/delivery/[token]/pedido/[pedidoId] — repartidor registra entrega, incidencia, retorno o emergencia
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { getYCloudApiKey } from '@/lib/tenant'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; pedidoId: string }> }
) {
  const { token, pedidoId } = await params
  const supabase = adminClient()

  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, ferreterias(nombre, telefono_whatsapp, telefono_dueno)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await request.json()
  const { accion, cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc, mensaje_emergencia } = body

  const ACCIONES_VALIDAS = ['entregado', 'incidencia', 'retorno', 'emergencia']
  if (!ACCIONES_VALIDAS.includes(accion)) {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { data: pedidoActual } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, estado, telefono_cliente, clientes(telefono)')
    .eq('id', pedidoId)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .single()

  if (!pedidoActual) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const ferr = repartidor.ferreterias as any

  // Emergencia: solo notifica al dueño, no cambia el estado del pedido
  if (accion === 'emergencia') {
    if (ferr?.telefono_whatsapp && ferr?.telefono_dueno) {
      const msg = `🚨 *EMERGENCIA — ${ferr.nombre}*\n\nRepartidor: *${repartidor.nombre}*\nPedido: *${pedidoActual.numero_pedido}*\n\n${mensaje_emergencia ?? 'Sin detalles adicionales.'}`
      getYCloudApiKey(repartidor.ferreteria_id).then((apiKey) => {
        if (apiKey) {
          enviarMensaje({ from: ferr.telefono_whatsapp.replace(/^\+/, ''), to: ferr.telefono_dueno, texto: msg, apiKey })
            .catch((e) => console.error('[Delivery] Error enviando emergencia:', e))
        }
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true, mensaje: 'Emergencia reportada al dueño' })
  }

  const update: Record<string, unknown> = {}

  if (accion === 'entregado') {
    update.estado = 'entregado'
    update.cobrado_monto = cobrado_monto ?? null
    update.cobrado_metodo = cobrado_metodo ?? null
  } else if (accion === 'incidencia') {
    update.incidencia_tipo = incidencia_tipo ?? 'otro'
    update.incidencia_desc = incidencia_desc ?? null
  } else if (accion === 'retorno') {
    // Pedido vuelve a la tienda — reset estado y desasignar repartidor
    update.estado = 'en_preparacion'
    update.repartidor_id = null
    update.incidencia_tipo = incidencia_tipo ?? 'otro'
    update.incidencia_desc = incidencia_desc ?? 'Pedido retornado a tienda'
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(update)
    .eq('id', pedidoId)
    .select('id, estado, numero_pedido')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar cliente si entregado + dueño en incidencias/retornos (fire-and-forget)
  if (ferr?.telefono_whatsapp && (accion === 'entregado' || accion === 'incidencia' || accion === 'retorno')) {
    getYCloudApiKey(repartidor.ferreteria_id).then((apiKey) => {
      if (!apiKey) return
      const from = ferr.telefono_whatsapp.replace(/^\+/, '')

      if (accion === 'entregado') {
        const telefono = (pedidoActual.clientes as any)?.telefono ?? pedidoActual.telefono_cliente
        if (telefono) {
          enviarMensaje({
            from, to: telefono,
            texto: `🎉 *${ferr.nombre}*\n\nSu pedido *${pedidoActual.numero_pedido}* ha sido *entregado*. ¡Esperamos que todo sea de su agrado! 🙏`,
            apiKey,
          }).catch((e) => console.error('[Delivery] Error notificando entrega:', e))
        }
      }

      if ((accion === 'incidencia' || accion === 'retorno') && ferr?.telefono_dueno) {
        const labelInc: Record<string, string> = {
          cliente_ausente: 'Cliente no estaba',
          pedido_incorrecto: 'Pedido incorrecto',
          pago_rechazado: 'No pudo pagar',
          otro: 'Otro problema',
        }
        const tipoLabel = labelInc[incidencia_tipo ?? 'otro'] ?? incidencia_tipo ?? 'Problema'
        const emoji = accion === 'retorno' ? '🔄' : '⚠️'
        const titulo = accion === 'retorno' ? 'RETORNO' : 'INCIDENCIA'
        enviarMensaje({
          from, to: ferr.telefono_dueno,
          texto: `${emoji} *${titulo} — ${ferr.nombre}*\n\nRepartidor: *${repartidor.nombre}*\nPedido: *${pedidoActual.numero_pedido}*\nProblema: ${tipoLabel}${incidencia_desc ? `\nDetalle: ${incidencia_desc}` : ''}`,
          apiKey,
        }).catch((e) => console.error('[Delivery] Error notificando incidencia al dueño:', e))
      }
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
