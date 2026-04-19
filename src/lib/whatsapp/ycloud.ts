// Cliente para la API de YCloud — envío de mensajes WhatsApp
// Documentación: https://www.ycloud.com/docs
//
// A partir de ETAPA 1 (SaaS multi-tenant) cada ferretería tiene su propia
// api_key en `configuracion_ycloud`. Las funciones aceptan `apiKey` como
// parámetro opcional; si no se pasa, se usa la variable de entorno global
// (útil en desarrollo local o para migraciones).

const YCLOUD_BASE_URL = 'https://api.ycloud.com/v2'

/** Resuelve la API key a usar: parámetro > variable de entorno */
function resolverApiKey(apiKeyParam?: string): string {
  const key = apiKeyParam ?? process.env.YCLOUD_API_KEY
  if (!key) throw new Error('YCloud API key no configurada')
  return key
}

interface EnviarMensajeParams {
  from: string      // número WhatsApp de la ferretería (sin +)
  to: string        // número WhatsApp del cliente (sin +)
  texto: string
  apiKey?: string   // api_key del tenant — si no se pasa, usa env var
}

interface YCloudMensaje {
  id: string
  from: string
  to: string
  type: string
  status: string
}

// Normaliza número a formato E.164 con + (requerido por YCloud)
function e164(num: string): string {
  const limpio = num.replace(/[^\d]/g, '')
  return `+${limpio}`
}

