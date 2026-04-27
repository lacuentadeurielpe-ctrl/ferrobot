/**
 * pin.ts — utilidades para PIN de empleados.
 *
 * Usa crypto nativo de Node.js (sin bcryptjs) con PBKDF2.
 * El PIN se almacena como: `pbkdf2$<iterations>$<salt>$<hash>`
 */
import crypto from 'crypto'

const ITERATIONS = 100_000
const KEYLEN     = 64
const DIGEST     = 'sha512'
const PREFIX     = 'pbkdf2'

/** Genera el hash almacenable de un PIN de 4 dígitos */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .pbkdf2Sync(pin, salt, ITERATIONS, KEYLEN, DIGEST)
    .toString('hex')
  return `${PREFIX}$${ITERATIONS}$${salt}$${hash}`
}

/** Verifica un PIN contra el hash almacenado. Retorna true si coincide. */
export function verifyPin(pin: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== PREFIX) return false
    const [, itersStr, salt, expectedHash] = parts
    const iters = parseInt(itersStr, 10)
    const hash = crypto
      .pbkdf2Sync(pin, salt, iters, KEYLEN, DIGEST)
      .toString('hex')
    // Comparación de tiempo constante para evitar timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    )
  } catch {
    return false
  }
}

/** Valida que el PIN tenga exactamente 4 dígitos numéricos */
export function pinValido(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}
