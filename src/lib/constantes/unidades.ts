/**
 * Unidades de medida aceptadas por SUNAT para comprobantes electrónicos.
 * El `code` es el valor que se guarda en BD y se envía a Nubefact.
 * El `label` es lo que ve el usuario en el dashboard y el bot.
 *
 * Fuente: Tabla 6 del Catálogo de Bienes y Servicios SUNAT (UBL 2.1)
 */

export interface UnidadSunat {
  code:  string   // código SUNAT (ej: 'NIU', 'KGM')
  label: string   // nombre en español para el usuario
}

export const UNIDADES_SUNAT: UnidadSunat[] = [
  // ── Más comunes en ferreterías ────────────────────────────────
  { code: 'NIU', label: 'Unidad' },
  { code: 'BX',  label: 'Caja' },
  { code: 'BG',  label: 'Bolsa' },
  { code: 'SAC', label: 'Saco' },
  { code: 'ROL', label: 'Rollo' },
  { code: 'PR',  label: 'Par' },
  { code: 'PK',  label: 'Paquete' },
  { code: 'SET', label: 'Juego / Kit' },
  // ── Longitud ──────────────────────────────────────────────────
  { code: 'MTR', label: 'Metro' },
  { code: 'MTK', label: 'Metro cuadrado' },
  { code: 'MTQ', label: 'Metro cúbico' },
  { code: 'CMT', label: 'Centímetro' },
  // ── Peso ─────────────────────────────────────────────────────
  { code: 'KGM', label: 'Kilogramo' },
  { code: 'GRM', label: 'Gramo' },
  { code: 'TNE', label: 'Tonelada' },
  { code: 'LBR', label: 'Libra' },
  // ── Volumen / Líquido ─────────────────────────────────────────
  { code: 'LTR', label: 'Litro' },
  { code: 'MLT', label: 'Mililitro' },
  { code: 'GLL', label: 'Galón' },
  // ── Servicio / Tiempo ─────────────────────────────────────────
  { code: 'ZZ',  label: 'Servicio' },
  { code: 'HUR', label: 'Hora' },
  { code: 'DAY', label: 'Día' },
]

/** Códigos válidos como Set — para validación rápida */
export const CODIGOS_SUNAT = new Set(UNIDADES_SUNAT.map((u) => u.code))

/** Código por defecto cuando no se puede determinar la unidad */
export const UNIDAD_DEFAULT = 'NIU'

/** Devuelve el label en español de un código SUNAT (o el código si no se encuentra) */
export function labelUnidad(code: string): string {
  return UNIDADES_SUNAT.find((u) => u.code === code)?.label ?? code
}

/**
 * Normaliza cualquier valor al código SUNAT correspondiente.
 * Acepta tanto códigos directos ('NIU') como nombres en español ('unidad').
 * Usado para migrar productos existentes con unidades en español.
 */
export function normalizarUnidad(valor: string | null | undefined): string {
  if (!valor) return UNIDAD_DEFAULT
  const v = valor.trim()

  // Si ya es un código válido, retornarlo directamente
  if (CODIGOS_SUNAT.has(v.toUpperCase())) return v.toUpperCase()

  // Mapeo de nombres en español → código SUNAT
  const mapa: Record<string, string> = {
    'unidad': 'NIU', 'unidades': 'NIU', 'und': 'NIU', 'unid': 'NIU',
    'pza': 'NIU', 'pieza': 'NIU', 'plancha': 'NIU', 'varilla': 'NIU',
    'tubo': 'NIU', 'balde': 'NIU', 'cilindro': 'NIU', 'bidon': 'NIU',
    'caja': 'BX', 'cajas': 'BX',
    'bolsa': 'BG', 'bolsas': 'BG',
    'saco': 'SAC', 'sacos': 'SAC',
    'rollo': 'ROL', 'rollos': 'ROL',
    'par': 'PR', 'pares': 'PR',
    'paquete': 'PK', 'paquetes': 'PK',
    'juego': 'SET', 'kit': 'SET',
    'metro': 'MTR', 'metros': 'MTR', 'm': 'MTR',
    'metro cuadrado': 'MTK', 'm2': 'MTK',
    'metro cubico': 'MTQ', 'metro cúbico': 'MTQ', 'm3': 'MTQ',
    'centimetro': 'CMT', 'centímetro': 'CMT', 'cm': 'CMT',
    'kilo': 'KGM', 'kilos': 'KGM', 'kilogramo': 'KGM', 'kilogramos': 'KGM', 'kg': 'KGM',
    'gramo': 'GRM', 'gramos': 'GRM', 'g': 'GRM', 'gr': 'GRM',
    'tonelada': 'TNE', 'toneladas': 'TNE', 'tn': 'TNE', 'ton': 'TNE',
    'libra': 'LBR', 'libras': 'LBR', 'lb': 'LBR',
    'litro': 'LTR', 'litros': 'LTR', 'l': 'LTR', 'lt': 'LTR',
    'mililitro': 'MLT', 'mililitros': 'MLT', 'ml': 'MLT',
    'galón': 'GLL', 'galon': 'GLL', 'galones': 'GLL',
    'servicio': 'ZZ', 'servicios': 'ZZ', 'serv': 'ZZ',
    'hora': 'HUR', 'horas': 'HUR', 'hr': 'HUR',
    'dia': 'DAY', 'día': 'DAY', 'dias': 'DAY', 'días': 'DAY',
  }

  return mapa[v.toLowerCase()] ?? UNIDAD_DEFAULT
}
