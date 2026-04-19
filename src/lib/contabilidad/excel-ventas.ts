// Generador de Excel SUNAT Formato 14.1 — Registro de Ventas e Ingresos
// Usa ExcelJS para respetar exactamente la estructura oficial de SUNAT

import ExcelJS from 'exceljs'
import type { Comprobante } from '@/types/database'

interface DatosFerreteria {
  ruc:           string | null
  razon_social:  string | null
  nombre_comercial: string | null
}

function formatFecha(isoDate: string): string {
  const d = new Date(isoDate)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function codTipoComprobante(tipo: string): string {
  if (tipo === 'factura') return '01'
  if (tipo === 'boleta')  return '03'
  return '00'
}

function codTipoDocumento(rucDni: string | null): string {
  if (!rucDni) return '-'
  const limpio = rucDni.replace(/\D/g, '')
  if (limpio.length === 11) return '6'
  if (limpio.length === 8)  return '1'
  return '-'
}

function periodoLabel(periodo: string): string {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const year  = periodo.slice(0, 4)
  const month = parseInt(periodo.slice(4, 6)) - 1
  return `${meses[month]} ${year}`
}

export async function generarExcelVentas(
  comprobantes: Comprobante[],
  periodo:      string,          // YYYYMM
  ferreteria:   DatosFerreteria,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'FerroBot'
  wb.created  = new Date()

  const ws = wb.addWorksheet('F 14.1 Reg. de Ventas', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  // ── Estilos reutilizables ─────────────────────────────────────────
  const headerFill: ExcelJS.Fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  }
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 8, name: 'Arial' }
  const borderThin: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin' }, bottom: { style: 'thin' },
    left:   { style: 'thin' }, right:  { style: 'thin' },
  }
  const centerAlign: Partial<ExcelJS.Alignment> = {
    horizontal: 'center', vertical: 'middle', wrapText: true,
  }

  // ── Fila 1: título ────────────────────────────────────────────────
  ws.mergeCells('A1:V1')
  const titulo = ws.getCell('A1')
  titulo.value = 'FORMATO 14.1: REGISTRO DE VENTAS E INGRESOS'
  titulo.font  = { bold: true, size: 11, name: 'Arial' }
  titulo.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(1).height = 20

  // ── Filas 2-4: metadatos ──────────────────────────────────────────
  ws.mergeCells('A2:V2')
  ws.getCell('A2').value = `PERIODO: ${periodoLabel(periodo)}`
  ws.getCell('A2').font  = { size: 9, name: 'Arial' }

  ws.mergeCells('A3:V3')
  ws.getCell('A3').value = `RUC: ${ferreteria.ruc ?? '(sin RUC)'}`
  ws.getCell('A3').font  = { size: 9, name: 'Arial' }

  ws.mergeCells('A4:V4')
  ws.getCell('A4').value = `APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL: ${
    ferreteria.razon_social ?? ferreteria.nombre_comercial ?? ''
  }`
  ws.getCell('A4').font  = { size: 9, name: 'Arial' }

  ws.getRow(5).height = 6  // separador

  // ── Filas 6-7: encabezados de columnas (doble fila como en SUNAT) ─
  // Fila 6: grupos
  const grupos: Array<[string, string, string]> = [
    // [desde, hasta, texto]
    ['A6', 'A7', 'NÚMERO\nCORRELATIVO\nDEL REGISTRO O\nCÓDIGO ÚNICO\nDE LA\nOPERACIÓN'],
    ['B6', 'B7', 'FECHA DE\nEMISIÓN DEL\nCOMPROBANTE\nDE PAGO O\nDOCUMENTO'],
    ['C6', 'C7', 'FECHA DE\nVENCIMIENTO\nO FECHA\nDE PAGO'],
    ['D6', 'F6', 'COMPROBANTE DE PAGO O DOCUMENTO'],
    ['G6', 'H6', 'INFORMACIÓN DEL CLIENTE\nDOCUMENTO DE IDENTIDAD'],
    ['I6', 'I7', 'APELLIDOS Y\nNOMBRES,\nDENOMINACIÓN\nO RAZÓN\nSOCIAL'],
    ['J6', 'J7', 'VALOR\nFACTURADO\nDE LA\nEXPORTACIÓN'],
    ['K6', 'K7', 'BASE\nIMPONIBLE\nDE LA\nOPERACIÓN\nGRAVADA'],
    ['L6', 'M6', 'IMPORTE TOTAL DE LA OPERACIÓN\nEXONERADA O INAFECTA'],
    ['N6', 'N7', 'ISC'],
    ['O6', 'O7', 'IGV Y/O\nIPM'],
    ['P6', 'P7', 'OTROS\nTRIBUTOS\nY CARGOS\nQUE NO\nFORMAN\nPARTE DE\nLA BASE\nIMPONIBLE'],
    ['Q6', 'Q7', 'IMPORTE\nTOTAL DEL\nCOMPROBANTE\nDE PAGO'],
    ['R6', 'R7', 'TIPO\nDE\nCAMBIO'],
    ['S6', 'V6', 'REFERENCIA DEL COMPROBANTE DE PAGO O DOCUMENTO ORIGINAL QUE SE MODIFICA'],
  ]

  for (const [desde, hasta, texto] of grupos) {
    if (desde !== hasta) ws.mergeCells(`${desde}:${hasta}`)
    const cell = ws.getCell(desde)
    cell.value     = texto
    cell.font      = headerFont
    cell.fill      = headerFill
    cell.border    = borderThin
    cell.alignment = { ...centerAlign }
  }

  // Fila 7: sub-encabezados para grupos que tienen hijos
  const subHeaders: Array<[string, string]> = [
    ['D7', 'TIPO\n(TABLA 10)'],
    ['E7', 'N° SERIE\nO MÁQUINA\nREGISTRADORA'],
    ['F7', 'NÚMERO'],
    ['G7', 'TIPO\n(TABLA 2)'],
    ['H7', 'NÚMERO'],
    ['L7', 'EXONERADA'],
    ['M7', 'INAFECTA'],
    ['S7', 'FECHA'],
    ['T7', 'TIPO\n(TABLA 10)'],
    ['U7', 'SERIE'],
    ['V7', 'N° DEL\nCOMPROBANTE\nDE PAGO O\nDOCUMENTO'],
  ]

  for (const [col, texto] of subHeaders) {
    const cell = ws.getCell(col)
    cell.value     = texto
    cell.font      = headerFont
    cell.fill      = headerFill
    cell.border    = borderThin
    cell.alignment = { ...centerAlign }
  }

  ws.getRow(6).height = 60
  ws.getRow(7).height = 50

  // ── Datos ─────────────────────────────────────────────────────────
  const dataFont: Partial<ExcelJS.Font> = { size: 9, name: 'Arial' }
  const numFmt  = '#,##0.00'

  const filaInicio = 8
  let totalBase = 0, totalIgv = 0, totalImporte = 0

  const lista = comprobantes.filter(c =>
    c.tipo === 'boleta' || c.tipo === 'factura'
  )

  lista.forEach((c, idx) => {
    const rowNum = filaInicio + idx
    const row    = ws.getRow(rowNum)
    row.height   = 16

    const base    = c.subtotal ?? 0
    const igv     = c.igv ?? 0
    const total   = c.total ?? 0
    totalBase    += base
    totalIgv     += igv
    totalImporte += total

    const valores: Record<string, ExcelJS.CellValue> = {
      A: idx + 1,
      B: formatFecha(c.created_at),
      C: formatFecha(c.created_at),    // contado = misma fecha
      D: codTipoComprobante(c.tipo!),
      E: c.serie ?? '',
      F: c.numero ?? 0,
      G: codTipoDocumento(c.cliente_ruc_dni),
      H: c.cliente_ruc_dni ?? '',
      I: c.cliente_nombre ?? '-',
      J: 0,                             // exportación = 0
      K: base,
      L: 0,                             // exonerada
      M: 0,                             // inafecta
      N: 0,                             // ISC
      O: igv,
      P: 0,                             // otros tributos
      Q: total,
      R: 1,                             // tipo cambio soles
      S: '',                            // referencia fecha
      T: '',                            // referencia tipo
      U: '',                            // referencia serie
      V: '',                            // referencia nro
    }

    for (const [col, val] of Object.entries(valores)) {
      const cell    = ws.getCell(`${col}${rowNum}`)
      cell.value    = val
      cell.font     = dataFont
      cell.border   = borderThin
      cell.alignment = typeof val === 'number'
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'center', vertical: 'middle' }

      // Formato numérico para montos
      if (['J','K','L','M','N','O','P','Q'].includes(col)) {
        cell.numFmt = numFmt
      }
    }
  })

  // ── Fila de TOTALES ───────────────────────────────────────────────
  const totRow = filaInicio + lista.length
  ws.mergeCells(`A${totRow}:J${totRow}`)
  const cTot = ws.getCell(`A${totRow}`)
  cTot.value     = 'TOTALES'
  cTot.font      = { ...headerFont, size: 9 }
  cTot.fill      = headerFill
  cTot.alignment = { horizontal: 'center', vertical: 'middle' }
  cTot.border    = borderThin

  for (const [col, val] of [['K', totalBase], ['O', totalIgv], ['Q', totalImporte]] as [string, number][]) {
    const cell    = ws.getCell(`${col}${totRow}`)
    cell.value    = val
    cell.font     = { ...headerFont, size: 9 }
    cell.fill     = headerFill
    cell.numFmt   = numFmt
    cell.border   = borderThin
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }

  // Celdas vacías con borde en la fila de totales
  for (const col of ['L','M','N','P','R','S','T','U','V']) {
    const cell = ws.getCell(`${col}${totRow}`)
    cell.fill   = headerFill
    cell.border = borderThin
  }

  // ── Anchos de columna ─────────────────────────────────────────────
  ws.columns = [
    { key: 'A', width: 10 },  // correlativo
    { key: 'B', width: 12 },  // fecha emisión
    { key: 'C', width: 12 },  // fecha vencimiento
    { key: 'D', width: 7  },  // tipo CDP
    { key: 'E', width: 10 },  // serie
    { key: 'F', width: 10 },  // número
    { key: 'G', width: 7  },  // tipo doc
    { key: 'H', width: 14 },  // nro doc
    { key: 'I', width: 28 },  // nombre cliente
    { key: 'J', width: 10 },  // exportación
    { key: 'K', width: 12 },  // base imponible
    { key: 'L', width: 10 },  // exonerada
    { key: 'M', width: 10 },  // inafecta
    { key: 'N', width: 8  },  // ISC
    { key: 'O', width: 10 },  // IGV
    { key: 'P', width: 10 },  // otros tributos
    { key: 'Q', width: 12 },  // total
    { key: 'R', width: 7  },  // tipo cambio
    { key: 'S', width: 10 },  // ref fecha
    { key: 'T', width: 7  },  // ref tipo
    { key: 'U', width: 8  },  // ref serie
    { key: 'V', width: 12 },  // ref número
  ]

  // Generar buffer
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
