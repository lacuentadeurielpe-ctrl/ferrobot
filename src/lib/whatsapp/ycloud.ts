// Cliente para la API de YCloud — envío de mensajes WhatsApp
// Documentación: https://www.ycloud.com/docs

const YCLOUD_BASE_URL = 'https://api.ycloud.com/v2'

interface EnviarMensajeParams {
  from: string   // número WhatsApp de la ferretería
  to: string     // número WhatsApp del cliente
  texto: string
}

interface YCloudMensaje {
  id: string
  from: string
  to: string
  type: string
  status: string
}

// Envía un mensaje de texto por WhatsApp vía YCloud
export async function enviarMensaje({ from, to, texto }: EnviarMensajeParams): Promise<YCloudMensaje> {
  const apiKey = process.env.YCLOUD_API_KEY
  if (!apiKey) throw new Error('YCLOUD_API_KEY no configurado')

  const response = await fetch(`${YCLOUD_BASE_URL}/whatsapp/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      from,
      to,
      type: 'text',
      text: { body: texto },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`YCloud error ${response.status}: ${error}`)
  }

  return response.json()
}

interface EnviarDocumentoParams {
  from: string      // número WhatsApp de la ferretería
  to: string        // número WhatsApp del cliente
  pdfUrl: string    // URL pública del PDF en Supabase Storage
  filename: string  // nombre del archivo, ej: CP-000001.pdf
  caption?: string  // texto opcional junto al documento
}

// Envía un archivo PDF por WhatsApp vía YCloud
export async function enviarDocumento({
  from, to, pdfUrl, filename, caption,
}: EnviarDocumentoParams): Promise<YCloudMensaje> {
  const apiKey = process.env.YCLOUD_API_KEY
  if (!apiKey) throw new Error('YCLOUD_API_KEY no configurado')

  const response = await fetch(`${YCLOUD_BASE_URL}/whatsapp/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      from,
      to,
      type: 'document',
      document: {
        link: pdfUrl,
        filename,
        ...(caption ? { caption } : {}),
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`YCloud error ${response.status}: ${error}`)
  }

  return response.json()
}

// Verifica la firma HMAC-SHA256 del webhook de YCloud
// Header: x-ycloud-signature
export async function verificarFirmaWebhook(
  body: string,
  firma: string | null
): Promise<boolean> {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET
  // Si no hay secret configurado, omitir verificación en desarrollo
  if (!secret) {
    console.warn('[YCloud] YCLOUD_WEBHOOK_SECRET no configurado — saltando verificación de firma')
    return true
  }
  if (!firma) return false

  const encoder = new TextEncoder()

  // Quitar prefijo "whsec_" si existe (formato YCloud)
  const secretLimpio = secret.replace(/^whsec_/, '')

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretLimpio),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expectedHex = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // YCloud puede enviar la firma con o sin el prefijo "sha256="
  const firmaLimpia = firma.replace(/^sha256=/, '')

  console.log(`[YCloud] Firma esperada: ${expectedHex.slice(0, 16)}... recibida: ${firmaLimpia.slice(0, 16)}...`)

  return expectedHex === firmaLimpia
}

// ── Tipos del payload de YCloud ──────────────────────────────────────────────

export interface YCloudWebhookPayload {
  id: string
  type: string          // 'whatsapp.inbound_message.received'
  createTime?: string
  data?: {
    object?: string
    whatsappMessage?: YCloudInboundMessage
  }
  // Formato alternativo (algunos eventos lo envían flat)
  whatsappMessage?: YCloudInboundMessage
}

export interface YCloudInboundMessage {
  id: string
  wamid?: string
  from: string          // número del cliente (con código de país, sin +)
  to: string            // número de la ferretería
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'unknown'
  text?: { body: string }
  image?: { caption?: string }
  audio?: { id: string }
  createTime?: string
  timestamp?: number
}

// Extrae el mensaje entrante del payload (maneja ambos formatos de YCloud)
export function extraerMensaje(payload: YCloudWebhookPayload): YCloudInboundMessage | null {
  // Formato anidado
  if (payload.data?.whatsappMessage) return payload.data.whatsappMessage
  // Formato flat
  if (payload.whatsappMessage) return payload.whatsappMessage
  return null
}
