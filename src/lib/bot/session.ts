// Gestión de sesiones de conversación
// Una sesión es una conversación activa entre cliente y ferretería
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Conversacion, Cliente } from '@/types/database'

interface GetOrCreateSessionResult {
  conversacion: Conversacion
  cliente: Cliente
  esNueva: boolean
}

// Obtiene la sesión activa de un cliente o crea una nueva
export async function getOrCreateSession(
  supabase: SupabaseClient,
  ferreteriaId: string,
  telefonoCliente: string,
  timeoutSesionMinutos: number
): Promise<GetOrCreateSessionResult> {
  // 1. Obtener o crear cliente
  let { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('ferreteria_id', ferreteriaId)
    .eq('telefono', telefonoCliente)
    .single()

  if (!cliente) {
    const { data: nuevoCliente, error } = await supabase
      .from('clientes')
      .insert({ ferreteria_id: ferreteriaId, telefono: telefonoCliente })
      .select()
      .single()

    if (error) throw new Error(`Error creando cliente: ${error.message}`)
    cliente = nuevoCliente
  }

  // 2. Buscar conversación activa dentro del timeout
  const limiteTimeout = new Date(Date.now() - timeoutSesionMinutos * 60 * 1000).toISOString()

  const { data: conversacionExistente } = await supabase
    .from('conversaciones')
    .select('*')
    .eq('ferreteria_id', ferreteriaId)
    .eq('cliente_id', cliente.id)
    .in('estado', ['activa', 'intervenida_dueno'])
    .gte('ultima_actividad', limiteTimeout)
    .order('ultima_actividad', { ascending: false })
    .limit(1)
    .single()

  if (conversacionExistente) {
    // Actualizar última actividad
    await supabase
      .from('conversaciones')
      .update({ ultima_actividad: new Date().toISOString() })
      .eq('id', conversacionExistente.id)

    return {
      conversacion: { ...conversacionExistente, ultima_actividad: new Date().toISOString() },
      cliente,
      esNueva: false,
    }
  }

  // 3. Crear nueva conversación (cerrar las anteriores por si quedan abiertas)
  await supabase
    .from('conversaciones')
    .update({ estado: 'cerrada' })
    .eq('ferreteria_id', ferreteriaId)
    .eq('cliente_id', cliente.id)
    .eq('estado', 'activa')

  const { data: nuevaConversacion, error: errConv } = await supabase
    .from('conversaciones')
    .insert({
      ferreteria_id: ferreteriaId,
      cliente_id: cliente.id,
      estado: 'activa',
      bot_pausado: false,
    })
    .select()
    .single()

  if (errConv) throw new Error(`Error creando conversación: ${errConv.message}`)

  return { conversacion: nuevaConversacion, cliente, esNueva: true }
}

// Guarda un mensaje en el historial
export async function guardarMensaje(
  supabase: SupabaseClient,
  conversacionId: string,
  role: 'cliente' | 'bot' | 'dueno',
  contenido: string,
  ycloudMessageId?: string
) {
  const { error } = await supabase.from('mensajes').insert({
    conversacion_id: conversacionId,
    role,
    contenido,
    ycloud_message_id: ycloudMessageId ?? null,
  })

  if (error) console.error('[Session] Error guardando mensaje:', error.message)
}

// Obtiene el historial reciente de mensajes de una conversación
export async function getHistorial(
  supabase: SupabaseClient,
  conversacionId: string,
  limite: number
): Promise<{ role: 'cliente' | 'bot' | 'dueno'; contenido: string }[]> {
  const { data } = await supabase
    .from('mensajes')
    .select('role, contenido')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: false })
    .limit(limite)

  return (data ?? []).reverse() as { role: 'cliente' | 'bot' | 'dueno'; contenido: string }[]
}

// Verifica si el bot debe retomar el control (timeout de intervención del dueño)
export async function verificarRetomarBot(
  supabase: SupabaseClient,
  conversacion: Conversacion,
  timeoutIntervencionMinutos: number
): Promise<boolean> {
  if (!conversacion.bot_pausado) return false
  if (!conversacion.dueno_activo_at) return true // nunca hubo actividad → retomar

  const limiteIntervacion = new Date(
    Date.now() - timeoutIntervencionMinutos * 60 * 1000
  ).toISOString()

  const duenoTardio = conversacion.dueno_activo_at < limiteIntervacion

  if (duenoTardio) {
    // Reactivar el bot
    await supabase
      .from('conversaciones')
      .update({ bot_pausado: false, estado: 'activa' })
      .eq('id', conversacion.id)
    return true
  }

  return false
}

// Pausa el bot y registra que el dueño está tomando control
export async function pausarBot(supabase: SupabaseClient, conversacionId: string) {
  await supabase
    .from('conversaciones')
    .update({ bot_pausado: true, estado: 'intervenida_dueno', dueno_activo_at: new Date().toISOString() })
    .eq('id', conversacionId)
}

// Verifica si el mensaje ya fue procesado (deduplicación por ycloud_message_id)
export async function mensajeYaProcesado(
  supabase: SupabaseClient,
  ycloudMessageId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('mensajes')
    .select('id')
    .eq('ycloud_message_id', ycloudMessageId)
    .single()

  return !!data
}
