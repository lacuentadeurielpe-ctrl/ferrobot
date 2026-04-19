// /superadmin/facturacion — Historial de recargas, ingresos y alertas de vencimiento

import { createAdminClient } from '@/lib/supabase/admin'
import { inicioDiaLima } from '@/lib/tiempo'

export const revalidate = 120

const MOTIVO_LABEL: Record<string, string> = {
  plan_mensual:   'Plan mensual',
  recarga_manual: 'Recarga manual',
  compensacion:   'Compensación',
  trial:          'Trial',
}

function formatPEN(n: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n)
}

async function getAlertasVencimiento() {
  const admin  = createAdminClient()
  const hoy    = new Date()
  const en7d   = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data } = await admin
    .from('suscripciones')
    .select(`
      ferreteria_id, estado, proximo_cobro, creditos_disponibles,
      ferreterias (id, nombre, telefono_whatsapp, estado_tenant, trial_hasta),
      planes (nombre, precio_mensual)
    `)
    .not('proximo_cobro', 'is', null)
    .order('proximo_cobro', { ascending: true })

  const vencidos:  typeof rows = []
  const proximos:  typeof rows = []
  const rows = data ?? []

  for (const s of rows) {
    if (!s.proximo_cobro) continue
    const fecha = new Date(s.proximo_cobro)
    if (fecha < hoy)  vencidos.push(s)
    else if (fecha <= en7d) proximos.push(s)
  }

  // Trials por vencer
  const { data: trialsData } = await admin
    .from('ferreterias')
    .select('id, nombre, trial_hasta, estado_tenant')
    .eq('estado_tenant', 'trial')
    .not('trial_hasta', 'is', null)

  const trialsPorVencer = (trialsData ?? []).filter((f) => {
    if (!f.trial_hasta) return false
    const fecha = new Date(f.trial_hasta)
    return fecha >= hoy && fecha <= en7d
  })

  const trialsVencidos = (trialsData ?? []).filter((f) => {
    if (!f.trial_hasta) return false
    return new Date(f.trial_hasta) < hoy
  })

  return { vencidos, proximos, trialsPorVencer, trialsVencidos }
}

async function getFacturacionStats() {
  const admin     = createAdminClient()
  const inicio30d = inicioDiaLima(-30)

  const [
    { data: todasRecargas },
    { data: recargas30d },
    { data: ferreterias },
  ] = await Promise.all([
    admin.from('recargas_creditos').select('id, ferreteria_id, creditos, motivo, monto_cobrado, created_at'),
    admin.from('recargas_creditos').select('id, ferreteria_id, creditos, motivo, monto_cobrado, created_at')
      .gte('created_at', inicio30d).order('created_at', { ascending: false }),
    admin.from('ferreterias').select('id, nombre'),
  ])

  const todas     = todasRecargas ?? []
  const recientes = recargas30d   ?? []
  const fMap: Record<string, string> = {}
  for (const f of (ferreterias ?? [])) fMap[f.id] = f.nombre

  const ingresoTotal  = todas.reduce((s, r) => s + Number(r.monto_cobrado ?? 0), 0)
  const creditosTotal = todas.reduce((s, r) => s + (r.creditos ?? 0), 0)
  const ingreso30d    = recientes.reduce((s, r) => s + Number(r.monto_cobrado ?? 0), 0)
  const creditos30d   = recientes.reduce((s, r) => s + (r.creditos ?? 0), 0)

  const porMotivo: Record<string, { count: number; monto: number; creditos: number }> = {}
  for (const r of recientes) {
    const m = r.motivo ?? 'plan_mensual'
    if (!porMotivo[m]) porMotivo[m] = { count: 0, monto: 0, creditos: 0 }
    porMotivo[m].count++
    porMotivo[m].monto    += Number(r.monto_cobrado ?? 0)
    porMotivo[m].creditos += r.creditos ?? 0
  }

  const porTenant: Record<string, { nombre: string; monto: number; recargas: number }> = {}
  for (const r of todas) {
    const fid = r.ferreteria_id
    if (!porTenant[fid]) porTenant[fid] = { nombre: fMap[fid] ?? fid, monto: 0, recargas: 0 }
    porTenant[fid].monto    += Number(r.monto_cobrado ?? 0)
    porTenant[fid].recargas++
  }
  const topTenants = Object.entries(porTenant).sort((a, b) => b[1].monto - a[1].monto).slice(0, 10)

  const recientesConNombre = recientes.slice(0, 50).map((r) => ({
    ...r,
    nombre_ferreteria: fMap[r.ferreteria_id] ?? '—',
  }))

  return { ingresoTotal, creditosTotal, recargasTotal: todas.length, ingreso30d, creditos30d, porMotivo, topTenants, recientes: recientesConNombre }
}

