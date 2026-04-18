// El dueño aprueba una cotización pendiente — recalcula total y envía al cliente por WhatsApp
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { formatPEN } from '@/lib/utils'
import { getSessionInfo } from '@/lib/auth/roles'
import { getYCloudApiKey } from '@/lib/tenant'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp')
    .eq('id', session.ferreteriaId)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Cargar cotización con items y cliente
  const { data: cotizacion } = await supabase
    .from('cotizaciones')
    .select('*, items_cotizacion(*), clientes(nombre, telefono)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!cotizacion) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  if (cotizacion.estado !== 'pendiente_aprobacion') {
    return NextResponse.json({ error: 'La cotización no está pendiente de aprobación' }, { status: 400 })
  }

  const items = (cotizacion.items_cotizacion ?? []) as Array<{
    id: string; nombre_producto: string; unidad: string
    cantidad: number; precio_unitario: number; subtotal: number; no_disponible: boolean
  }>

  // Recalcular total con los precios actualizados
  const nuevoTotal = items
    .filter((i) => !i.no_disponible)
    .reduce((sum, i) => sum + i.subtotal, 0)

  // Actualizar cotización
  await supabase
    .from('cotizaciones')
    .update({
      estado: 'enviada',
      total: nuevoTotal,
      aprobada_at: new Date().toISOString(),
    })
    .eq('id', id)

  // Actualizar datos_flujo de la conversación para que el bot sepa que hay cotización aprobada
  if (cotizacion.conversacion_id) {
    await supabase
      .from('conversaciones')
      .update({
        datos_flujo: {
          cotizacion_id: id,
          paso: 'esperando_confirmacion',
        },
      })
      .eq('id', cotizacion.conversacion_id)
  }

  // Construir mensaje WhatsApp para el cliente
  const itemsDisp = items.filter((i) => !i.no_disponible)
  let mensaje = `✅ *Cotización Aprobada — ${ferreteria.nombre}*\n`
  mensaje += `─────────────────\n`
  for (const item of itemsDisp) {
    mensaje += `\n▪️ *${item.nombre_producto}*\n`
    mensaje += `   ${item.cantidad} ${item.unidad}${item.cantidad !== 1 ? 's' : ''} × ${formatPEN(item.precio_unitario)}\n`
    mensaje += `   *Subtotal: ${formatPEN(item.subtotal)}*\n`
  }
  mensaje += `\n─────────────────\n`
  mensaje += `*TOTAL: ${formatPEN(nuevoTotal)}*\n\n`
  mensaje += `¿Desea confirmar este pedido? Responda *SÍ* para continuar 😊`

  // Enviar por WhatsApp si hay API key
  const telefonoCliente = (cotizacion.clientes as any)?.telefono
  if (telefonoCliente) {
    try {
      const apiKey = await getYCloudApiKey(ferreteria.id)
      if (apiKey) {
        await enviarMensaje({
          from: ferreteria.telefono_whatsapp.replace(/^\+/, ''),
          to: telefonoCliente,
          texto: mensaje,
          apiKey,
        })
      }
    } catch (e) {
      console.error('[API] Error enviando cotización aprobada:', e)
    }
  }

  return NextResponse.json({ ok: true, total: nuevoTotal, mensaje })
}
