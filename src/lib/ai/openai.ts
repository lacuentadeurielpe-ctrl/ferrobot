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
  tipo: 'lista_productos' | 'producto_individual' | 'consulta' | 'otro'
  descripcion: string  // respuesta en lenguaje natural para el cliente
  productosDetectados?: Array<{ nombre: string; cantidad?: number; precio?: number }>
}

/**
 * Analiza una imagen con GPT-4o Vision.
 * Detecta si es una lista de productos, una foto de producto, o algo genérico.
 * Retorna un análisis estructurado para que el bot pueda responder apropiadamente.
 */
export async function analizarImagen(
  buffer: Buffer,
  mimeType: string,
  contextoNegocio?: string
): Promise<AnalisisImagen | null> {
  const apiKey = getKey()
  if (!apiKey) return null

  const base64 = buffer.toString('base64')
  const imageUrl = `data:${mimeType};base64,${base64}`

  const systemPrompt = `Eres el asistente de una ferretería peruana.
Analiza la imagen que te envía el cliente y determina:
1. Si es una LISTA DE PRODUCTOS (cotización, lista de compras, pedido escrito a mano, captura de otra cotización)
2. Si es la FOTO DE UN PRODUCTO (para saber qué es, pedir precio, o identificarlo)
3. Si es una CONSULTA sobre instalación, daño, medida, etc.
4. Otro contenido

${contextoNegocio ? `Contexto de la ferretería: ${contextoNegocio}` : ''}

Responde SOLO en JSON con este formato exacto:
{
  "tipo": "lista_productos" | "producto_individual" | "consulta" | "otro",
  "descripcion": "respuesta en español peruano natural y amigable para el cliente (máx 200 chars)",
  "productosDetectados": [{"nombre": "...", "cantidad": 2, "precio": 15.50}]  // solo si tipo=lista_productos
}`

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
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
