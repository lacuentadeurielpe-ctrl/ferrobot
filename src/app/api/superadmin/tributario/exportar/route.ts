// GET /api/superadmin/tributario/exportar — exportar comprobantes como CSV

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ferreteria_id = searchParams.get('ferreteria_id') || null
  const tipo          = searchParams.get('tipo') || null
  const estado        = searchParams.get('estado') || null
  const periodo       = searchParams.get('periodo') || null  // YYYYMM

  const admin = createAdminClient()

  let query = admin
    .from('comprobantes')
    .select(`
      id, ferreteria_id, tipo, serie, numero, numero_completo,
      cliente_nombre, cliente_ruc_dni, subtotal, igv, total, estado, created_at,
      ferreterias (nombre_comercial, razon_social)
    `)
    .in('tipo', ['boleta', 'factura'])
    .order('created_at', { ascending: false })

  if (ferreteria_id) query = query.eq('ferreteria_id', ferreteria_id)
  if (tipo)          query = query.eq('tipo', tipo)
  if (estado)        query = query.eq('estado', estado)
  if (periodo && /^\d{6}$/.test(periodo)) {
    const year  = parseInt(periodo.slice(0, 4), 10)
    const month = parseInt(periodo.slice(4, 6), 10) - 1
    const desde = new Date(year, month, 1).toISOString()
    const hasta = new Date(year, month + 1, 1).toISOString()
    query = query.gte('created_at', desde).lt('created_at', hasta)
  }

  const { data, error } = await query

  if (error) {
    console.error('[tributario/exportar]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []

  // Build CSV with BOM for Spanish Excel (semicolon-delimited)
  const BOM = '\uFEFF'
  const header = 'Ferretería;Fecha;Tipo;Serie-Número;Cliente;RUC/DNI;Base Imponible;IGV 18%;Total;Estado'

  const csvRows = rows.map((c: any) => {
    const ferreteria = c.ferreterias?.nombre_comercial ?? c.ferreterias?.razon_social ?? '—'
    const fecha = new Date(c.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const numCompleto = c.numero_completo ?? `${c.serie}-${c.numero}`
    const subtotal = Number(c.subtotal ?? 0).toFixed(2)
    const igv     = Number(c.igv ?? 0).toFixed(2)
    const total   = Number(c.total ?? 0).toFixed(2)

    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`

    return [
      escape(ferreteria),
      escape(fecha),
      escape(c.tipo ?? ''),
      escape(numCompleto),
      escape(c.cliente_nombre ?? ''),
      escape(c.cliente_ruc_dni ?? ''),
      subtotal,
      igv,
      total,
      escape(c.estado ?? ''),
    ].join(';')
  })

  const csv = BOM + header + '\n' + csvRows.join('\n')

  const hoy = new Date()
  const fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`
  const filename = `ComprobantesGlobal_${fecha}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
