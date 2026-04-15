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
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_preparacion: 'En preparación',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  }
  return labels[estado] ?? estado
}

// Devuelve color Tailwind para el badge de estado de pedido
export function colorEstadoPedido(estado: string): string {
  const colores: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    confirmado: 'bg-blue-100 text-blue-800',
    en_preparacion: 'bg-orange-100 text-orange-800',
    enviado: 'bg-purple-100 text-purple-800',
    entregado: 'bg-green-100 text-green-800',
    cancelado: 'bg-red-100 text-red-800',
  }
  return colores[estado] ?? 'bg-gray-100 text-gray-800'
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
