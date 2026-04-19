// /superadmin/ia — Consumo de IA: créditos, modelos, costos USD

import { createAdminClient } from '@/lib/supabase/admin'
import { inicioDiaLima } from '@/lib/tiempo'
import { COSTO_CREDITOS, MODELO_POR_TAREA } from '@/types/database'

export const revalidate = 60

async function getIAStats() {
  const admin = createAdminClient()
  const horaInicio30d = inicioDiaLima(-30)

  const [
    { data: movimientos30d },
    { data: topConsumidores },
  ] = await Promise.all([
    // Todos los movimientos de los últimos 30 días
    admin
      .from('movimientos_creditos')
      .select('tipo_tarea, modelo_usado, creditos_usados, costo_usd, created_at, ferreteria_id')
      .gte('created_at', horaInicio30d)
      .order('created_at', { ascending: false }),

    // Top ferreterías por consumo (últimos 30d)
    admin
      .from('movimientos_creditos')
      .select('ferreteria_id, creditos_usados, ferreterias(nombre)')
      .gte('created_at', horaInicio30d),
  ])

  const movs = movimientos30d ?? []
  const tops = topConsumidores ?? []

  // Agrupar por modelo
  const porModelo: Record<string, { llamadas: number; creditos: number; costoUsd: number }> = {}
  for (const m of movs) {
    const modelo = m.modelo_usado ?? 'desconocido'
    if (!porModelo[modelo]) porModelo[modelo] = { llamadas: 0, creditos: 0, costoUsd: 0 }
    porModelo[modelo].llamadas++
    porModelo[modelo].creditos += m.creditos_usados ?? 0
    porModelo[modelo].costoUsd += Number(m.costo_usd ?? 0)
  }

  // Agrupar por tipo de tarea
  const porTarea: Record<string, number> = {}
  for (const m of movs) {
    const t = m.tipo_tarea ?? 'desconocido'
    porTarea[t] = (porTarea[t] ?? 0) + (m.creditos_usados ?? 0)
  }

  // Top consumidores
  const consumoPorTenant: Record<string, { nombre: string; creditos: number }> = {}
  for (const m of tops) {
    const fid = m.ferreteria_id
    const nombre = (m as any).ferreterias?.nombre ?? fid
    if (!consumoPorTenant[fid]) consumoPorTenant[fid] = { nombre, creditos: 0 }
    consumoPorTenant[fid].creditos += m.creditos_usados ?? 0
  }
  const topTenants = Object.entries(consumoPorTenant)
    .sort((a, b) => b[1].creditos - a[1].creditos)
    .slice(0, 10)

  const totalCreditos = movs.reduce((s, m) => s + (m.creditos_usados ?? 0), 0)
  const totalCostoUsd = movs.reduce((s, m) => s + Number(m.costo_usd ?? 0), 0)
  const totalLlamadas = movs.length

  return { porModelo, porTarea, topTenants, totalCreditos, totalCostoUsd, totalLlamadas }
}

export default async function IAPage() {
  const stats = await getIAStats()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">IA & Créditos</h1>
        <p className="text-gray-400 text-sm mt-1">Consumo global — últimos 30 días</p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total créditos</p>
          <p className="text-2xl font-bold text-indigo-400">{stats.totalCreditos.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Costo total USD</p>
          <p className="text-2xl font-bold text-green-400">${stats.totalCostoUsd.toFixed(4)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-1">Llamadas a IA</p>
          <p className="text-2xl font-bold">{stats.totalLlamadas.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Por modelo */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Por modelo</h3>
          <div className="space-y-3">
            {Object.entries(stats.porModelo)
              .sort((a, b) => b[1].creditos - a[1].creditos)
              .map(([modelo, data]) => (
                <div key={modelo}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-mono text-xs text-gray-300">{modelo}</span>
                    <span className="text-indigo-300">{data.creditos.toLocaleString()} cr</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{data.llamadas} llamadas</span>
                    <span>${data.costoUsd.toFixed(4)} USD</span>
                  </div>
                  <div className="mt-1 h-1 bg-gray-800 rounded-full">
                    <div
                      className="h-1 bg-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, (data.creditos / Math.max(stats.totalCreditos, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            {Object.keys(stats.porModelo).length === 0 && (
              <p className="text-gray-500 text-sm">Sin datos</p>
            )}
          </div>
        </div>

        {/* Por tarea */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Por tipo de tarea</h3>
          <div className="space-y-2">
            {Object.entries(stats.porTarea)
              .sort((a, b) => b[1] - a[1])
              .map(([tarea, creditos]) => (
                <div key={tarea} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-400 w-36 truncate">{tarea}</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full">
                    <div
                      className="h-2 bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (creditos / Math.max(stats.totalCreditos, 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-blue-300 w-16 text-right">{creditos.toLocaleString()}</span>
                </div>
              ))}
            {Object.keys(stats.porTarea).length === 0 && (
              <p className="text-gray-500 text-sm">Sin datos</p>
            )}
          </div>
        </div>
      </div>

      {/* Top consumidores */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="font-medium">Top consumidores (30d)</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Ferretería</th>
              <th className="px-4 py-3 font-medium text-right">Créditos</th>
              <th className="px-4 py-3 font-medium">% del total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {stats.topTenants.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">Sin datos</td>
              </tr>
            )}
            {stats.topTenants.map(([fid, data], i) => (
              <tr key={fid} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                <td className="px-4 py-3">
                  <a href={`/superadmin/tenants/${fid}`} className="text-white hover:text-indigo-400">
                    {data.nombre}
                  </a>
                </td>
                <td className="px-4 py-3 text-right font-mono text-indigo-300">
                  {data.creditos.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full max-w-24">
                      <div
                        className="h-1.5 bg-indigo-500 rounded-full"
                        style={{ width: `${Math.min(100, (data.creditos / Math.max(stats.totalCreditos, 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {((data.creditos / Math.max(stats.totalCreditos, 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla de precios de referencia */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Tabla de créditos por tarea</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.entries(COSTO_CREDITOS) as Array<[string, number]>).map(([tarea, costo]) => (
            <div key={tarea} className="flex justify-between text-xs">
              <span className="text-gray-400 font-mono">{tarea}</span>
              <span className="text-indigo-300">{costo} cr</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
