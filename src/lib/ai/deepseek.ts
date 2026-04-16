// Cliente DeepSeek — compatible con el formato OpenAI chat completions
// El modelo retorna JSON estructurado para que el servidor ejecute acciones

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const MODEL = 'deepseek-chat'
const MAX_RETRIES = 2
const TIMEOUT_MS = 25_000 // 25s — dentro del límite de Vercel

// ── Tipos de intents que el bot puede detectar ───────────────────────────────

export type IntentBot =
  | 'cotizacion'
  | 'confirmar_pedido'
  | 'recopilar_datos_pedido'
  | 'orden_completa'
  | 'rechazar_cotizacion'
  | 'modificar_pedido'
  | 'atencion_cliente'
  | 'faq_horario'
  | 'faq_direccion'
  | 'faq_delivery'
  | 'faq_pagos'
  | 'estado_pedido'
  | 'solicitar_comprobante'
  | 'saludo'
  | 'pedir_humano'
  | 'desconocido'

export interface ItemSolicitado {
  nombre_buscado: string
  cantidad: number
}

export interface DatosPedidoAI {
  nombre_cliente?: string
  modalidad?: 'delivery' | 'recojo'
  direccion_entrega?: string
  zona_nombre?: string
}

// Respuesta estructurada que retorna DeepSeek
export interface RespuestaAI {
  intent: IntentBot
  respuesta: string
  items_solicitados?: ItemSolicitado[]
  numero_pedido?: string
  datos_pedido?: DatosPedidoAI
}

interface MensajeChat {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Llama a DeepSeek con reintentos automáticos en caso de error
export async function llamarDeepSeek(mensajes: MensajeChat[]): Promise<RespuestaAI> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurado')

  let ultimoError: Error | null = null

  for (let intento = 0; intento <= MAX_RETRIES; intento++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: mensajes,
          response_format: { type: 'json_object' },
          temperature: 0.3,      // baja temperatura para respuestas más consistentes
          max_tokens: 1500,
        }),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`DeepSeek error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const contenido = data.choices?.[0]?.message?.content

      if (!contenido) throw new Error('DeepSeek retornó respuesta vacía')

      // Parsear el JSON retornado por el modelo
      const parsed = JSON.parse(contenido) as RespuestaAI

      // Validación básica de la estructura
      if (!parsed.intent || !parsed.respuesta) {
        throw new Error('Respuesta de AI con formato inválido')
      }

      return parsed
    } catch (error) {
      ultimoError = error instanceof Error ? error : new Error(String(error))
      console.error(`[DeepSeek] Intento ${intento + 1} fallido:`, ultimoError.message)

      if (intento < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (intento + 1)))
      }
    }
  }

  // Si todos los reintentos fallaron, lanzar el error
  throw ultimoError ?? new Error('DeepSeek no disponible')
}
