// /superadmin/tenants/[id] — Detalle de un tenant

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import TenantActions from './TenantActions'

export const revalidate = 0

async function getTenantDetail(id: string) {
  const admin = createAdminClient()

  const [
    { data: ferreteria },
    { data: suscripcion },
    { data: ycloudConfig },
    { data: incidencias },
    { data: movimientos },
    { data: recargas },
  ] = await Promise.all([
    admin.from('ferreterias')
      .select('id, nombre, telefono_whatsapp, activo, estado_tenant, trial_hasta, suspendido_motivo, suspendido_at, created_at, planes(nombre, creditos_mes, precio_mensual)')
      .eq('id', id).single(),

    admin.from('suscripciones')
      .select('creditos_disponibles, creditos_del_mes, creditos_extra, estado, ciclo_inicio, ciclo_fin, proximo_cobro')
      .eq('ferreteria_id', id).single(),

    admin.from('configuracion_ycloud')
      .select('numero_whatsapp, estado_conexion, ultimo_mensaje_at, ultimo_error, ultimo_error_at')
      .eq('ferreteria_id', id).single(),

    admin.from('incidencias_sistema')
      .select('id, tipo, detalle, resuelto, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(10),

    admin.from('movimientos_creditos')
      .select('tipo_tarea, modelo_usado, creditos_usados, costo_usd, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(20),

    admin.from('recargas_creditos')
      .select('creditos, motivo, monto_cobrado, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (!ferreteria) return null
  return { ferreteria, suscripcion, ycloudConfig, incidencias, movimientos, recargas }
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTenantDetail(id)

  if (!data) notFound()

  const { ferreteria, suscripcion, ycloudConfig, incidencias, movimientos, recargas } = data
  const f = ferreteria as any
  const plan = f.planes

  const YCLOUD_COLORS: Record<string, string> = {
    activo:      'text-green-400',
    error:       'text-red-400',
    desconectado: 'text-gray-400',
    pendiente:   'text-yellow-400',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a href="/superadmin/tenants" className="text-gray-500 hover:text-gray-300 text-sm">← Clientes</a>
          </div>
          <h1 className="text-2xl font-bold">{ferreteria.nombre}</h1>
          <p className="text-gray-400 text-sm mt-1 font-mono">{ferreteria.telefono_whatsapp}</p>
        </div>
        <TenantActions
          tenantId={id}
          estadoActual={ferreteria.estado_tenant ?? 'trial'}
          nombre={ferreteria.nombre}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Suscripción */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Suscripción</h3>
          {suscripcion ? (
            <div className="space-y-2 text-sm">
              <Row label="Plan" value={plan?.nombre ?? '—'} />
              <Row label="Estado" value={suscripcion.estado ?? '—'} />
              <Row label="Créditos disponibles" value={(suscripcion.creditos_disponibles ?? 0).toLocaleString()} highlight />
              <Row label="Créditos del mes" value={(suscripcion.creditos_del_mes ?? 0).toLocaleString()} />
              <Row label="Créditos extra" value={(suscripcion.creditos_extra ?? 0).toLocaleString()} />
              {suscripcion.ciclo_fin && (
                <Row label="Ciclo termina" value={new Date(suscripcion.ciclo_fin).toLocaleDateString('es-PE')} />
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Sin suscripción</p>
          )}
        </div>

        {/* YCloud */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Configuración YCloud</h3>
          {ycloudConfig ? (
            <div className="space-y-2 text-sm">
              <Row label="Número" value={ycloudConfig.numero_whatsapp ?? '—'} />
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <span className={YCLOUD_COLORS[ycloudConfig.estado_conexion ?? 'pendiente'] ?? 'text-white'}>
                  {ycloudConfig.estado_conexion ?? '—'}
                </span>
              </div>
              {ycloudConfig.ultimo_mensaje_at && (
                <Row label="Último mensaje" value={new Date(ycloudConfig.ultimo_mensaje_at).toLocaleString('es-PE')} />
              )}
              {ycloudConfig.ultimo_error && (
                <div>
                  <span className="text-gray-500 text-xs">Último error:</span>
                  <p className="text-red-400 text-xs mt-1 font-mono">{ycloudConfig.ultimo_error.slice(0, 100)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No configurado</p>
          )}
        </div>
      </div>

      {/* Últimas incidencias */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Últimas incidencias</h3>
        {incidencias && incidencias.length > 0 ? (
          <div className="space-y-2">
            {incidencias.map((inc) => (
              <div key={inc.id} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${inc.resuelto ? 'bg-gray-600' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-mono text-xs ${inc.resuelto ? 'text-gray-500' : 'text-red-300'}`}>{inc.tipo}</span>
                  {inc.detalle && <p className="text-gray-500 text-xs truncate">{inc.detalle}</p>}
                </div>
                <span className="text-gray-600 text-xs shrink-0">
                  {new Date(inc.created_at).toLocaleDateString('es-PE')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Sin incidencias 🎉</p>
        )}
      </div>

      {/* Últimos movimientos de créditos */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Consumo IA reciente</h3>
        {movimientos && movimientos.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="pb-2">Tarea</th>
                <th className="pb-2">Modelo</th>
                <th className="pb-2 text-right">Créditos</th>
                <th className="pb-2 text-right">USD</th>
                <th className="pb-2 text-right">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {movimientos.map((m, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-gray-300 font-mono">{m.tipo_tarea}</td>
                  <td className="py-1.5 text-gray-500 font-mono">{m.modelo_usado}</td>
                  <td className="py-1.5 text-right text-orange-300">{m.creditos_usados}</td>
                  <td className="py-1.5 text-right text-gray-500">{m.costo_usd ? `$${Number(m.costo_usd).toFixed(4)}` : '—'}</td>
                  <td className="py-1.5 text-right text-gray-600">
                    {new Date(m.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm">Sin movimientos</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? 'font-bold text-orange-400' : 'text-white'}>{value}</span>
    </div>
  )
}
