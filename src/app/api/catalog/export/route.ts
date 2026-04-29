import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { data: productos, error } = await supabase
    .from('productos')
    .select('nombre, descripcion, precio_base, precio_compra, stock, unidad, activo, categorias(nombre)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('nombre')

  if (error) return NextResponse.json({ error: 'Error al cargar productos' }, { status: 500 })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'FerroBot'
  wb.created = new Date()

  const ws = wb.addWorksheet('Inventario', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  ws.columns = [
    { key: 'nombre',        header: 'Producto',            width: 40 },
    { key: 'descripcion',   header: 'Descripción',         width: 28 },
    { key: 'categoria',     header: 'Categoría',           width: 18 },
    { key: 'unidad',        header: 'Unidad',              width: 10 },
    { key: 'precio_venta',  header: 'Precio Venta (S/)',   width: 18 },
    { key: 'precio_compra', header: 'Precio Compra (S/)',  width: 20 },
    { key: 'margen',        header: 'Margen (%)',          width: 13 },
    { key: 'stock',         header: 'Stock',               width: 10 },
    { key: 'estado',        header: 'Estado',              width: 10 },
  ]

  // ── Encabezado ──────────────────────────────────────────────────────────────
  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } }
    cell.font   = { color: { argb: 'FFFAFAFA' }, bold: true, size: 11, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  headerRow.height = 30

  // ── Filas de datos ───────────────────────────────────────────────────────────
  ;(productos ?? []).forEach((p, i) => {
    const venta  = p.precio_base ?? 0
    const compra = p.precio_compra ?? 0
    const margen = venta > 0 && compra > 0 ? parseFloat(((venta - compra) / venta * 100).toFixed(1)) : null

    const row = ws.addRow({
      nombre:        p.nombre,
      descripcion:   p.descripcion ?? '',
      categoria:     (p.categorias as { nombre?: string } | null)?.nombre ?? '—',
      unidad:        p.unidad ?? '—',
      precio_venta:  venta || null,
      precio_compra: compra || null,
      margen,
      stock:         p.stock ?? 0,
      estado:        p.activo ? 'Activo' : 'Inactivo',
    })

    row.height = 20
    row.font   = { name: 'Calibri', size: 10 }

    // Fondo alternado
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
      })
    }

    // Formatos numéricos
    row.getCell('precio_venta').numFmt  = '"S/"#,##0.00'
    row.getCell('precio_compra').numFmt = '"S/"#,##0.00'
    row.getCell('margen').numFmt        = '0.0"%"'
    row.getCell('stock').numFmt         = '#,##0'

    // Color del margen
    if (margen != null) {
      row.getCell('margen').font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: margen >= 20 ? 'FF16A34A' : margen >= 8 ? 'FFD97706' : 'FFDC2626' },
      }
    }

    // Estado coloreado y centrado
    const cEstado = row.getCell('estado')
    cEstado.alignment = { horizontal: 'center' }
    cEstado.font = {
      name: 'Calibri', size: 10, bold: true,
      color: { argb: p.activo ? 'FF16A34A' : 'FF9F1239' },
    }
  })

  // ── Bordes finos en todas las celdas ────────────────────────────────────────
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = {
        top:    { style: 'hair', color: { argb: 'FFE4E4E7' } },
        bottom: { style: 'hair', color: { argb: 'FFE4E4E7' } },
        left:   { style: 'hair', color: { argb: 'FFE4E4E7' } },
        right:  { style: 'hair', color: { argb: 'FFE4E4E7' } },
      }
    })
  })

  // ── Filtros automáticos ──────────────────────────────────────────────────────
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ws.columns.length },
  }

  const buffer = await wb.xlsx.writeBuffer()
  const fecha  = new Date().toISOString().slice(0, 10)

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventario-${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
