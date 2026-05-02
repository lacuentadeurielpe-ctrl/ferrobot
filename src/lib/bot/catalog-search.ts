// Búsqueda de productos en el catálogo y construcción de cotizaciones
import type { Producto, ReglaDescuento, UnidadProducto } from '@/types/database'
import type { ItemSolicitado } from '@/lib/ai/deepseek'
import { formatPEN } from '@/lib/utils'

export interface ResultadoBusqueda {
  nombre_buscado: string
  cantidad: number
  producto: Producto | null      // null = no encontrado en catálogo
  precio_unitario: number
  precio_original: number
  subtotal: number
  disponible: boolean
  stock_disponible: number
  nota: string | null
  requiere_aprobacion: boolean
  modo_aplicado: 'base' | 'descuento' | 'negociacion'
  // Unidad alternativa aplicada (si el cliente pidió por lata, m³, etc.)
  unidad_alternativa?: UnidadProducto
}

// Normaliza texto: minúsculas, sin tildes, solo alfanumérico+espacios
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quitar diacríticos (tildes, etc.)
    .replace(/[^a-z0-9\s]/g, ' ')      // no-alfanumérico → espacio (ej: "3/8" → "3 8")
    .replace(/\s+/g, ' ')
    .trim()
}

// Divide texto en tokens (≥2 chars — incluye "38" de "3/8", "1a", etc.)
function tokenizar(texto: string): string[] {
  return texto.split(/\s+/).filter((t) => t.length >= 2)
}

// Coincidencia de token con soporte plural/singular básico en español
function matchToken(token: string, texto: string): boolean {
  if (texto.includes(token)) return true
  // "ladrillos" → "ladrillo" (-s)
  if (token.endsWith('s') && token.length > 3 && texto.includes(token.slice(0, -1))) return true
  // "paredes" → "pared" (-es)
  if (token.endsWith('es') && token.length > 4 && texto.includes(token.slice(0, -2))) return true
  return false
}

// Busca un producto en el catálogo por nombre — 4 niveles de fuzzy matching
export function buscarProducto(nombreBuscado: string, productos: Producto[]): Producto | null {
  const termino = normalizar(nombreBuscado)
  if (!termino) return null

  // 1. Coincidencia exacta normalizada
  const exacto = productos.find((p) => normalizar(p.nombre) === termino)
  if (exacto) return exacto

  // 2. El nombre del catálogo contiene el término completo
  const contiene = productos.find((p) => normalizar(p.nombre).includes(termino))
  if (contiene) return contiene

  // 3. El término contiene el nombre del catálogo (cliente dice más de lo que está en catálogo)
  const invertido = productos.find((p) => termino.includes(normalizar(p.nombre)))
  if (invertido) return invertido

  // 4. Scoring por tokens — funciona con 1 o más tokens, con plural/singular
  const tokensTermino = tokenizar(termino)
  if (tokensTermino.length === 0) return null

  let mejorMatch: Producto | null = null
  let mejorScore = 0

  for (const p of productos) {
    const nombNorm = normalizar(p.nombre)
    const coincidencias = tokensTermino.filter((t) => matchToken(t, nombNorm))
    if (coincidencias.length === 0) continue
    const score = coincidencias.length / tokensTermino.length
    if (score > mejorScore) { mejorScore = score; mejorMatch = p }
  }

  // Aceptar si ≥50% de tokens coinciden, o si era una búsqueda de 1 solo token
  if (mejorMatch && (mejorScore >= 0.5 || tokensTermino.length === 1)) return mejorMatch

  return null
}

// Determina el precio aplicable según cantidad y reglas de descuento
function calcularPrecio(
  producto: Producto,
  cantidad: number
): {
  precio_unitario: number
  requiere_aprobacion: boolean
  modo: 'base' | 'descuento' | 'negociacion'
  nota: string | null
} {
  const reglas = (producto.reglas_descuento ?? []).sort((a, b) => a.cantidad_min - b.cantidad_min)

  const reglaAplicable = reglas.find((r) => {
    const cumpleMin = cantidad >= r.cantidad_min
    const cumpleMax = r.cantidad_max === null || cantidad <= r.cantidad_max
    return cumpleMin && cumpleMax
  })

  if (reglaAplicable) {
    return {
      precio_unitario: reglaAplicable.precio_unitario,
      requiere_aprobacion: reglaAplicable.modo === 'consultar_dueno',
      modo: 'descuento',
      nota: reglaAplicable.modo === 'consultar_dueno'
        ? `Precio especial para ${cantidad} ${producto.unidad}s — pendiente de confirmación del encargado`
        : `Precio por volumen: ${formatPEN(reglaAplicable.precio_unitario)} por ${producto.unidad}`,
    }
  }

  if (
    producto.modo_negociacion &&
    producto.umbral_negociacion_cantidad &&
    cantidad >= producto.umbral_negociacion_cantidad
  ) {
    return {
      precio_unitario: producto.precio_base,
      requiere_aprobacion: true,
      modo: 'negociacion',
      nota: `Pedido grande detectado (${cantidad} ${producto.unidad}s) — el encargado confirmará precio especial`,
    }
  }

  return {
    precio_unitario: producto.precio_base,
    requiere_aprobacion: false,
    modo: 'base',
    nota: null,
  }
}

// Busca una unidad alternativa por nombre dentro del producto
function buscarUnidadAlternativa(nombreBuscado: string, producto: Producto): UnidadProducto | null {
  const unidades = (producto.unidades_producto ?? []).filter(u => u.activo)
  if (unidades.length === 0) return null
  const termino = normalizar(nombreBuscado)
  // Buscar por coincidencia en la etiqueta o código de unidad
  return unidades.find(u =>
    normalizar(u.etiqueta).includes(termino) ||
    termino.includes(normalizar(u.etiqueta)) ||
    normalizar(u.unidad).includes(termino) ||
    termino.includes(normalizar(u.unidad))
  ) ?? null
}

