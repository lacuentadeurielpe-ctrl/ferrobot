import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Combina clases Tailwind evitando conflictos
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatea un número como moneda peruana (S/ 1,250.00)
export function formatPEN(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount)
}

// Formatea una fecha en español peruano
export function formatFecha(date: string | Date, opciones?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opciones,
  })
}

// Formatea hora en formato 12h desde string HH:MM (ej: 9:00 AM)
export function formatHora(time: string | null): string {
  if (!time) return '—'
  // Si es una fecha ISO completa, extraer la parte de hora
  const d = new Date(time)
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const h = hours % 12 || 12
  return `${h}:${minutes.toString().padStart(2, '0')} ${period}`
}

// Devuelve etiqueta legible del estado de un pedido
export function labelEstadoPedido(estado: string): string {
  const labels: Record<string, string> = {
    programado:     'Programado',
    pendiente:      'Pendiente',
    confirmado:     'Confirmado',
    en_preparacion: 'En preparación',
    enviado:        'En camino',   // "En camino" — más claro que "Enviado"
    entregado:      'Entregado',
    cancelado:      'Cancelado',
  }
  return labels[estado] ?? estado
}

// Devuelve color Tailwind para el badge de estado de pedido
export function colorEstadoPedido(estado: string): string {
  const colores: Record<string, string> = {
    programado:     'bg-indigo-100 text-indigo-700',
    pendiente:      'bg-yellow-100 text-yellow-800',
    confirmado:     'bg-blue-100 text-blue-800',
    en_preparacion: 'bg-orange-100 text-orange-800',
    enviado:        'bg-purple-100 text-purple-800',
    entregado:      'bg-green-100 text-green-800',
    cancelado:      'bg-red-100 text-red-800',
  }
  return colores[estado] ?? 'bg-gray-100 text-gray-800'
}

/**
 * Formatea una fecha ISO UTC como fecha+hora en zona Lima.
 * Ej: "sáb 3 may · 3:00 PM"
 */
export function formatFechaHoraLima(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  true,
  })
}

// ── Estado de pago — compartido por dashboard, panel repartidor y bot ─────────

// Devuelve etiqueta legible del estado de pago de un pedido
export function labelEstadoPago(estado: string): string {
  const labels: Record<string, string> = {
    pendiente:           'Sin pago',
    verificando:         'Verificando',
    pagado:              'Pagado',
    credito_activo:      'Deuda activa',
    credito_vencido:     'Deuda vencida',
    reembolso_pendiente: 'Reembolso',
  }
  return labels[estado] ?? estado
}

// Devuelve clases Tailwind para el badge de estado de pago
export function colorEstadoPago(estado: string): string {
  const colores: Record<string, string> = {
    pendiente:           'bg-zinc-100 text-zinc-500',
    verificando:         'bg-amber-100 text-amber-700',
    pagado:              'bg-green-100 text-green-700',
    credito_activo:      'bg-orange-100 text-orange-700',
    credito_vencido:     'bg-red-100 text-red-600',
    reembolso_pendiente: 'bg-purple-100 text-purple-700',
  }
  return colores[estado] ?? 'bg-zinc-100 text-zinc-500'
}

// Obtiene las iniciales de un nombre (para avatares)
export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

// Trunca texto largo con puntos suspensivos
export function truncar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return texto.slice(0, max) + '…'
}

// ── Utilidad de timeout para promesas ────────────────────────────────────────
// Rechaza con Error('timeout_Nms') si la promesa no resuelve en `ms` milisegundos.
// Usada en el orquestador para aislar tools lentas y en llamadas a APIs externas.
export function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms)
    ),
  ])
}

// ── Búsqueda difusa inteligente ──────────────────────────────────────────────

function getLevenshteinDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 999
  const tmp: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return tmp[a.length][b.length]
}

export function normalizeSearchText(text: string): string {
  if (!text) return ''
  let normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
  
  // Reemplazar pulgadas y medidas comunes por representaciones canónicas
  normalized = normalized
    .replace(/["”“]/g, ' " ')
    .replace(/\bpulgadas?\b/g, ' " ')
    .replace(/\bmedia\b/g, ' 1/2 ')
    .replace(/\bun cuarto\b/g, ' 1/4 ')
    .replace(/\btres cuartos\b/g, ' 3/4 ')
    // Quitar signos de puntuación extraños manteniendo / " ' para medidas
    .replace(/[-_.,;:()*+º°]/g, ' ')

  return normalized.trim()
}

const STOP_WORDS = new Set(['de', 'con', 'en', 'para', 'un', 'la', 'el', 'los', 'las', 'y', 'x'])

export function matchesFuzzy(target: string, query: string): boolean {
  if (!query) return true
  const normQuery = normalizeSearchText(query)
  const normTarget = normalizeSearchText(target)

  const queryTokens = normQuery.split(/\s+/).filter(t => t.length > 0)
  const targetTokens = normTarget.split(/\s+/).filter(t => t.length > 0)

  if (queryTokens.length === 0) return true

  // Ignorar stop words si la búsqueda tiene múltiples palabras
  const filteredQueryTokens = queryTokens.length > 1
    ? queryTokens.filter(t => !STOP_WORDS.has(t))
    : queryTokens

  for (const qToken of filteredQueryTokens) {
    let tokenMatched = false

    for (const tToken of targetTokens) {
      // Coincidencia de prefijo (evita falsos positivos como que "1/2" coincida con "2")
      if (tToken.startsWith(qToken)) {
        tokenMatched = true
        break
      }

      // Coincidencia difusa por distancia Levenshtein
      if (qToken.length >= 4 && tToken.length >= 4) {
        const maxDist = qToken.length >= 6 ? 2 : 1
        if (getLevenshteinDistance(qToken, tToken) <= maxDist) {
          tokenMatched = true
          break
        }
      }
    }

    if (!tokenMatched) return false
  }

  return true
}

