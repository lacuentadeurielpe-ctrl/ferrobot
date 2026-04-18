// /superadmin/facturacion — Historial de recargas e ingresos de la plataforma

import { createAdminClient } from '@/lib/supabase/admin'
import { inicioDiaLima } from '@/lib/tiempo'

export const revalidate = 120

const MOTIVO_LABEL: Record<string, string> = {
  plan_mensual:    'Plan mensual',
  recarga_manual:  'Recarga manual',
  compensacion:    'Compensación',
  trial:           'Trial',
}

async function getFacturacionStats() {
  const admin = createAdminClient()
  const inicio30d = inicioDiaLima(-30)
  const inicioMes = inicioDiaLima(-30) // usamos 30d como "mes actual"

  const [
    { data: todasRecargas },
    { data: recargas30d },
    { data: ferreterias },
  ] = await Promise.all([
    // Todas las recargas para totales históricos
    admin
      .from('recargas_creditos')
      .select('id, ferreteria_id, creditos, motivo, monto_cobrado, created_at'),

    // Últimos 30 días para vista reciente + tabla
    admin
      .from('recargas_creditos')
      .select('id, ferreteria_id, creditos, motivo, monto_cobrado, created_at')
      .gte('created_at', inicio30d)
      .order('created_at', { ascending: false }),

    // Nombres de ferreterías para el join
    admin.from('ferreterias').select('id, nombre'),
  ])

  const todas    = todasRecargas  ?? []
  const recientes = recargas30d   ?? []
  const fMap: Record<string, string> = {}
  for (const f of (ferreterias ?? [])) fMap[f.id] = f.nombre

  // Totales históricos
  const ingresoTotal    = todas.reduce((s, r) => s + Number(r.monto_cobrado ?? 0), 0)
  const creditosTotal   = todas.reduce((s, r) => s + (r.creditos ?? 0), 0)
  const recargasTotal   = todas.length

  // Totales últimos 30d
  const ingreso30d      = recientes.reduce((s, r) => s + Number(r.monto_cobrado ?? 0), 0)
  const creditos30d     = recientes.reduce((s, r) => s + (r.creditos ?? 0), 0)

  // Por motivo (últimos 30d)
  const porMotivo: Record<string, { count: number; monto: number; creditos: number }> = {}
  for (const r of recientes) {
    const m = r.motivo ?? 'plan_mensual'
    if (!porMotivo[m]) porMotivo[m] = { count: 0, monto: 0, creditos: 0 }
    porMotivo[m].count++
    porMotivo[m].monto    += Number(r.monto_cobrado ?? 0)
    porMotivo[m].creditos += r.creditos ?? 0
  }

  // Top tenants por ingreso histórico
  const porTenant: Record<string, { nombre: string; monto: number; recargas: number }> = {}
  for (const r of todas) {
    const fid = r.ferreteria_id
    if (!porTenant[fid]) porTenant[fid] = { nombre: fMap[fid] ?? fid, monto: 0, recargas: 0 }
    porTenant[fid].monto    += Number(r.monto_cobrado ?? 0)
    porTenant[fid].recargas++
  }
  const topTenants = Object.entries(porTenant)
    .sort((a, b) => b[1].monto - a[1].monto)
    .slice(0, 10)

  // Tabla de recargas recientes con nombre de ferretería
  const recientesConNombre = recientes.slice(0, 50).map((r) => ({
    ...r,
    nombre_ferreteria: fMap[r.ferreteria_id] ?? '—',
  }))

  return {
    ingresoTotal, creditosTotal, recargasTotal,
    ingreso30d, creditos30d,
    porMotivo, topTenants,
    recientes: recientesConNombre,
  }
}

function formatPEN(n: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n)
}

export default async function FacturacionPage() {
  const stats = await getFacturacionStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Facturación</h1>
        <p className="text-gray-400 text-sm mt-1">Historial de recargas e ingresos de la plataforma</p>
      </div>

      {/* Totales históricos */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Ingreso total (histórico)</p>
          <p className="text-2xl font-bold text-green-400">{formatPEN(stats.ingresoTotal)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Créditos vendidos</p>
          <p className="text-2xl font-bold text-orange-400">{stats.creditosTotal.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Recargas totales</p>
          <p className="text-2xl font-bold">{stats.recargasTotal}</p>
        </div>
      </div>

      {/* Últimos 30 días */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Ingreso últimos 30 días</p>
          <p className="text-2xl font-bold text-green-300">{formatPEN(stats.ingreso30d)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Créditos vendidos (30d)</p>
          <p className="text-2xl font-bold text-orange-300">{stats.creditos30d.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Por motivo */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Por tipo de recarga (30d)</h3>
          {Object.keys(stats.porMotivo).length === 0 ? (
            <p className="text-gray-500 text-sm">Sin recargas en los últimos 30 días</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.porMotivo)
                .sort((a, b) => b[1].monto - a[1].monto)
                .map(([motivo, data]) => (
                  <div key={motivo}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{MOTIVO_LABEL[motivo] ?? motivo}</span>
                      <span className="text-green-400">{formatPEN(data.monto)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{data.count} recargas · {data.creditos.toLocaleString()} cr</span>
                    </div>
                    <div className="mt-1 h-1 bg-gray-800 rounded-full">
                      <div
                        className="h-1 bg-green-600 rounded-full"
                        style={{
                          width: `${Math.min(100, (data.monto / Math.max(stats.ingreso30d, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Top tenants por ingreso */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Top clientes (histórico)</h3>
          {stats.topTenants.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {stats.topTenants.map(([fid, data], i) => (
                <div key={fid} className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                  <a
                    href={`/superadmin/tenants/${fid}`}
                    className="flex-1 text-sm text-gray-300 hover:text-orange-400 truncate"
                  >
                    {data.nombre}
                  </a>
                  <span className="text-xs text-gray-500">{data.recargas}x</span>
                  <span className="text-sm text-green-400 font-mono w-24 text-right">
                    {formatPEN(data.monto)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de recargas recientes */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="font-medium">Recargas recientes (últimas 50)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left text-xs">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Ferretería</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium text-right">Créditos</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {stats.recientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Sin recargas en los últimos 30 días
                  </td>
                </tr>
              )}
              {stats.recientes.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString('es-PE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/superadmin/tenants/${r.ferreteria_id}`}
                      className="text-white hover:text-orange-400"
                    >
                      {r.nombre_ferreteria}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                      {MOTIVO_LABEL[r.motivo] ?? r.motivo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-orange-300">
                    +{(r.creditos ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">
                    {Number(r.monto_cobrado) > 0 ? formatPEN(Number(r.monto_cobrado)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
