// GET /api/superadmin/tributario/stats — estadísticas tributarias globales

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Primer día del mes actual
  const ahora = new Date()
  const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
  const primerDiaSigMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).toISOString()

  // YYYYMM del mes actual
  const periodoActual = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: comprobantesData },
    { data: ferreteriasCon },
    { data: ferreteriasSin },
    { data: librosData },
    { data: librosCerradosData },
  ] = await Promise.all([
    // Comprobantes emitidos este mes
    admin
      .from('comprobantes')
      .select('igv, total')
      .in('tipo', ['boleta', 'factura'])
      .eq('estado', 'emitido')
      .gte('created_at', primerDiaMes)
      .lt('created_at', primerDiaSigMes),

    // Ferreterías con Nubefact
    admin
      .from('ferreterias')
      .select('id')
      .not('nubefact_token', 'is', null),

    // Ferreterías sin Nubefact
    admin
      .from('ferreterias')
      .select('id')
      .is('nubefact_token', null),

    // Libros generados este mes
    admin
      .from('libros_contables')
      .select('id')
      .eq('periodo', periodoActual),

    // Libros cerrados este mes
    admin
      .from('libros_contables')
      .select('id')
      .eq('periodo', periodoActual)
      .eq('estado', 'cerrado'),
  ])

  const comprobantes = comprobantesData ?? []
  const igv_mes    = comprobantes.reduce((s, c) => s + (Number(c.igv) ?? 0), 0)
  const ventas_mes = comprobantes.reduce((s, c) => s + (Number(c.total) ?? 0), 0)

  return NextResponse.json({
    comprobantes_mes:       comprobantes.length,
    igv_mes:                Math.round(igv_mes * 100) / 100,
    ventas_mes:             Math.round(ventas_mes * 100) / 100,
    tenants_con_nubefact:   (ferreteriasCon ?? []).length,
    tenants_sin_nubefact:   (ferreteriasSin ?? []).length,
    libros_generados_mes:   (librosData ?? []).length,
    libros_cerrados_mes:    (librosCerradosData ?? []).length,
  })
}
