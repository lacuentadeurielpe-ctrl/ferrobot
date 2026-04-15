// Búsqueda de productos en el catálogo y construcción de cotizaciones
import type { Producto, ReglaDescuento } from '@/types/database'
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
  nota: string | null            // "Solo hay 5 en stock", "Precio especial", etc.
  requiere_aprobacion: boolean   // true si va a negociación con el dueño
  modo_aplicado: 'base' | 'descuento' | 'negociacion'
}

// Busca un producto en el catálogo por nombre (búsqueda aproximada)
function buscarProducto(nombreBuscado: string, productos: Producto[]): Producto | null {
  const termino = normalizar(nombreBuscado)

  // 1. Coincidencia exacta
  const exacto = productos.find((p) => normalizar(p.nombre) === termino)
  if (exacto) return exacto

  // 2. El nombre del catálogo contiene el término buscado
  const contiene = productos.find((p) => normalizar(p.nombre).includes(termino))
  if (contiene) return contiene

  // 3. El término buscado contiene el nombre del catálogo
  const invertido = productos.find((p) => termino.includes(normalizar(p.nombre)))
  if (invertido) return invertido

  // 4. Al menos 2 palabras coinciden (búsqueda por tokens)
  const tokensTermino = termino.split(' ').filter((t) => t.length > 2)
  if (tokensTermino.length >= 2) {
    const porTokens = productos.find((p) => {
      const nombProd = normalizar(p.nombre)
      const coincidencias = tokensTermino.filter((t) => nombProd.includes(t))
      return coincidencias.length >= Math.min(2, tokensTermino.length)
    })
    if (porTokens) return porTokens
  }

  return null
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/[^a-z0-9\s]/g, '')      // solo alfanumérico
    .trim()
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

  // Verificar si hay regla de descuento aplicable para esta cantidad
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

  // Verificar modo negociación global del producto
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

    const stockDisponible = producto.stock
    const stockOk = stockDisponible >= item.cantidad
    const stockParcial = !stockOk && stockDisponible > 0
    const sinStock = stockDisponible === 0

    // Usamos la cantidad real que se puede entregar
    const cantidadFinal = stockOk ? item.cantidad : stockDisponible

    const { precio_unitario, requiere_aprobacion, modo, nota } = calcularPrecio(producto, cantidadFinal)

    let notaFinal = nota
    if (stockParcial) {
      notaFinal = `Solo hay ${stockDisponible} ${producto.unidad}${stockDisponible !== 1 ? 's' : ''} disponibles (cantidad ajustada)`
    } else if (sinStock) {
      notaFinal = 'Sin stock disponible'
    }

    return {
      nombre_buscado: item.nombre_buscado,
      cantidad: cantidadFinal,           // cantidad real a entregar
      producto,
      precio_unitario,
      precio_original: producto.precio_base,
      subtotal: precio_unitario * cantidadFinal,
      disponible: !sinStock,             // disponible si hay ALGO de stock
      stock_disponible: stockDisponible,
      nota: notaFinal,
      requiere_aprobacion,
      modo_aplicado: modo,
    }
  })

  // Verificar umbral global de monto de negociación
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
    texto += `   ${r.cantidad} ${r.producto!.unidad}${r.cantidad !== 1 ? 's' : ''} × ${formatPEN(r.precio_unitario)}\n`

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
