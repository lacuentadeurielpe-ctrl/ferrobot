// El dueño rechaza una cotización pendiente — notifica al cliente
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { getSessionInfo } from '@/lib/auth/roles'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const motivo: string = body.motivo ?? ''

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp')
    .eq('id', session.ferreteriaId)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: cotizacion } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), conversacion_id')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!cotizacion) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  await supabase
    .from('cotizaciones')
    .update({ estado: 'rechazada', notas_dueno: motivo || null })
    .eq('id', id)

  // Limpiar flujo de la conversación
  if (cotizacion.conversacion_id) {
    await supabase
      .from('conversaciones')
      .update({ datos_flujo: null })
      .eq('id', cotizacion.conversacion_id)
  }

  const mensaje =
    `Lo sentimos, en este momento no podemos procesar su solicitud con precio especial.\n` +
    (motivo ? `${motivo}\n\n` : '\n') +
    `Si desea, puede consultarnos por otros productos o cantidades. 😊`

  const telefonoCliente = (cotizacion.clientes as any)?.telefono
  if (telefonoCliente && process.env.YCLOUD_API_KEY && process.env.YCLOUD_API_KEY !== 'your_ycloud_api_key') {
    try {
      await enviarMensaje({
        from: ferreteria.telefono_whatsapp.replace(/^\+/, ''),
        to: telefonoCliente,
        texto: mensaje,
      })
    } catch (e) {
      console.error('[API] Error enviando rechazo:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
