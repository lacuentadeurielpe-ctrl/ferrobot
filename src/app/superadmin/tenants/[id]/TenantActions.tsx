'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  tenantId: string
  estadoActual: string
  nombre: string
}

export default function TenantActions({ tenantId, estadoActual, nombre }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showAddCredits, setShowAddCredits] = useState(false)
  const [creditos, setCreditos] = useState(500)
  const [motivo, setMotivo] = useState('recarga_manual')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [motivo_suspension, setMotivoSuspension] = useState('')

  const secret = process.env.NEXT_PUBLIC_SUPERADMIN_SECRET ?? ''

  async function cambiarEstado(nuevoEstado: string) {
    if (!confirm(`¿Cambiar "${nombre}" a estado "${nuevoEstado}"?`)) return
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-superadmin-secret': secret,
      },
      body: JSON.stringify({
        estado_tenant: nuevoEstado,
        suspendido_motivo: nuevoEstado === 'suspendido' ? motivo_suspension : undefined,
      }),
    })

    if (res.ok) {
      setSuccess(`Estado cambiado a ${nuevoEstado}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Error cambiando estado')
    }
    setLoading(false)
  }

  async function agregarCreditos() {
    if (creditos <= 0) return
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/superadmin/tenants/${tenantId}/credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-superadmin-secret': secret,
      },
      body: JSON.stringify({ creditos, motivo }),
    })

    if (res.ok) {
      setSuccess(`${creditos} créditos agregados`)
      setShowAddCredits(false)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Error agregando créditos')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {(error || success) && (
        <p className={`text-xs text-right ${error ? 'text-red-400' : 'text-green-400'}`}>
          {error || success}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setShowAddCredits(!showAddCredits)}
          className="px-3 py-1.5 bg-orange-500/20 border border-orange-700 text-orange-300 rounded-lg text-sm hover:bg-orange-500/30 transition-colors"
        >
          + Créditos
        </button>

        {estadoActual !== 'activo' && (
          <button
            onClick={() => cambiarEstado('activo')}
            disabled={loading}
            className="px-3 py-1.5 bg-green-900/40 border border-green-700 text-green-300 rounded-lg text-sm hover:bg-green-900/60 disabled:opacity-50 transition-colors"
          >
            Activar
          </button>
        )}

        {estadoActual !== 'suspendido' && estadoActual !== 'cancelado' && (
          <button
            onClick={() => cambiarEstado('suspendido')}
            disabled={loading}
            className="px-3 py-1.5 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm hover:bg-red-900/60 disabled:opacity-50 transition-colors"
          >
            Suspender
          </button>
        )}
      </div>

      {/* Modal agregar créditos */}
      {showAddCredits && (
        <div className="mt-2 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
          <p className="text-sm font-medium text-white">Agregar créditos</p>

          <div>
            <label className="text-xs text-gray-400">Cantidad</label>
            <input
              type="number"
              value={creditos}
              onChange={(e) => setCreditos(Number(e.target.value))}
              min={1}
              max={100000}
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">Motivo</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
            >
              <option value="recarga_manual">Recarga manual</option>
              <option value="plan_mensual">Renovación plan mensual</option>
              <option value="compensacion">Compensación</option>
              <option value="trial">Trial</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={agregarCreditos}
              disabled={loading || creditos <= 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg py-1.5 transition-colors"
            >
              {loading ? 'Procesando...' : 'Confirmar'}
            </button>
            <button
              onClick={() => setShowAddCredits(false)}
              className="px-3 text-gray-400 hover:text-white text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
