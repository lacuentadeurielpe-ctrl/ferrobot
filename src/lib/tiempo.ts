// Utilidades de zona horaria para Lima (UTC-5, sin horario de verano)
// Módulo central — importar desde aquí, nunca duplicar la lógica

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000 // Lima = UTC-5

/**
 * "Ahora" en Lima representado como Date donde getUTC*() devuelve la hora Lima.
 * Útil para manipular fecha/hora Lima con métodos UTC estándar.
 */
export function ahoraLima(): Date {
  return new Date(Date.now() - LIMA_OFFSET_MS)
}

/**
 * Fecha Lima como string "YYYY-MM-DD".
 * offsetDias=0 → hoy, -1 → ayer, 1 → mañana
 */
export function fechaLimaStr(offsetDias = 0): string {
  const d = ahoraLima()
  d.setUTCDate(d.getUTCDate() + offsetDias)
  const yyyy = d.getUTCFullYear()
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * ISO UTC del inicio de un día Lima.
 * Medianoche Lima (00:00 Lima) = 05:00 UTC.
 * offsetDias=0 → inicio de hoy, -1 → inicio de ayer
 */
export function inicioDiaLima(offsetDias = 0): string {
  return `${fechaLimaStr(offsetDias)}T05:00:00Z`
}

/**
 * ISO UTC del fin exclusivo de un día Lima.
 * = inicio del día siguiente (para usar con .lt() en queries)
 */
export function finDiaLima(offsetDias = 0): string {
  return inicioDiaLima(offsetDias + 1)
}

/**
 * Convierte una fecha Lima "YYYY-MM-DD" en límites UTC para queries.
 * Útil cuando la fecha viene del frontend (ya expresada en Lima).
 */
export function limaDiaAUTC(limaDateStr: string): { inicio: string; fin: string } {
  const inicio = `${limaDateStr}T05:00:00Z`
  const d = new Date(inicio)
  d.setUTCDate(d.getUTCDate() + 1)
  // Formato limpio sin milisegundos
  const fin = d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { inicio, fin }
}

/**
 * Convierte un ISO UTC a fecha Lima "YYYY-MM-DD".
 * Útil para agrupar registros por día Lima en el frontend.
 */
export function fechaLocalLima(isoUtc: string): string {
  const d    = new Date(isoUtc)
  const lima = new Date(d.getTime() - LIMA_OFFSET_MS)
  const yyyy = lima.getUTCFullYear()
  const mm   = String(lima.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(lima.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Etiqueta legible de la fecha actual en Lima.
 * Ej: "lunes, 17 de abril de 2026"
 */
export function etiquetaFechaLima(): string {
  return new Date().toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
}
