// El dueño envía un mensaje desde el panel — pausa el bot automáticamente
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { getSessionInfo } from '@/lib/auth/roles'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params
  const { texto } = await request.json()
  if (!texto?.trim()) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })

  // Verificar que la conversación pertenece a la ferretería
  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id, telefono_whatsapp').eq('id', session.ferreteriaId).single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const { data: conversacion } = await supabase
    .from('conversaciones')
    .select('*, clientes(telefono)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!conversacion) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  // Pausar el bot y registrar actividad del dueño
  await supabase.from('conversaciones').update({
    bot_pausado: true,
    estado: 'intervenida_dueno',
    dueno_activo_at: new Date().toISOString(),
    ultima_actividad: new Date().toISOString(),
  }).eq('id', id)

  // Guardar el mensaje del dueño
  const { data: mensaje, error } = await supabase
    .from('mensajes')
    .insert({ conversacion_id: id, role: 'dueno', contenido: texto.trim() })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enviar por WhatsApp vía YCloud
  const telefonoCliente = (conversacion.clientes as any)?.telefono
  if (telefonoCliente && process.env.YCLOUD_API_KEY && process.env.YCLOUD_API_KEY !== 'your_ycloud_api_key') {
    try {
      await enviarMensaje({
        from: ferreteria.telefono_whatsapp.replace(/^\+/, ''),
        to: telefonoCliente,
        texto: texto.trim(),
      })
    } catch (e) {
      console.error('[API] Error enviando mensaje del dueño por YCloud:', e)
      // No fallar — el mensaje ya quedó guardado en la BD
    }
  }

  return NextResponse.json(mensaje, { status: 201 })
}