// Envía un mensaje de texto por WhatsApp vía YCloud
export async function enviarMensaje({
  from,
  to,
  texto,
  apiKey: apiKeyParam,
}: EnviarMensajeParams): Promise<YCloudMensaje> {
  const apiKey = resolverApiKey(apiKeyParam)

  const body = {
    from: e164(from),
    to: e164(to),
    type: 'text',
    text: { body: texto },
  }
  console.log('[YCloud] Enviando mensaje:', JSON.stringify(body))

  const response = await fetch(`${YCLOUD_BASE_URL}/whatsapp/messages/sendDirectly`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
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
  apiKey?: string
}

// Envía un archivo PDF por WhatsApp vía YCloud
export async function enviarDocumento({
  from, to, pdfUrl, filename, caption, apiKey: apiKeyParam,
}: EnviarDocumentoParams): Promise<YCloudMensaje> {
  const apiKey = resolverApiKey(apiKeyParam)

  const response = await fetch(`${YCLOUD_BASE_URL}/whatsapp/messages/sendDirectly`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      from: e164(from),
      to: e164(to),
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

interface EnviarImagenParams {
  from: string
  to: string
  imageUrl: string   // URL pública de la imagen
  caption?: string
  apiKey?: string
}

// Envía una imagen por WhatsApp vía YCloud
export async function enviarImagen({
  from, to, imageUrl, caption, apiKey: apiKeyParam,
}: EnviarImagenParams): Promise<YCloudMensaje> {
  const apiKey = resolverApiKey(apiKeyParam)

  const response = await fetch(`${YCLOUD_BASE_URL}/whatsapp/messages/sendDirectly`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      from: e164(from),
      to: e164(to),
      type: 'image',
      image: {
        link: imageUrl,
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
// webhookSecret: si se pasa, usa ese; si no, busca YCLOUD_WEBHOOK_SECRET del env
export async function verificarFirmaWebhook(
  body: string,
  firma: string | null,
  webhookSecret?: string
): Promise<boolean> {
  const secret = webhookSecret ?? process.env.YCLOUD_WEBHOOK_SECRET
  // Si no hay secret configurado, omitir verificación en desarrollo
  if (!secret) {
    console.warn('[YCloud] webhook secret no configurado — saltando verificación de firma')
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

  const ok = expectedHex === firmaLimpia
  if (!ok) {
    console.error(`[YCloud][FIRMA] esperada=${expectedHex.slice(0, 20)} recibida=${firmaLimpia.slice(0, 20)} secret_prefix=${secretLimpio.slice(0, 6)}`)
  }
  return ok
}

// ── Tipos del payload de YCloud ──────────────────────────────────────────────

export interface YCloudWebhookPayload {
  id: string
  type: string          // 'whatsapp.inbound_message.received'
  createTime?: string
  data?: {
    object?: string
    whatsappMessage?: YCloudInboundMessage          // mensajes de estado (outbound)
    whatsappInboundMessage?: YCloudInboundMessage   // mensajes entrantes
    [key: string]: unknown
  }
  // Formatos alternativos (algunos eventos los envían flat)
  whatsappMessage?: YCloudInboundMessage
  whatsappInboundMessage?: YCloudInboundMessage
  [key: string]: unknown
}

export interface YCloudInboundMessage {
  id: string
  wamid?: string
  from: string          // número del cliente (con código de país, sin +)
  to: string            // número de la ferretería
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'unknown'
  text?: { body: string }
  image?: { id?: string; caption?: string; mimeType?: string; sha256?: string }
  audio?: { id: string; mimeType?: string }
  video?: { id?: string; caption?: string; mimeType?: string }
  document?: { id?: string; filename?: string; caption?: string; mimeType?: string }
  createTime?: string
  timestamp?: number
}

// ── Descarga de media desde YCloud ──────────────────────────────────────────

interface YCloudMediaInfo {
  url: string
  mimeType: string
  fileSize?: number
}

/**
 * Obtiene la URL de descarga de un archivo de media de YCloud.
 * YCloud expone: GET /v2/whatsapp/media/{mediaId}
 */
export async function obtenerUrlMedia(
  mediaId: string,
  apiKeyParam?: string
): Promise<YCloudMediaInfo | null> {
  const apiKey = apiKeyParam ?? process.env.YCLOUD_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(`${YCLOUD_BASE_URL}/whatsapp/media/${mediaId}`, {
      headers: { 'X-API-Key': apiKey },
    })
    if (!res.ok) {
      console.error(`[YCloud] Error obteniendo media ${mediaId}: ${res.status}`)
      return null
    }
    const data = await res.json()
    return {
      url: data.url ?? data.link,
      mimeType: data.mimeType ?? data.mime_type ?? 'application/octet-stream',
      fileSize: data.fileSize ?? data.file_size,
    }
  } catch (e) {
    console.error('[YCloud] Error en obtenerUrlMedia:', e)
    return null
  }
}

/**
 * Descarga el contenido binario de un archivo de media.
 * Primero obtiene la URL de YCloud, luego descarga el archivo.
 * La URL puede ser un pre-signed URL (S3) o una URL autenticada —
 * intentamos sin API key primero, y si falla, con API key.
 */
export async function descargarMedia(
  mediaId: string,
  apiKeyParam?: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const apiKey = apiKeyParam ?? process.env.YCLOUD_API_KEY
  if (!apiKey) return null

  const info = await obtenerUrlMedia(mediaId, apiKey)
  if (!info?.url) {
    console.error(`[YCloud] No se obtuvo URL para media ${mediaId}`)
    return null
  }

  console.log(`[YCloud] Descargando media desde ${info.url.slice(0, 60)}... mimeType=${info.mimeType}`)

  // Intentar sin API key primero (para pre-signed URLs tipo S3)
  try {
    const res = await fetch(info.url)
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      console.log(`[YCloud] Media descargada OK: ${buffer.length} bytes`)
      return { buffer, mimeType: info.mimeType }
    }
    console.warn(`[YCloud] Descarga sin auth falló (${res.status}), reintentando con API key...`)
  } catch (e) {
    console.warn('[YCloud] Descarga sin auth lanzó error, reintentando con API key:', e)
  }

  // Fallback: intentar con X-API-Key (para URLs que requieren autenticación)
  try {
    const res = await fetch(info.url, {
      headers: { 'X-API-Key': apiKey },
    })
    if (!res.ok) {
      console.error(`[YCloud] Error descargando media con auth: ${res.status}`)
      return null
    }
    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[YCloud] Media descargada con auth OK: ${buffer.length} bytes`)
    return { buffer, mimeType: info.mimeType }
  } catch (e) {
    console.error('[YCloud] Error descargando buffer de media:', e)
    return null
  }
}

// Extrae el mensaje entrante del payload (prueba todos los campos posibles de YCloud)
export function extraerMensaje(payload: YCloudWebhookPayload): YCloudInboundMessage | null {
  // Intentar todos los campos conocidos de YCloud (anidado y flat)
  const msg =
    payload.data?.whatsappInboundMessage ??
    payload.data?.whatsappMessage ??
    payload.whatsappInboundMessage ??
    payload.whatsappMessage ??
    null

  if (!msg) {
    // Log diagnóstico: mostrar claves reales del payload para entender la estructura
    const keysTop = Object.keys(payload)
    const keysData = payload.data ? Object.keys(payload.data) : []
    console.warn('[YCloud] extraerMensaje: no encontrado. Keys top:', keysTop, 'Keys data:', keysData)
  }

  return msg as YCloudInboundMessage | null
}
