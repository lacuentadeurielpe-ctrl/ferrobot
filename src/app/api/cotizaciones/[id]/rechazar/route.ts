// El dueño rechaza una cotización pendiente — notifica al cliente
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const motivo: string = body.motivo ?? ''

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp')
    .eq('owner_id', user.id)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: cotizacion } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), conversacion_id')
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)
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
