// GET /api/superadmin/tributario/comprobantes — listado global de comprobantes

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

const PER_PAGE = 50

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ferreteria_id = searchParams.get('ferreteria_id') || null
  const tipo          = searchParams.get('tipo') || null
  const estado        = searchParams.get('estado') || null
  const periodo       = searchParams.get('periodo') || null  // YYYYMM
  const page          = Math.max(1, parseInt(searchParams.get('page') || '1', 10))

  const admin = createAdminClient()

  let query = admin
    .from('comprobantes')
    .select(`
      id, ferreteria_id, tipo, serie, numero, numero_completo,
      cliente_nombre, cliente_ruc_dni, subtotal, igv, total, estado, created_at,
      ferreterias (nombre_comercial, razon_social)
    `, { count: 'exact' })
    .in('tipo', ['boleta', 'factura'])
    .order('created_at', { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

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

  const { data, count, error } = await query

  if (error) {
    console.error('[tributario/comprobantes]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []).map((c: any) => ({
    id:               c.id,
    ferreteria_id:    c.ferreteria_id,
    ferreteria_nombre: c.ferreterias?.nombre_comercial ?? c.ferreterias?.razon_social ?? '—',
    tipo:             c.tipo,
    serie:            c.serie,
    numero:           c.numero,
    numero_completo:  c.numero_completo ?? `${c.serie}-${c.numero}`,
    cliente_nombre:   c.cliente_nombre,
    cliente_ruc_dni:  c.cliente_ruc_dni,
    subtotal:         c.subtotal,
    igv:              c.igv,
    total:            c.total,
    estado:           c.estado,
    created_at:       c.created_at,
  }))

  return NextResponse.json({
    data:     rows,
    total:    count ?? 0,
    page,
    per_page: PER_PAGE,
  })
}
