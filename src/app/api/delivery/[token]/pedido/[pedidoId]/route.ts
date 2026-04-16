// PATCH /api/delivery/[token]/pedido/[pedidoId] — repartidor registra entrega o incidencia
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'

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

  // Verificar el token del repartidor
  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, ferreterias(nombre, telefono_whatsapp)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await request.json()
  const { accion, cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc } = body

  if (!['entregado', 'incidencia'].includes(accion)) {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  // Obtener pedido para validar y notificar
  const { data: pedidoActual } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, estado, telefono_cliente, clientes(telefono)')
    .eq('id', pedidoId)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .eq('repartidor_id', repartidor.id)
    .single()

  if (!pedidoActual) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const update: Record<string, unknown> = {}

  if (accion === 'entregado') {
    update.estado = 'entregado'
    update.cobrado_monto = cobrado_monto ?? null
    update.cobrado_metodo = cobrado_metodo ?? null
  } else {
    // Incidencia — queda en enviado pero con la info registrada
    update.incidencia_tipo = incidencia_tipo ?? 'otro'
    update.incidencia_desc = incidencia_desc ?? null
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(update)
    .eq('id', pedidoId)
    .select('id, estado, numero_pedido')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar al cliente vía WhatsApp si se entregó
  const ferr = repartidor.ferreterias as any
  if (accion === 'entregado' && process.env.YCLOUD_API_KEY && ferr?.telefono_whatsapp) {
    const telefono = (pedidoActual.clientes as any)?.telefono ?? pedidoActual.telefono_cliente
    if (telefono) {
      const msg = `🎉 *${ferr.nombre}*\n\nSu pedido *${pedidoActual.numero_pedido}* ha sido *entregado*. ¡Esperamos que todo sea de su agrado! 🙏`
      enviarMensaje({
        from: ferr.telefono_whatsapp.replace(/^\+/, ''),
        to: telefono,
        texto: msg,
      }).catch((e) => console.error('[Delivery] Error notificando entrega:', e))
    }
  }

  return NextResponse.json(data)
}