export default async function FacturacionPage() {
  const [stats, alertas] = await Promise.all([getFacturacionStats(), getAlertasVencimiento()])

  const totalAlertas = alertas.vencidos.length + alertas.proximos.length + alertas.trialsVencidos.length + alertas.trialsPorVencer.length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Facturación</h1>
        <p className="text-gray-400 text-sm mt-1">Ingresos, recargas y alertas de vencimiento</p>
      </div>

      {/* ── Alertas de vencimiento ────────────────────────────── */}
      {totalAlertas > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
            Alertas de cobro ({totalAlertas})
          </h2>

          {/* Pagos vencidos */}
          {alertas.vencidos.map((s) => {
            const f   = (s as any).ferreterias
            const pl  = (s as any).planes
            const dias = Math.floor((Date.now() - new Date(s.proximo_cobro!).getTime()) / 86400000)
            return (
              <div key={s.ferreteria_id} className="flex items-center justify-between bg-red-950/20 border border-red-900/40 rounded-xl px-4 py-3">
                <div>
                  <a href={`/superadmin/tenants/${f?.id ?? s.ferreteria_id}`} className="font-medium text-white hover:text-indigo-400 text-sm">
                    {f?.nombre ?? s.ferreteria_id}
                  </a>
                  <p className="text-xs text-red-400 mt-0.5">
                    Pago vencido hace {dias} día{dias !== 1 ? 's' : ''} · {pl?.nombre ?? 'Sin plan'}
                    {pl?.precio_mensual ? ` · ${formatPEN(Number(pl.precio_mensual))}` : ''}
                  </p>
                </div>
                <span className="text-xs font-mono text-red-300 bg-red-900/40 px-2 py-1 rounded-lg">
                  {new Date(s.proximo_cobro!).toLocaleDateString('es-PE')}
                </span>
              </div>
            )
          })}

          {/* Trials vencidos */}
          {alertas.trialsVencidos.map((f) => {
            const dias = Math.floor((Date.now() - new Date(f.trial_hasta!).getTime()) / 86400000)
            return (
              <div key={f.id} className="flex items-center justify-between bg-red-950/20 border border-red-900/40 rounded-xl px-4 py-3">
                <div>
                  <a href={`/superadmin/tenants/${f.id}`} className="font-medium text-white hover:text-indigo-400 text-sm">
                    {f.nombre}
                  </a>
                  <p className="text-xs text-red-400 mt-0.5">Trial vencido hace {dias} día{dias !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-xs font-mono text-red-300 bg-red-900/40 px-2 py-1 rounded-lg">
                  {new Date(f.trial_hasta!).toLocaleDateString('es-PE')}
                </span>
              </div>
            )
          })}

          {/* Próximos vencimientos */}
          {alertas.proximos.map((s) => {
            const f   = (s as any).ferreterias
            const pl  = (s as any).planes
            const dias = Math.ceil((new Date(s.proximo_cobro!).getTime() - Date.now()) / 86400000)
            return (
              <div key={s.ferreteria_id} className="flex items-center justify-between bg-yellow-950/20 border border-yellow-900/40 rounded-xl px-4 py-3">
                <div>
                  <a href={`/superadmin/tenants/${f?.id ?? s.ferreteria_id}`} className="font-medium text-white hover:text-indigo-400 text-sm">
                    {f?.nombre ?? s.ferreteria_id}
                  </a>
                  <p className="text-xs text-yellow-500 mt-0.5">
                    Vence en {dias} día{dias !== 1 ? 's' : ''} · {pl?.nombre ?? 'Sin plan'}
                    {pl?.precio_mensual ? ` · ${formatPEN(Number(pl.precio_mensual))}` : ''}
                  </p>
                </div>
                <span className="text-xs font-mono text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded-lg">
                  {new Date(s.proximo_cobro!).toLocaleDateString('es-PE')}
                </span>
              </div>
            )
          })}

          {/* Trials por vencer */}
          {alertas.trialsPorVencer.map((f) => {
            const dias = Math.ceil((new Date(f.trial_hasta!).getTime() - Date.now()) / 86400000)
            return (
              <div key={f.id} className="flex items-center justify-between bg-yellow-950/20 border border-yellow-900/40 rounded-xl px-4 py-3">
                <div>
                  <a href={`/superadmin/tenants/${f.id}`} className="font-medium text-white hover:text-indigo-400 text-sm">
                    {f.nombre}
                  </a>
                  <p className="text-xs text-yellow-500 mt-0.5">Trial vence en {dias} día{dias !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-xs font-mono text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded-lg">
                  {new Date(f.trial_hasta!).toLocaleDateString('es-PE')}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Ingreso total (histórico)</p>
          <p className="text-2xl font-bold text-green-400">{formatPEN(stats.ingresoTotal)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Créditos vendidos</p>
          <p className="text-2xl font-bold text-indigo-400">{stats.creditosTotal.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Recargas totales</p>
          <p className="text-2xl font-bold">{stats.recargasTotal}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Ingreso últimos 30 días</p>
          <p className="text-2xl font-bold text-green-300">{formatPEN(stats.ingreso30d)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Créditos vendidos (30d)</p>
          <p className="text-2xl font-bold text-indigo-300">{stats.creditos30d.toLocaleString()}</p>
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
              {Object.entries(stats.porMotivo).sort((a, b) => b[1].monto - a[1].monto).map(([motivo, data]) => (
                <div key={motivo}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{MOTIVO_LABEL[motivo] ?? motivo}</span>
                    <span className="text-green-400">{formatPEN(data.monto)}</span>
                  </div>
                  <div className="text-xs text-gray-500">{data.count} recargas · {data.creditos.toLocaleString()} cr</div>
                  <div className="mt-1 h-1 bg-gray-800 rounded-full">
                    <div className="h-1 bg-green-600 rounded-full" style={{ width: `${Math.min(100, (data.monto / Math.max(stats.ingreso30d, 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top tenants */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Top clientes (histórico)</h3>
          {stats.topTenants.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {stats.topTenants.map(([fid, data], i) => (
                <div key={fid} className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                  <a href={`/superadmin/tenants/${fid}`} className="flex-1 text-sm text-gray-300 hover:text-indigo-400 truncate">{data.nombre}</a>
                  <span className="text-xs text-gray-500">{data.recargas}x</span>
                  <span className="text-sm text-green-400 font-mono w-24 text-right">{formatPEN(data.monto)}</span>
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
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Sin recargas en los últimos 30 días</td></tr>
              )}
              {stats.recientes.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/superadmin/tenants/${r.ferreteria_id}`} className="text-white hover:text-indigo-400">{r.nombre_ferreteria}</a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{MOTIVO_LABEL[r.motivo] ?? r.motivo}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-300">+{(r.creditos ?? 0).toLocaleString()}</td>
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
