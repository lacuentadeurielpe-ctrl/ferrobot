// GET /api/contabilidad/exportar/[id]?formato=ple|csv|excel
// FERRETERÍA AISLADA: valida que el libro pertenece al tenant de la sesión

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { generarExcelVentas } from '@/lib/contabilidad/excel-ventas'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const url     = new URL(request.url)
  const formato = url.searchParams.get('formato') ?? 'ple'

  const supabase = await createClient()

  // FERRETERÍA AISLADA: filtrar por ferreteria_id además del id
  const { data: libro, error } = await supabase
    .from('libros_contables')
    .select('*')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (error || !libro) {
    return NextResponse.json({ error: 'Libro no encontrado' }, { status: 404 })
  }

  const periodo = libro.periodo as string  // YYYYMM
  const year    = periodo.slice(0, 4)
  const month   = periodo.slice(4, 6)
  const desde   = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString()
  const hasta   = new Date(parseInt(year), parseInt(month), 1).toISOString()

  // ── PLE: archivo .txt formato SUNAT ────────────────────────────────
  if (formato === 'ple') {
    const contenido = libro.contenido_ple ?? ''
    const filename  = `LE_RegistroVentas_${periodo}.txt`
    return new Response(contenido, {
      headers: {
        'Content-Type':        'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // Comprobantes del periodo — necesarios para CSV y Excel
  // FERRETERÍA AISLADA
  const { data: comprobantes } = await supabase
    .from('comprobantes')
    .select('*')
    .eq('ferreteria_id', session.ferreteriaId)
    .in('tipo', ['boleta', 'factura'])
    .neq('estado', 'error')
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .order('created_at', { ascending: true })

  // ── Excel: Formato 14.1 oficial SUNAT ─────────────────────────────
  if (formato === 'excel') {
    // Datos de la ferretería para el encabezado — FERRETERÍA AISLADA
    const { data: ferreteria } = await supabase
      .from('ferreterias')
      .select('ruc, razon_social, nombre_comercial')
      .eq('id', session.ferreteriaId)
      .single()

    const buffer = await generarExcelVentas(
      comprobantes ?? [],
      periodo,
      {
        ruc:              ferreteria?.ruc           ?? null,
        razon_social:     ferreteria?.razon_social  ?? null,
        nombre_comercial: ferreteria?.nombre_comercial ?? null,
      }
    )

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const mesLabel = meses[parseInt(month) - 1]
    const filename = `RegistroVentas_${mesLabel}_${year}.xlsx`

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── CSV simplificado para el contador ─────────────────────────────
  // Separador ; (estándar CSV en Excel español/peruano)
  const SEP = ';'
  const BOM = '\uFEFF'
  const cabecera = [
    'Fecha', 'Tipo', 'Serie-Número', 'Cliente', 'RUC/DNI',
    'Base Imponible', 'IGV 18%', 'Total', 'Estado',
  ].join(SEP)

  const filas = (comprobantes ?? []).map((c) => {
    const fecha = new Date(c.created_at).toLocaleDateString('es-PE')
    const tipo  = c.tipo === 'factura' ? 'Factura' : 'Boleta'
    const serie = c.numero_completo ?? `${c.serie}-${c.numero}`
    const fmt   = (n: number) => n.toFixed(2).replace('.', ',')
    return [
      `"${fecha}"`,
      `"${tipo}"`,
      `"${serie}"`,
      `"${(c.cliente_nombre ?? 'CLIENTES VARIOS').replace(/"/g, '""')}"`,
      `"${c.cliente_ruc_dni ?? ''}"`,
      fmt(c.subtotal ?? 0),
      fmt(c.igv ?? 0),
      fmt(c.total ?? 0),
      `"${c.estado}"`,
    ].join(SEP)
  })

  const csv      = BOM + [cabecera, ...filas].join('\r\n')
  const filename = `RegistroVentas_${year}_${month}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
