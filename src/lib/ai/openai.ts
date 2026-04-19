// Cliente OpenAI para procesamiento de audio (Whisper) e imágenes (Vision)
// Solo activo si OPENAI_API_KEY está configurado

const OPENAI_BASE = 'https://api.openai.com/v1'

function getKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null
}

// ── Audio → Texto (Whisper) ──────────────────────────────────────────────────

/**
 * Transcribe un audio usando OpenAI Whisper.
 * Recibe el buffer del archivo de audio y su mime type.
 * Retorna el texto transcrito, o null si falla o no hay API key.
 */
export async function transcribirAudio(
  buffer: Buffer,
  mimeType: string,
  idioma = 'es'
): Promise<string | null> {
  const apiKey = getKey()
  if (!apiKey) return null

  // Determinar extensión por mime type
  const ext = mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : 'ogg'  // WhatsApp por defecto envía ogg/opus

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', idioma)
  form.append('response_format', 'text')

  try {
    const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[OpenAI] Error Whisper:', res.status, err)
      return null
    }

    const texto = await res.text()
    return texto.trim() || null
  } catch (e) {
    console.error('[OpenAI] Error en transcribirAudio:', e)
    return null
  }
}

// ── Imagen → Análisis (GPT-4o Vision) ────────────────────────────────────────

export interface AnalisisImagen {
  tipo: 'lista_productos' | 'producto_individual' | 'comprobante_pago' | 'consulta' | 'otro'
  descripcion: string
  productosDetectados?: Array<{ nombre: string; cantidad?: number; precio?: number }>
  // Only present when tipo === 'comprobante_pago'
  pago?: {
    monto: number | null          // numeric amount extracted (e.g. 150.00)
    destinatario: string | null   // recipient name/number
    operacion_id: string | null   // operation/transaction ID
    fecha: string | null          // date string as shown in screenshot
  }
}

/**
 * Analiza una imagen con GPT-4o-mini Vision.
 * Detecta si es una lista de productos, una foto de producto, comprobante de pago o algo genérico.
 * Retorna un análisis estructurado para que el bot pueda responder apropiadamente.
 */
export async function analizarImagen(
  buffer: Buffer,
  mimeType: string,
): Promise<AnalisisImagen | null> {
  const apiKey = getKey()
  if (!apiKey) return null

  const base64 = buffer.toString('base64')
  const imageUrl = `data:${mimeType};base64,${base64}`

  const systemPrompt = `Eres el asistente de una ferretería peruana. Analiza la imagen del cliente.

Determina cuál de estos tipos es:
1. LISTA_PRODUCTOS: cotización escrita, lista de compras, captura de lista, pedido escrito
2. PRODUCTO_INDIVIDUAL: foto de un producto para identificar, pedir precio o consultar
3. COMPROBANTE_PAGO: captura de pago Yape, Plin, transferencia bancaria, depósito, BCP, Interbank, BBVA, etc.
4. CONSULTA: foto de instalación, daño, medida, plano, obra
5. OTRO: selfie, paisaje, meme, nada relevante para la ferretería

Responde SOLO en JSON:
{
  "tipo": "lista_productos" | "producto_individual" | "comprobante_pago" | "consulta" | "otro",
  "descripcion": "respuesta amigable en español peruano para el cliente (máx 150 chars)",
  "productosDetectados": [{"nombre": "...", "cantidad": 2}],  // solo si tipo=lista_productos
  "pago": {
    "monto": 150.00,               // número extraído del comprobante, null si no se ve
    "destinatario": "...",         // nombre o número del destinatario, null si no se ve
    "operacion_id": "...",         // código de operación/transacción, null si no se ve
    "fecha": "..."                 // fecha tal como aparece, null si no se ve
  }  // solo si tipo=comprobante_pago
}`

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
              { type: 'text', text: 'Analiza esta imagen del cliente.' },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[OpenAI] Error Vision:', res.status, err)
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    return JSON.parse(content) as AnalisisImagen
  } catch (e) {
    console.error('[OpenAI] Error en analizarImagen:', e)
    return null
  }
}

// ── Disponibilidad ────────────────────────────────────────────────────────────

export function openAIDisponible(): boolean {
  return !!getKey()
}
