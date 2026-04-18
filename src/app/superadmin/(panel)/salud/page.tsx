// /superadmin/salud — Salud del sistema: incidencias activas, estado YCloud, APIs

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAllApis } from '@/lib/api-health'
import ResolverIncidencia from './ResolverIncidencia'

export const revalidate = 0

async function getIncidencias() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('incidencias_sistema')
    .select(`
      id, tipo, detalle, resuelto, resuelto_at, created_at,
      ferreteria_id,
      ferreterias (nombre, telefono_whatsapp)
    `)
    .eq('resuelto', false)
    .order('created_at', { ascending: false })
  return data ?? []
}

async function getYCloudStatus() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('configuracion_ycloud')
    .select('id, numero_whatsapp, estado_conexion, ultimo_mensaje_at, ultimo_error, ferreteria_id, ferreterias(nombre)')
    .order('estado_conexion')
  return data ?? []
}

const TIPO_EMOJI: Record<string, string> = {
  ycloud_error:      '📡',
  ia_error:          '🤖',
  mp_error:          '💳',
  webhook_caido:     '🔔',
  creditos_agotados: '⚠️',
  creditos_bajos:    '📉',
  token_expirado:    '🔑',
}

const CONEXION_COLORS: Record<string, string> = {
  activo:       'text-green-400',
  error:        'text-red-400',
  desconectado: 'text-gray-400',
  pendiente:    'text-yellow-400',
}

export default async function SaludPage() {
  const [incidencias, ycloud, apis] = await Promise.all([
    getIncidencias(),
    getYCloudStatus(),
    checkAllApis(),
  ])

  const apisOk      = apis.filter((a) => a.status === 'ok').length
  const apisError   = apis.filter((a) => a.status === 'error').length
  const apisTotal   = apis.filter((a) => a.status !== 'no_configurado').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Salud del sistema</h1>
        <p className="text-gray-400 text-sm mt-1">
          {incidencias.length === 0
            ? 'Todo OK — sin incidencias activas 🎉'
            : `${incidencias.length} incidencia${incidencias.length > 1 ? 's' : ''} sin resolver`}
        </p>
      </div>

      {/* ── Estado de APIs externas ───────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400">APIs de IA</h2>
          <span className="text-xs text-gray-500">
            {apisOk}/{apisTotal} operativas
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {apis.map((api) => {
            const isOk    = api.status === 'ok'
            const isError = api.status === 'error'
            const isNoCfg = api.status === 'no_configurado'
            return (
              <div
                key={api.nombre}
                className={`rounded-xl border p-4 ${
                  isOk    ? 'bg-green-950/20 border-green-900/50' :
                  isError ? 'bg-red-950/20 border-red-900/50' :
                            'bg-gray-900 border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-white">{api.nombre}</span>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                    isOk    ? 'bg-green-900/60 text-green-300' :
                    isError ? 'bg-red-900/60 text-red-300' :
                              'bg-gray-800 text-gray-500'
                  }`}>
                    {isOk ? '✓ OK' : isError ? '✗ Error' : '— Sin clave'}
                  </span>
                </div>
                {api.latencia_ms !== null && (
                  <p className="text-xs text-gray-500">{api.latencia_ms} ms</p>
                )}
                {api.detalle && (
                  <p className={`text-xs mt-1 ${isError ? 'text-red-400' : 'text-gray-500'}`}>
                    {api.detalle}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Incidencias activas ───────────────────────────────── */}
      {incidencias.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Incidencias sin resolver</h2>
          {incidencias.map((inc) => {
            const ferr = (inc as any).ferreterias
            return (
              <div key={inc.id} className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{TIPO_EMOJI[inc.tipo ?? ''] ?? '⚠️'}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm text-red-300">{inc.tipo}</span>
                      {ferr && (
                        <span className="text-xs text-gray-500">
                          — <a href={`/superadmin/tenants/${inc.ferreteria_id}`} className="hover:text-gray-300">{ferr.nombre}</a>
                        </span>
                      )}
                    </div>
                    {inc.detalle && <p className="text-gray-400 text-sm">{inc.detalle}</p>}
                    <p className="text-gray-600 text-xs mt-1">
                      {new Date(inc.created_at).toLocaleString('es-PE')}
                    </p>
                  </div>
                </div>
                <ResolverIncidencia incidenciaId={inc.id} />
              </div>
            )
          })}
        </div>
      )}

      {incidencias.length === 0 && (
        <div className="mb-8 bg-green-950/10 border border-green-900/30 rounded-xl p-5 text-center">
          <p className="text-green-400 text-sm font-medium">🎉 Sin incidencias activas</p>
          <p className="text-gray-500 text-xs mt-1">Todos los sistemas funcionan correctamente</p>
        </div>
      )}

      {/* ── Conexiones YCloud ─────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-medium">Conexiones WhatsApp por tenant</h3>
          <span className="text-xs text-gray-500">{ycloud.length} configuradas</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Ferretería</th>
              <th className="px-4 py-3 font-medium">Número</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Último mensaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {ycloud.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">
                  No hay ferreterías con YCloud configurado
                </td>
              </tr>
            )}
            {ycloud.map((y) => {
              const ferr  = (y as any).ferreterias
              const estado = y.estado_conexion ?? 'pendiente'
              return (
                <tr key={y.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <a href={`/superadmin/tenants/${y.ferreteria_id}`} className="text-white hover:text-orange-400">
                      {ferr?.nombre ?? '—'}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">+{y.numero_whatsapp}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${CONEXION_COLORS[estado] ?? ''}`}>{estado}</span>
                    {y.ultimo_error && (
                      <p className="text-xs text-red-400 mt-0.5 truncate max-w-xs">{y.ultimo_error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {y.ultimo_mensaje_at
                      ? new Date(y.ultimo_mensaje_at).toLocaleString('es-PE')
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
