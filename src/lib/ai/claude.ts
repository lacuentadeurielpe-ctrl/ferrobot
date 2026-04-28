/**
 * Cliente Claude (Anthropic) para situaciones complejas del bot.
 *
 * Solo se activa cuando ANTHROPIC_API_KEY está configurada.
 * El bot llama a Claude cuando DeepSeek detecta una situación que
 * supera su capacidad: negociaciones largas, quejas, emergencias, etc.
 */

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const MODEL = 'claude-3-5-sonnet-20241022'
const MAX_TOKENS = 1024
const TIMEOUT_MS = 28_000

export function claudeDisponible(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

interface MensajeClaudeChat {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Llama a Claude con un system prompt y un historial de mensajes.
 * @returns Texto de respuesta (no JSON — respuesta directa al cliente)
 */
export async function llamarClaude(
  systemPrompt: string,
  mensajes: MensajeClaudeChat[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado')

  // Asegurar que mensajes no empiece con 'assistant' (Anthropic lo rechaza)
  const mensajesValidos = mensajes.length > 0
    ? mensajes
    : [{ role: 'user' as const, content: 'Hola' }]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     systemPrompt,
        messages:   mensajesValidos,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    const texto = data.content?.[0]?.text ?? ''

    if (!texto) throw new Error('Claude retornó respuesta vacía')

    // Datos de uso para logging (tokens)
    const inputTokens  = data.usage?.input_tokens  ?? 0
    const outputTokens = data.usage?.output_tokens ?? 0
    console.log(`[Claude] tokens — entrada:${inputTokens} salida:${outputTokens}`)

    return texto
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

/**
 * System prompt especializado para Claude en situaciones complejas.
 * Claude toma el contexto de la conversación y produce una respuesta empática y resolutiva.
 */
export function buildSystemPromptClaude(params: {
  nombreFerreteria: string
  tipoNegocio?: string | null
  nombreCliente: string | null
  contextoResumen: string
}): string {
  const { nombreFerreteria, tipoNegocio, nombreCliente, contextoResumen } = params
  const cliente    = nombreCliente ? `El cliente se llama ${nombreCliente}.` : ''
  const tipo       = tipoNegocio?.trim() || 'negocio'

  return `Eres el asistente virtual de *${nombreFerreteria}*, ${tipo} de confianza en Perú.
${cliente}

Esta es una situación compleja que requiere atención especial. Tu misión:
1. Responder con EMPATÍA y PROFESIONALISMO
2. Buscar una solución concreta al problema del cliente
3. Si no puedes resolver el problema directamente, ofrecer escalar con el dueño
4. Mantener el tono cálido y peruano del negocio

Contexto de la conversación:
${contextoResumen}

Reglas:
- Responde SOLO en español
- Máximo 3-4 párrafos
- No uses emojis excesivos
- No inventes precios ni productos — deja eso al dueño
- Si el cliente está frustrado, reconoce el inconveniente antes de resolver`
}