// Procesa todos los items solicitados y retorna resultados detallados
export function procesarItemsSolicitados(
  itemsSolicitados: ItemSolicitado[],
  productos: Producto[],
  umbralMontoNegociacion?: number | null
): ResultadoBusqueda[] {
  const resultados: ResultadoBusqueda[] = itemsSolicitados.map((item) => {
    const producto = buscarProducto(item.nombre_buscado, productos)

    if (!producto) {
      return {
        nombre_buscado: item.nombre_buscado,
        cantidad: item.cantidad,
        producto: null,
        precio_unitario: 0,
        precio_original: 0,
        subtotal: 0,
        disponible: false,
        stock_disponible: 0,
        nota: 'Producto no disponible en nuestro catálogo',
        requiere_aprobacion: false,
        modo_aplicado: 'base',
      }
    }

    // ── Unidad alternativa (ej: cliente pidió "por metro cúbico") ─────────────
    const unidadAlt = buscarUnidadAlternativa(item.nombre_buscado, producto)

    const stockDisponible = producto.stock
    const puedeVenderSinStock = producto.venta_sin_stock === true

    const stockOk = stockDisponible >= item.cantidad || puedeVenderSinStock
    const stockParcial = !stockOk && stockDisponible > 0
    const sinStock = !puedeVenderSinStock && stockDisponible === 0

    const cantidadFinal = stockOk ? item.cantidad : stockDisponible

    // Si hay unidad alternativa, usar su precio directamente
    const precioBase = unidadAlt ? unidadAlt.precio : undefined
    const { precio_unitario, requiere_aprobacion, modo, nota } = precioBase
      ? { precio_unitario: precioBase, requiere_aprobacion: false, modo: 'base' as const, nota: `Por ${unidadAlt!.etiqueta}` }
      : calcularPrecio(producto, cantidadFinal)

    let notaFinal = nota
    if (sinStock) {
      notaFinal = 'Sin stock disponible'
    } else if (stockParcial) {
      notaFinal = `Solo hay ${stockDisponible} ${producto.unidad}${stockDisponible !== 1 ? 's' : ''} disponibles (cantidad ajustada)`
    } else if (puedeVenderSinStock && stockDisponible === 0) {
      notaFinal = (notaFinal ? notaFinal + ' · ' : '') + 'Disponible bajo pedido'
    }

    return {
      nombre_buscado: item.nombre_buscado,
      cantidad: cantidadFinal,
      producto,
      precio_unitario,
      precio_original: producto.precio_base,
      subtotal: precio_unitario * cantidadFinal,
      disponible: !sinStock,
      stock_disponible: stockDisponible,
      nota: notaFinal,
      requiere_aprobacion,
      modo_aplicado: modo,
      unidad_alternativa: unidadAlt ?? undefined,
    }
  })

  if (umbralMontoNegociacion) {
    const totalDisponibles = resultados
      .filter((r) => r.disponible)
      .reduce((sum, r) => sum + r.subtotal, 0)

    if (totalDisponibles >= umbralMontoNegociacion) {
      resultados.forEach((r) => {
        if (r.disponible && !r.requiere_aprobacion) {
          r.requiere_aprobacion = true
          r.nota = (r.nota ? r.nota + ' — ' : '') + 'Pedido grande: el encargado confirmará precio'
        }
      })
    }
  }

  return resultados
}

// Formatea los resultados como texto para WhatsApp
export function formatearCotizacion(
  resultados: ResultadoBusqueda[],
  nombreFerreteria: string
): string {
  const disponibles = resultados.filter((r) => r.producto && r.disponible)
  const noDisponibles = resultados.filter((r) => !r.producto || !r.disponible)
  const requiereAprobacion = resultados.some((r) => r.requiere_aprobacion)

  let texto = `*Cotización - ${nombreFerreteria}*\n`
  texto += '─────────────────\n'

  for (const r of disponibles) {
    texto += `\n✅ *${r.producto!.nombre}*\n`
    const unidadLabel = r.unidad_alternativa
      ? r.unidad_alternativa.etiqueta
      : `${r.producto!.unidad}${r.cantidad !== 1 ? 's' : ''}`
    texto += `   ${r.cantidad} ${unidadLabel} × ${formatPEN(r.precio_unitario)}\n`
    if (r.nota) {
      texto += `   _${r.nota}_\n`
    } else if (r.modo_aplicado === 'descuento') {
      texto += `   _(precio por volumen)_\n`
    }
    if (!r.requiere_aprobacion) {
      texto += `   *Subtotal: ${formatPEN(r.subtotal)}*\n`
    }
  }

  for (const r of noDisponibles) {
    if (!r.producto) {
      texto += `\n❌ "${r.nombre_buscado}" — no disponible en catálogo\n`
    } else {
      texto += `\n❌ *${r.producto.nombre}* — sin stock\n`
    }
  }

  texto += '\n─────────────────\n'

  if (requiereAprobacion) {
    texto += '⏳ *Este pedido tiene precio especial.*\nEl encargado le confirmará el precio final en breve.\n'
  } else {
    const total = disponibles.reduce((sum, r) => sum + r.subtotal, 0)
    texto += `*TOTAL: ${formatPEN(total)}*\n`
    texto += '\n¿Desea confirmar este pedido? Responda *SÍ* para continuar 😊'
  }

  return texto
}
