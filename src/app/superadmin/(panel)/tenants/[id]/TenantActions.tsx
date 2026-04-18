'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  tenantId:     string
  estadoActual: string
  nombre:       string
  ycloudConfigurado: boolean
}

type Panel = 'none' | 'creditos' | 'ycloud'

export default function TenantActions({ tenantId, estadoActual, nombre, ycloudConfigurado }: Props) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)
  const [panel,   setPanel]   = useState<Panel>('none')
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Créditos
  const [creditos, setCreditos] = useState(500)
  const [motivo,   setMotivo]   = useState('recarga_manual')

  // YCloud
  const [ycApiKey,        setYcApiKey]        = useState('')
  const [ycWebhookSecret, setYcWebhookSecret] = useState('')
  const [ycNumero,        setYcNumero]        = useState('')
  const [mostrarApiKey,   setMostrarApiKey]   = useState(false)

  const secret = process.env.NEXT_PUBLIC_SUPERADMIN_SECRET ?? ''

  function togglePanel(p: Panel) {
    setPanel((prev) => prev === p ? 'none' : p)
    setError(null)
    setSuccess(null)
  }

  async function cambiarEstado(nuevoEstado: string) {
    if (!confirm(`¿Cambiar "${nombre}" a estado "${nuevoEstado}"?`)) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-secret': secret },
      body: JSON.stringify({ estado_tenant: nuevoEstado }),
    })
    if (res.ok) { setSuccess(`Estado → ${nuevoEstado}`); router.refresh() }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
    setLoading(false)
  }

  async function agregarCreditos() {
    if (creditos <= 0) return
    setLoading(true); setError(null)
    const res = await fetch(`/api/superadmin/tenants/${tenantId}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-secret': secret },
      body: JSON.stringify({ creditos, motivo }),
    })
    if (res.ok) { setSuccess(`+${creditos} créditos`); setPanel('none'); router.refresh() }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
    setLoading(false)
  }

  async function guardarYCloud(e: React.FormEvent) {
    e.preventDefault()
    if (!ycApiKey.trim() && !ycloudConfigurado) { setError('La API Key es requerida'); return }
    if (!ycNumero.trim()) { setError('El número es requerido'); return }
    setLoading(true); setError(null)
    const body: Record<string, string> = { numero_whatsapp: ycNumero.trim() }
    if (ycApiKey.trim()) body.api_key = ycApiKey.trim()
    if (ycWebhookSecret.trim()) body.webhook_secret = ycWebhookSecret.trim()
    const res = await fetch(`/api/superadmin/tenants/${tenantId}/ycloud`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-secret': secret },
      body: JSON.stringify(body),
    })
    if (res.ok) { setSuccess('YCloud configurado'); setPanel('none'); router.refresh() }
    else { const d = await res.json(); setError(d.error ?? 'Error guardando YCloud') }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-2 min-w-[260px]">
      {(error || success) && (
        <p className={`text-xs text-right ${error ? 'text-red-400' : 'text-green-400'}`}>
          {error || success}
        </p>
      )}

      {/* Botones principales */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          onClick={() => togglePanel('creditos')}
          className="px-3 py-1.5 bg-orange-500/20 border border-orange-700 text-orange-300 rounded-lg text-sm hover:bg-orange-500/30 transition-colors"
        >
          + Créditos
        </button>
        <button
          onClick={() => togglePanel('ycloud')}
          className="px-3 py-1.5 bg-green-900/30 border border-green-700 text-green-300 rounded-lg text-sm hover:bg-green-900/50 transition-colors"
        >
          {ycloudConfigurado ? '📡 YCloud' : '📡 Configurar WA'}
        </button>
        {estadoActual !== 'activo' && (
          <button onClick={() => cambiarEstado('activo')} disabled={loading}
            className="px-3 py-1.5 bg-green-900/40 border border-green-700 text-green-300 rounded-lg text-sm hover:bg-green-900/60 disabled:opacity-50 transition-colors">
            Activar
          </button>
        )}
        {estadoActual !== 'suspendido' && estadoActual !== 'cancelado' && (
          <button onClick={() => cambiarEstado('suspendido')} disabled={loading}
            className="px-3 py-1.5 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm hover:bg-red-900/60 disabled:opacity-50 transition-colors">
            Suspender
          </button>
        )}
      </div>

      {/* Panel: Agregar créditos */}
      {panel === 'creditos' && (
        <div className="mt-2 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
          <p className="text-sm font-medium text-white">Agregar créditos</p>
          <div>
            <label className="text-xs text-gray-400">Cantidad</label>
            <input type="number" value={creditos} onChange={(e) => setCreditos(Number(e.target.value))}
              min={1} max={100000}
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm">
              <option value="recarga_manual">Recarga manual</option>
              <option value="plan_mensual">Renovación plan mensual</option>
              <option value="compensacion">Compensación</option>
              <option value="trial">Trial</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={agregarCreditos} disabled={loading || creditos <= 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg py-1.5 transition-colors">
              {loading ? 'Procesando...' : 'Confirmar'}
            </button>
            <button onClick={() => setPanel('none')} className="px-3 text-gray-400 hover:text-white text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Panel: Configurar YCloud */}
      {panel === 'ycloud' && (
        <form onSubmit={guardarYCloud} className="mt-2 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
          <p className="text-sm font-medium text-white">
            {ycloudConfigurado ? 'Actualizar YCloud' : 'Configurar YCloud'}
          </p>

          <div>
            <label className="text-xs text-gray-400">Número WhatsApp (sin +) *</label>
            <input type="text" value={ycNumero} onChange={(e) => setYcNumero(e.target.value)}
              placeholder="51987654321"
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" required />
          </div>

          <div>
            <label className="text-xs text-gray-400">
              API Key{!ycloudConfigurado ? ' *' : ' (vacío = mantener actual)'}
            </label>
            <div className="relative mt-1">
              <input type={mostrarApiKey ? 'text' : 'password'} value={ycApiKey}
                onChange={(e) => setYcApiKey(e.target.value)}
                placeholder={ycloudConfigurado ? '••••••••' : 'API Key de YCloud'}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 pr-10 text-white text-sm" />
              <button type="button" onClick={() => setMostrarApiKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs">
                {mostrarApiKey ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Webhook Secret (vacío = mantener actual)</label>
            <input type="password" value={ycWebhookSecret} onChange={(e) => setYcWebhookSecret(e.target.value)}
              placeholder="••••••••"
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg py-1.5 transition-colors">
              {loading ? 'Guardando...' : 'Guardar YCloud'}
            </button>
            <button type="button" onClick={() => setPanel('none')} className="px-3 text-gray-400 hover:text-white text-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
