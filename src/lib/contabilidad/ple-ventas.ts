// Generador de PLE Libro 14 — Registro de Ventas e Ingresos
// Formato SUNAT: campos separados por | terminados en |
// Ref: Anexo 2 — Estructura Libro 14

import type { Comprobante } from '@/types/database'

// Código de tipo de comprobante SUNAT (Tabla 10)
function codTipoComprobante(tipo: string): string {
  if (tipo === 'factura') return '01'
  if (tipo === 'boleta')  return '03'
  return '00'
}

// Código de tipo de documento de identidad (Tabla 2)
function codTipoDocumento(rucDni: string | null): string {
  if (!rucDni) return '0'
  const limpio = rucDni.replace(/\D/g, '')
  if (limpio.length === 11) return '6'  // RUC
  if (limpio.length === 8)  return '1'  // DNI
  return '0'
}

function formatFechaPLE(isoDate: string): string {
  const d = new Date(isoDate)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export interface FilaVenta {
  periodo: string          // YYYYMM
  cuo: string             // código único operación (serie-numero)
  fechaEmision: string    // ISO date
  tipoComprobante: string // boleta|factura
  serie: string
  numero: number
  tipoDocCliente: string | null
  nroDocCliente: string | null
  nombreCliente: string | null
  baseImponible: number
  igv: number
  total: number
  estado: string          // emitido|anulado
}

export function generarFilaPLE(fila: FilaVenta): string {
  // SUNAT Libro 14 — Registro de Ventas e Ingresos
  // 30 campos separados por | con | al final
  // Ref: Resolución de Superintendencia 286-2009/SUNAT y modificatorias

  const periodo    = fila.periodo                        // YYYYMM
  const cuo        = fila.cuo                            // código único de operación
  const m          = '1'                                 // 1=anotado, 8=pendiente
  const fechaEm    = formatFechaPLE(fila.fechaEmision)
  const fechaVto   = fechaEm                             // contado = misma fecha
  const codCdp     = codTipoComprobante(fila.tipoComprobante)
  const serie      = fila.serie ?? ''
  const nro        = String(fila.numero)
  const nroFinal   = ''   // vacío para comprobantes individuales (no rangos)

  // Documento de identidad del cliente
  const tipoDoc = fila.tipoDocCliente ?? codTipoDocumento(fila.nroDocCliente)
  // SUNAT: si no hay documento usar '-' en tipo y vacío en número
  const codTDoc    = tipoDoc === '0' ? '-' : tipoDoc
  const nroDoc     = (tipoDoc === '0' || !fila.nroDocCliente) ? '' : fila.nroDocCliente
  const nombre     = (fila.nombreCliente ?? '-').replace(/\|/g, ' ')

  const export_    = '0.00'   // exportación = 0 (ventas nacionales)
  const base       = fila.baseImponible.toFixed(2)
  const igv        = fila.igv.toFixed(2)
  const descBase   = '0.00'
  const descIgv    = '0.00'
  const exonerada  = '0.00'
  const inafecta   = '0.00'
  const isc        = '0.00'
  const icbper     = '0.00'
  const otros      = '0.00'
  const total      = fila.total.toFixed(2)
  const tc         = '1.000' // tipo de cambio (soles, 3 decimales)

  // Referencia (solo para notas de crédito/débito — vacío en boletas/facturas)
  const fechaRef   = ''
  const tipoCdpRef = ''
  const serieRef   = ''
  const nroRef     = ''

  const estadoCdp  = fila.estado === 'anulado' ? '6' : '1'
  const campoLibre = ''

  // 30 campos exactos
  const campos = [
    periodo, cuo, m, fechaEm, fechaVto,
    codCdp, serie, nro, nroFinal,
    codTDoc, nroDoc, nombre,
    export_, base, igv, descBase, descIgv,
    exonerada, inafecta, isc, icbper, otros, total,
    tc, fechaRef, tipoCdpRef, serieRef, nroRef,
    estadoCdp, campoLibre,
  ]
  return campos.join('|') + '|'
}

export function generarPLEVentas(
  comprobantes: Comprobante[],
  periodo: string  // YYYYMM
): string {
  const filas = comprobantes
    .filter(c => c.tipo === 'boleta' || c.tipo === 'factura')
    .map(c => {
      const tipoDoc = (() => {
        const rd = c.cliente_ruc_dni?.replace(/\D/g, '') ?? ''
        if (rd.length === 11) return '6'
        if (rd.length === 8)  return '1'
        return '0'
      })()
      return generarFilaPLE({
        periodo,
        cuo:             `${c.serie ?? ''}-${String(c.numero ?? 0).padStart(8, '0')}`,
        fechaEmision:    c.created_at,
        tipoComprobante: c.tipo!,
        serie:           c.serie ?? '',
        numero:          c.numero ?? 0,
        tipoDocCliente:  tipoDoc,
        nroDocCliente:   c.cliente_ruc_dni ?? '',
        nombreCliente:   c.cliente_nombre,
        baseImponible:   c.subtotal ?? 0,
        igv:             c.igv ?? 0,
        total:           c.total ?? 0,
        estado:          c.estado,
      })
    })
  return filas.join('\n')
}

export function calcularTotalesPLE(comprobantes: Comprobante[]) {
  const emitidos = comprobantes.filter(c =>
    (c.tipo === 'boleta' || c.tipo === 'factura') && c.estado !== 'error'
  )
  return {
    total_registros:      emitidos.length,
    total_boletas:        emitidos.filter(c => c.tipo === 'boleta').length,
    total_facturas:       emitidos.filter(c => c.tipo === 'factura').length,
    total_base_imponible: emitidos.reduce((s, c) => s + (c.subtotal ?? 0), 0),
    total_igv:            emitidos.reduce((s, c) => s + (c.igv ?? 0), 0),
    total_ventas:         emitidos.reduce((s, c) => s + (c.total ?? 0), 0),
  }
}
