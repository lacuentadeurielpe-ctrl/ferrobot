// /superadmin/tributario — Sección tributaria: comprobantes, libros, IGV

import { redirect } from 'next/navigation'
import { getSuperadminSession } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'
import TributarioPanel from '@/components/superadmin/TributarioPanel'

export const revalidate = 0

async function getTributarioStats() {
  const admin = createAdminClient()

  const ahora = new Date()
  const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
  const primerDiaSigMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).toISOString()
  const periodoActual = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: comprobantesData },
    { data: ferreteriasCon },
    { data: ferreteriasSin },
    { data: librosData },
    { data: librosCerradosData },
  ] = await Promise.all([
    admin
      .from('comprobantes')
      .select('igv, total')
      .in('tipo', ['boleta', 'factura'])
      .eq('estado', 'emitido')
      .gte('created_at', primerDiaMes)
      .lt('created_at', primerDiaSigMes),

    admin.from('ferreterias').select('id').not('nubefact_token', 'is', null),
    admin.from('ferreterias').select('id').is('nubefact_token', null),

    admin.from('libros_contables').select('id').eq('periodo', periodoActual),
    admin.from('libros_contables').select('id').eq('periodo', periodoActual).eq('estado', 'cerrado'),
  ])

  const comprobantes = comprobantesData ?? []
  const igv_mes    = comprobantes.reduce((s, c) => s + (Number(c.igv) ?? 0), 0)
  const ventas_mes = comprobantes.reduce((s, c) => s + (Number(c.total) ?? 0), 0)

  return {
    comprobantes_mes:     comprobantes.length,
    igv_mes:              Math.round(igv_mes * 100) / 100,
    ventas_mes:           Math.round(ventas_mes * 100) / 100,
    tenants_con_nubefact: (ferreteriasCon ?? []).length,
    tenants_sin_nubefact: (ferreteriasSin ?? []).length,
    libros_generados_mes: (librosData ?? []).length,
    libros_cerrados_mes:  (librosCerradosData ?? []).length,
  }
}

export default async function TributarioPage() {
  const session = await getSuperadminSession()
  if (!session) redirect('/superadmin/login')

  const stats = await getTributarioStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tributario</h1>
        <p className="text-gray-400 text-sm mt-1">Comprobantes, libros contables e IGV</p>
      </div>
      <TributarioPanel stats={stats} />
    </div>
  )
}
