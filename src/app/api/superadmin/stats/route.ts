// GET /api/superadmin/stats — métricas globales de la plataforma
// Acceso: cualquier nivel de superadmin

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'
import { inicioDiaLima } from '@/lib/tiempo'

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const horaInicio = inicioDiaLima(0)

  const [
    { data: ferreterias },
    { data: incidenciasAbiertas },
    { data: movimientosHoy },
    { data: recargasHoy },
  ] = await Promise.all([
    // Conteo de tenants por estado
    admin
      .from('ferreterias')
      .select('estado_tenant, activo'),

    // Incidencias sin resolver
    admin
      .from('incidencias_sistema')
      .select('id, tipo, ferreteria_id, created_at')
      .eq('resuelto', false)
      .order('created_at', { ascending: false })
      .limit(50),

    // Créditos consumidos hoy
    admin
      .from('movimientos_creditos')
      .select('creditos_usados, costo_usd, tipo_tarea')
      .gte('created_at', horaInicio),

    // Recargas de hoy
    admin
      .from('recargas_creditos')
      .select('creditos, monto_cobrado')
      .gte('created_at', horaInicio),
  ])

  const lista = ferreterias ?? []
  const resumenTenants = {
    total:      lista.length,
    activos:    lista.filter((f) => f.estado_tenant === 'activo').length,
    trial:      lista.filter((f) => f.estado_tenant === 'trial').length,
    suspendidos: lista.filter((f) => f.estado_tenant === 'suspendido').length,
    cancelados:  lista.filter((f) => f.estado_tenant === 'cancelado').length,
  }

  const creditosHoy = (movimientosHoy ?? []).reduce((s, m) => s + (m.creditos_usados ?? 0), 0)
  const costoUsdHoy = (movimientosHoy ?? []).reduce((s, m) => s + (m.costo_usd ?? 0), 0)
  const recargasMontoHoy = (recargasHoy ?? []).reduce((s, r) => s + (r.monto_cobrado ?? 0), 0)
  const recargasCreditosHoy = (recargasHoy ?? []).reduce((s, r) => s + (r.creditos ?? 0), 0)

  // Distribución de uso de IA por tipo de tarea hoy
  const usoIA: Record<string, number> = {}
  for (const m of movimientosHoy ?? []) {
    const tipo = m.tipo_tarea ?? 'desconocido'
    usoIA[tipo] = (usoIA[tipo] ?? 0) + (m.creditos_usados ?? 0)
  }

  return NextResponse.json({
    tenants: resumenTenants,
    incidencias_abiertas: incidenciasAbiertas ?? [],
    hoy: {
      creditos_consumidos: creditosHoy,
      costo_usd_ia: Number(costoUsdHoy.toFixed(4)),
      recargas_monto: recargasMontoHoy,
      recargas_creditos: recargasCreditosHoy,
      llamadas_ia: (movimientosHoy ?? []).length,
    },
    uso_ia_por_tarea: usoIA,
  })
}
