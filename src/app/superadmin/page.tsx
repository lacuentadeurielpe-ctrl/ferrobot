// /superadmin — Dashboard con métricas globales de la plataforma

import { getSuperadminSession } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'
import { inicioDiaLima } from '@/lib/tiempo'
import { formatPEN } from '@/lib/utils'

export const revalidate = 60 // refrescar cada minuto

async function getStats() {
  const admin = createAdminClient()
  const horaInicio = inicioDiaLima(0)

  const [
    { data: ferreterias },
    { data: incidencias },
    { data: movimientosHoy },
  ] = await Promise.all([
    admin.from('ferreterias').select('estado_tenant, activo'),
    admin.from('incidencias_sistema').select('id, tipo').eq('resuelto', false),
    admin.from('movimientos_creditos').select('creditos_usados, costo_usd').gte('created_at', horaInicio),
  ])

  const lista = ferreterias ?? []
  return {
    tenants: {
      total:      lista.length,
      activos:    lista.filter((f) => f.estado_tenant === 'activo').length,
      trial:      lista.filter((f) => f.estado_tenant === 'trial').length,
      suspendidos: lista.filter((f) => f.estado_tenant === 'suspendido').length,
    },
    incidencias_abiertas: (incidencias ?? []).length,
    creditos_hoy: (movimientosHoy ?? []).reduce((s, m) => s + (m.creditos_usados ?? 0), 0),
    costo_usd_hoy: (movimientosHoy ?? []).reduce((s, m) => s + (Number(m.costo_usd) ?? 0), 0),
  }
}

export default async function SuperadminPage() {
  const [session, stats] = await Promise.all([
    getSuperadminSession(),
    getStats(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Bienvenido, {session?.nombre}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPICard label="Tenants activos"  value={stats.tenants.activos}  color="green" />
        <KPICard label="En trial"          value={stats.tenants.trial}    color="yellow" />
        <KPICard label="Suspendidos"       value={stats.tenants.suspendidos} color="red" />
        <KPICard label="Total ferreterías" value={stats.tenants.total}    color="blue" />
      </div>

      {/* Actividad hoy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Créditos IA — hoy</h3>
          <p className="text-3xl font-bold">{stats.creditos_hoy.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">
            Costo estimado: <span className="text-green-400">${stats.costo_usd_hoy.toFixed(4)} USD</span>
          </p>
        </div>

        <div className={`bg-gray-900 border rounded-2xl p-5 ${
          stats.incidencias_abiertas > 0
            ? 'border-red-700 bg-red-950/20'
            : 'border-gray-800'
        }`}>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Incidencias sin resolver</h3>
          <p className={`text-3xl font-bold ${stats.incidencias_abiertas > 0 ? 'text-red-400' : ''}`}>
            {stats.incidencias_abiertas}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {stats.incidencias_abiertas === 0 ? 'Todo OK 🎉' : 'Revisar en pestaña Salud →'}
          </p>
        </div>
      </div>

      {/* Links rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink href="/superadmin/tenants" title="Clientes" desc="Gestionar ferreterías, planes y suscripciones" icon="🏪" />
        <QuickLink href="/superadmin/ia" title="IA & Créditos" desc="Consumo global, movimientos y modelos" icon="🤖" />
        <QuickLink href="/superadmin/salud" title="Salud del sistema" desc="Incidencias activas, conexiones YCloud" icon="🔔" />
      </div>
    </div>
  )
}

function KPICard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    red:    'text-red-400',
    blue:   'text-blue-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] ?? 'text-white'}`}>{value}</p>
    </div>
  )
}

function QuickLink({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: string }) {
  return (
    <a
      href={href}
      className="block bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-orange-500/50 hover:bg-gray-800/50 transition-colors group"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{desc}</p>
    </a>
  )
}
