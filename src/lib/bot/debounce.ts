// F4: Debounce de mensajes entrantes
//
// Cuando un cliente escribe varios mensajes seguidos en WhatsApp, esperamos
// N segundos desde el último antes de responder. Durante esa ventana los
// mensajes se acumulan. Implementación serverless-friendly:
//
//   1. El webhook inserta/actualiza una fila en `debounce_pendiente` con
//      `vence_at = now() + N segundos` y los mensajes acumulados.
//   2. El mismo webhook espera (setTimeout) hasta su propio `vence_at`.
//   3. Al despertar, relee la fila:
//        - Si `vence_at` actual > el que fijó este webhook → otro mensaje
//          extendió la ventana → este webhook retorna (el siguiente lo procesa).
//        - Si `vence_at` actual == el que fijó → este es el último → consume
//          la fila y devuelve el texto concatenado para procesar.
//   4. Hay un cron de limpieza que procesa filas huérfanas (si un webhook
//      crasheó), aunque con TTL corto es muy poco frecuente.
//
// FERRETERÍA AISLADA: key natural (ferreteria_id, telefono_cliente).

import type { SupabaseClient } from '@supabase/supabase-js'

interface MensajeDebounce {
  texto: string
  ycloud_message_id?: string
  recibido_at: string
}

export interface ResultadoDebounce {
  /** true = este webhook debe procesar todo lo acumulado. false = retornar 200 sin hacer nada. */
  procesar: boolean
  /** Texto concatenado de todos los mensajes acumulados (solo si procesar=true) */
  textoAcumulado?: string
  /** ycloudMessageId del último mensaje (para dedup downstream) */
  ycloudMessageIdUltimo?: string
}

export async function acumularOProcesar(params: {
  supabase: SupabaseClient
  ferreteriaId: string
  telefonoCliente: string
  texto: string
  ycloudMessageId?: string
  debounceSegundos: number
}): Promise<ResultadoDebounce> {
  const { supabase, ferreteriaId, telefonoCliente, texto, ycloudMessageId, debounceSegundos } = params

  const ahora = Date.now()
  const mensajeNuevo: MensajeDebounce = {
    texto,
    ycloud_message_id: ycloudMessageId,
    recibido_at: new Date(ahora).toISOString(),
  }

  // Leer fila existente (si hay)
  const { data: existente } = await supabase
    .from('debounce_pendiente')
    .select('id, mensajes, vence_at')
    .eq('ferreteria_id', ferreteriaId)    // FERRETERÍA AISLADA
    .eq('telefono_cliente', telefonoCliente)
    .maybeSingle()

  // Nueva venta_at que este webhook intenta fijar
  const venceAtNueva = new Date(ahora + debounceSegundos * 1000).toISOString()

  let mensajesAcumulados: MensajeDebounce[] = []
  if (existente) {
    const previos = Array.isArray(existente.mensajes) ? (existente.mensajes as MensajeDebounce[]) : []
    // Dedup por ycloud_message_id (YCloud puede reintentar el mismo mensaje)
    const yaEsta = ycloudMessageId && previos.some((m) => m.ycloud_message_id === ycloudMessageId)
    mensajesAcumulados = yaEsta ? previos : [...previos, mensajeNuevo]
  } else {
    mensajesAcumulados = [mensajeNuevo]
  }

  // Upsert con la nueva vence_at
  const { error: errUpsert } = await supabase
    .from('debounce_pendiente')
    .upsert(
      {
        ferreteria_id:    ferreteriaId,
        telefono_cliente: telefonoCliente,
        mensajes:         mensajesAcumulados,
        vence_at:         venceAtNueva,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: 'ferreteria_id,telefono_cliente' }
    )

  if (errUpsert) {
    console.error('[Debounce] Error upsert — fallback a procesamiento inmediato:', errUpsert.message)
    return { procesar: true, textoAcumulado: texto, ycloudMessageIdUltimo: ycloudMessageId }
  }

  // Esperar hasta nuestro vence_at (con margen pequeño para evitar picos)
  const esperaMs = debounceSegundos * 1000
  await new Promise((resolve) => setTimeout(resolve, esperaMs + 200))

  // Releer estado actual
  const { data: actual } = await supabase
    .from('debounce_pendiente')
    .select('id, mensajes, vence_at')
    .eq('ferreteria_id', ferreteriaId)    // FERRETERÍA AISLADA
    .eq('telefono_cliente', telefonoCliente)
    .maybeSingle()

  if (!actual) {
    // Otro webhook ya la procesó
    return { procesar: false }
  }

  // Si el vence_at actual es POSTERIOR al que nosotros fijamos, otro webhook
  // extendió la ventana (llegó un mensaje nuevo durante nuestra espera).
  // Ese webhook más tardío es responsable de procesar.
  if (actual.vence_at > venceAtNueva) {
    return { procesar: false }
  }

  // Somos el último → consumir la fila y procesar
  const { error: errDelete } = await supabase
    .from('debounce_pendiente')
    .delete()
    .eq('id', actual.id)
    .eq('ferreteria_id', ferreteriaId)    // FERRETERÍA AISLADA

  if (errDelete) {
    console.error('[Debounce] Error al borrar fila:', errDelete.message)
  }

  const mensajesFinales = Array.isArray(actual.mensajes) ? (actual.mensajes as MensajeDebounce[]) : []
  if (mensajesFinales.length === 0) {
    return { procesar: false }
  }

  // Concatenar textos con salto de línea para que el LLM los vea como un solo input
  const textoAcumulado = mensajesFinales.map((m) => m.texto).join('\n')
  const ultimo = mensajesFinales[mensajesFinales.length - 1]

  console.log(`[Debounce] Procesando ${mensajesFinales.length} mensajes acumulados de ${telefonoCliente}`)

  return {
    procesar:              true,
    textoAcumulado,
    ycloudMessageIdUltimo: ultimo.ycloud_message_id,
  }
}

/** Limpieza de filas huérfanas (cron). Borra las que vencieron hace más de 5 minutos. */
export async function limpiarDebounceHuerfano(supabase: SupabaseClient): Promise<number> {
  const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('debounce_pendiente')
    .delete()
    .lt('vence_at', cincoMinAtras)
    .select('id')
  if (error) {
    console.error('[Debounce] Error en limpieza:', error.message)
    return 0
  }
  return data?.length ?? 0
}
