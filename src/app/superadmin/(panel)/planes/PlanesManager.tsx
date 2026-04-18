'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plan {
  id:             string
  nombre:         string
  creditos_mes:   number
  precio_mensual: number
  precio_exceso:  number
  activo:         boolean
}

interface Props {
  planes: Plan[]
  secret: string
}

export default function PlanesManager({ planes, secret }: Props) {
  const router = useRouter()
  const [editando,  setEditando]  = useState<string | null>(null)
  const [creando,   setCreando]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  // Form state para editar / crear
  const [form, setForm] = useState({ nombre: '', creditos_mes: 0, precio_mensual: 0, precio_exceso: 0 })

  function abrirEditar(plan: Plan) {
    setEditando(plan.id)
    setCreando(false)
    setForm({ nombre: plan.nombre, creditos_mes: plan.creditos_mes, precio_mensual: Number(plan.precio_mensual), precio_exceso: Number(plan.precio_exceso) })
    setError(null); setSuccess(null)
  }

  function abrirCrear() {
    setCreando(true)
    setEditando(null)
    setForm({ nombre: '', creditos_mes: 500, precio_mensual: 99, precio_exceso: 0.10 })
    setError(null); setSuccess(null)
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    setLoading(true); setError(null)

    const url    = editando ? `/api/superadmin/planes/${editando}` : '/api/superadmin/planes'
    const method = editando ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-superadmin-secret': secret },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      setSuccess(editando ? 'Plan actualizado' : 'Plan creado')
      setEditando(null); setCreando(false)
      router.refresh()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error guardando plan')
    }
    setLoading(false)
  }

  async function desactivar(id: string, nombre: string) {
    if (!confirm(`¿Desactivar el plan "${nombre}"?`)) return
    setLoading(true); setError(null)
    const res = await fetch(`/api/superadmin/planes/${id}`, {
      method: 'DELETE',
      headers: { 'x-superadmin-secret': secret },
    })
    if (res.ok) { setSuccess('Plan desactivado'); router.refresh() }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
    setLoading(false)
  }

  const formatPEN = (n: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n)

  return (
    <div>
      {(error || success) && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${error ? 'bg-red-900/30 border border-red-800 text-red-300' : 'bg-green-900/30 border border-green-800 text-green-300'}`}>
          {error || success}
        </div>
      )}

      <div className="space-y-3">
        {planes.map((plan) => (
          <div key={plan.id} className={`bg-gray-900 border rounded-xl p-5 ${!plan.activo ? 'opacity-50 border-gray-800' : 'border-gray-700'}`}>
            {editando === plan.id ? (
              <FormPlan form={form} setForm={setForm} onGuardar={guardar} onCancelar={() => setEditando(null)} loading={loading} />
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{plan.nombre}</h3>
                    {!plan.activo && <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">Inactivo</span>}
                  </div>
                  <div className="flex gap-4 mt-2 text-sm text-gray-400">
                    <span>🪙 {plan.creditos_mes.toLocaleString()} cr/mes</span>
                    <span>💰 {formatPEN(Number(plan.precio_mensual))}/mes</span>
                    <span>📈 {formatPEN(Number(plan.precio_exceso))}/cr exceso</span>
                  </div>
                </div>
                {plan.activo && (
                  <div className="flex gap-2">
                    <button onClick={() => abrirEditar(plan)}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg transition-colors">
                      Editar
                    </button>
                    <button onClick={() => desactivar(plan.id, plan.nombre)}
                      className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-800 text-red-400 rounded-lg transition-colors">
                      Desactivar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Crear nuevo */}
        {creando ? (
          <div className="bg-gray-900 border border-orange-800/50 rounded-xl p-5">
            <p className="text-sm font-medium text-orange-300 mb-4">Nuevo plan</p>
            <FormPlan form={form} setForm={setForm} onGuardar={guardar} onCancelar={() => setCreando(false)} loading={loading} />
          </div>
        ) : (
          <button onClick={abrirCrear}
            className="w-full py-3 border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded-xl text-sm transition-colors">
            + Nuevo plan
          </button>
        )}
      </div>
    </div>
  )
}

function FormPlan({ form, setForm, onGuardar, onCancelar, loading }: {
  form: { nombre: string; creditos_mes: number; precio_mensual: number; precio_exceso: number }
  setForm: (f: any) => void
  onGuardar: () => void
  onCancelar: () => void
  loading: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">Nombre del plan</label>
          <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Básico, Estándar, Pro..." className="w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Créditos por mes</label>
          <input type="number" value={form.creditos_mes} onChange={(e) => setForm({ ...form, creditos_mes: Number(e.target.value) })}
            min={1} className="w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Precio mensual (S/)</label>
          <input type="number" value={form.precio_mensual} onChange={(e) => setForm({ ...form, precio_mensual: Number(e.target.value) })}
            min={0} step={0.01} className="w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Precio por crédito en exceso (S/)</label>
          <input type="number" value={form.precio_exceso} onChange={(e) => setForm({ ...form, precio_exceso: Number(e.target.value) })}
            min={0} step={0.01} className="w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onGuardar} disabled={loading}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg py-1.5 transition-colors">
          {loading ? 'Guardando...' : 'Guardar plan'}
        </button>
        <button onClick={onCancelar} className="px-3 text-gray-400 hover:text-white text-sm">Cancelar</button>
      </div>
    </div>
  )
}
