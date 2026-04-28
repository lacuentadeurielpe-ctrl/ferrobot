// F2: Compaction de historial largo
//
// Cuando una conversación supera un umbral, resumimos los mensajes viejos
// con una llamada barata a DeepSeek y guardamos el resumen en
// conversaciones.resumen_contexto. La próxima vez que el bot responda,
// pasamos ese resumen como contexto y solo los últimos N mensajes frescos.
//
// Cost/benefit: una llamada extra cada N mensajes (cacheada) vs. arrastrar
// un historial grande en cada turno (caro y ruidoso).

import type { SupabaseClient } from '@supabase/supabase-js'

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const UMBRAL_MENSAJES = 20
const MANTENER_RECIENTES = 12

interface MensajeHistorial {
  role: 'cliente' | 'bot' | 'dueno'
  contenido: string
}

/**
 * Si el historial es largo, genera un resumen de los mensajes viejos y lo guarda.
 * Devuelve los mensajes a pasarle al modelo: el resumen (si hay) + los recientes.
 */
export async function aplicarCompaction(
  supabase: SupabaseClient,
  conversacionId: string,
  ferreteriaId: string,
  historialCompleto: MensajeHistorial[],
  resumenPrevio: string | null
): Promise<{
  mensajesRecientes: MensajeHistorial[]
  resumenContexto: string | null
}> {
  // Historial corto → no compactar
  if (historialCompleto.length < UMBRAL_MENSAJES) {
    return { mensajesRecientes: historialCompleto, resumenContexto: resumenPrevio }
  }

  const recientes = historialCompleto.slice(-MANTENER_RECIENTES)
  const aResumir = historialCompleto.slice(0, -MANTENER_RECIENTES)

  try {
    const resumen = await generarResumen(aResumir, resumenPrevio)
    if (resumen) {
      // Guardar en la conversación (FERRETERÍA AISLADA: por ID único + filtro)
      await supabase
        .from('conversaciones')
        .update({
          resumen_contexto: resumen,
          resumen_actualizado_hasta: new Date().toISOString(),
        })
        .eq('id', conversacionId)
        .eq('ferreteria_id', ferreteriaId)
      return { mensajesRecientes: recientes, resumenContexto: resumen }
    }
  } catch (e) {
    console.error('[Compaction] Falló — usando historial completo:', e)
  }

  return { mensajesRecientes: recientes, resumenContexto: resumenPrevio }
}

async function generarResumen(
  mensajes: MensajeHistorial[],
  resumenPrevio: string | null
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  const transcript = mensajes
    .map((m) => `${m.role === 'cliente' ? 'Cliente' : m.role === 'bot' ? 'Bot' : 'Dueño'}: ${m.contenido}`)
    .join('\n')

  const systemPrompt = resumenPrevio
    ? `Tienes un resumen previo de una conversación de WhatsApp entre un cliente y un negocio. Actualízalo con los nuevos mensajes. Máximo 6 líneas, en viñetas, enfocándote en: productos pedidos/cotizados, números de pedido, datos del cliente (nombre, zona, modalidad), y decisiones clave. No inventes nada.

Resumen previo:
${resumenPrevio}

Nuevos mensajes a incorporar:
${transcript}`
    : `Resume esta conversación de WhatsApp entre un cliente y un negocio en máximo 6 líneas en viñetas. Incluye: productos pedidos/cotizados, números de pedido, datos del cliente (nombre, zona, modalidad), decisiones clave. No inventes nada — solo lo que aparece en el transcript.

Transcript:
${transcript}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.2,
        max_tokens: 350,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) return null
    const data = await response.json()
    const contenido = data.choices?.[0]?.message?.content?.trim()
    return contenido || null
  } catch {
    clearTimeout(timer)
    return null
  }
}
