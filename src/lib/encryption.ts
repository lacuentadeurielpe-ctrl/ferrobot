/**
 * Encriptación AES-256-GCM para tokens sensibles de tenants.
 *
 * Los tokens de YCloud y Mercado Pago se guardan encriptados en la BD.
 * La clave de encriptación vive solo en las variables de entorno del servidor.
 *
 * Formato del texto encriptado almacenado en BD:
 * "iv_hex:authTag_hex:datos_hex"
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

/** Importa la ENCRYPTION_KEY del entorno como CryptoKey */
async function getKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY no configurada en variables de entorno')

  // La key puede ser hex de 64 chars (32 bytes) o base64
  let keyBytes: Uint8Array
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    // Hex
    keyBytes = new Uint8Array(
      raw.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    )
  } else {
    // Base64
    const decoded = atob(raw)
    keyBytes = new Uint8Array(decoded.split('').map((c) => c.charCodeAt(0)))
  }

  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encripta un texto plano.
 * @returns string en formato "iv:authTag:ciphertext" (todo en hex)
 */
export async function encriptar(texto: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96 bits para GCM
  const encoder = new TextEncoder()

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(texto)
  )

  // AES-GCM devuelve ciphertext + authTag (16 bytes al final)
  const encryptedBytes = new Uint8Array(encrypted)
  const ciphertext = encryptedBytes.slice(0, -16)
  const authTag    = encryptedBytes.slice(-16)

  const toHex = (buf: Uint8Array) =>
    Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')

  return `${toHex(iv)}:${toHex(authTag)}:${toHex(ciphertext)}`
}

/**
 * Desencripta un texto en formato "iv:authTag:ciphertext".
 * @returns texto plano original
 */
export async function desencriptar(textoEncriptado: string): Promise<string> {
  const key = await getKey()
  const partes = textoEncriptado.split(':')
  if (partes.length !== 3) throw new Error('Formato de texto encriptado inválido')

  const [ivHex, authTagHex, ciphertextHex] = partes

  const fromHex = (hex: string) =>
    new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

  const iv         = fromHex(ivHex)
  const authTag    = fromHex(authTagHex)
  const ciphertext = fromHex(ciphertextHex)

  // Reconstituir ciphertext + authTag como lo espera AES-GCM
  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    combined
  )

  return new TextDecoder().decode(decrypted)
}

/**
 * Genera una clave aleatoria de 256 bits en formato hex.
 * Útil para generar la ENCRYPTION_KEY inicial.
 * Solo para uso en scripts de setup — no en producción.
 */
export function generarClaveAleatoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
