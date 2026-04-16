'use client'

import { useState } from 'react'
import { cn, formatPEN } from '@/lib/utils'
import { CheckCircle2, Plus, Loader2, TrendingUp, TrendingDown, Minus, ClipboardList } from 'lucide-react'
import type { Rol } from '@/lib/auth/roles'
import type { PermisoMap } from '@/lib/auth/permisos'

interface Rendicion {
  id: string
  repartidor_id: string
  fecha: string
  monto_esperado: number
  monto_recibido: number
  diferencia: number
  confirmado_por: string | null
  confirmado_at: string | null
  created_at: string
  repartidores: { id: string; nombre: string; telefono: string | null } | null
}

interface RepartidorSimple {
  id: string
  nombre: string
}

export default function RendicionesView({
  rendiciones: inicial,
  repartidores,
  rol = 'dueno',
  permisos,
}: {
  rendiciones: Rendicion[]
  repartidores: RepartidorSimple[]
  rol?: Rol
  permisos?: Partial<PermisoMap>
}) {
  const [rendiciones, setRendiciones] = useState(inicial)
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [form, setForm] = useState({ repartidor_id: '', fecha: new Date().toISOString().slice(0, 10) })
  const [mostrarForm, setMostrarForm] = useState(false)

  async function generarRendicion(e: React.FormEvent) {
    e.preventDefault()
    if (!form.repartidor_id) return alert('Selecciona un repartidor')
    setGenerando(true)
    try {
      const res = await fetch('/api/rendiciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al generar')
      }
      const nueva = await res.json()
      setRendiciones((prev) => [nueva, ...prev])
      setMostrarForm(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerando(false)
    }
  }

  function diferenciaIcon(diferencia: number) {
    if (Math.abs(diferencia) < 0.01) return <Minus className="w-3.5 h-3.5 text-gray-400" />
    if (diferencia > 0) return <TrendingUp className="w-3.5 h-3.5 text-green-600" />
    return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
  }

  function diferenciaColor(diferencia: number) {
    if (Math.abs(diferencia) < 0.01) return 'text-gray-500'
    return diferencia > 0 ? 'text-green-700' : 'text-red-600'
  }

  return (
    <div>
      {/* Botón generar rendición */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Generar rendición
        </button>
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <form onSubmit={generarRendicion} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Nueva rendición</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Repartidor *</label>
              <select
                required
                value={form.repartidor_id}
                onChange={(e) => setForm({ ...form, repartidor_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">— Seleccionar —</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Fecha *</label>
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMostrarForm(false)}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
              Cancelar
            </button>
            <button type="submit" disabled={generando}
              className="flex-1 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg transition flex items-center justify-center gap-2">
              {generando && <Loader2 className="w-4 h-4 animate-spin" />}
              Generar
            </button>
          </div>
          <p className="text-xs text-gray-400">Se calculará automáticamente con los pedidos entregados ese día.</p>
        </form>
      )}

      {/* Lista de rendiciones */}
      {rendiciones.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay rendiciones generadas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rendiciones.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {r.repartidores?.nombre ?? 'Repartidor'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Esperado</p>
                    <p className="text-sm font-semibold text-gray-700">{formatPEN(r.monto_esperado)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Recibido</p>
                    <p className="text-sm font-semibold text-gray-700">{formatPEN(r.monto_recibido)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Diferencia</p>
                    <p className={cn('text-sm font-bold flex items-center gap-0.5', diferenciaColor(r.diferencia))}>
                      {diferenciaIcon(r.diferencia)}
                      {Math.abs(r.diferencia) < 0.01 ? '—' : formatPEN(Math.abs(r.diferencia))}
                    </p>
                  </div>
                </div>
              </div>

              {r.confirmado_at && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg px-2.5 py-1 w-fit">
                  <CheckCircle2 className="w-3 h-3" />
                  Confirmado {new Date(r.confirmado_at).toLocaleDateString('es-PE')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

