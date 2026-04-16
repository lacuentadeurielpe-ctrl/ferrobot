'use client'

import { useState, useEffect, useCallback } from 'react'
import { Truck, Plus, UserX, UserCheck, Loader2, Copy, Check, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Repartidor {
  id: string
  nombre: string
  telefono: string | null
  activo: boolean
  token: string
  created_at: string
}

export default function RepartidoresSection() {
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [cargando, setCargando] = useState(true)
  const [accionando, setAccionando] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', telefono: '' })
  const [guardando, setGuardando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/repartidores')
      if (res.ok) setRepartidores(await res.json())
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setGuardando(true)
    try {
      const res = await fetch('/api/repartidores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const nuevo = await res.json()
        setRepartidores((prev) => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        setForm({ nombre: '', telefono: '' })
        setMostrarForm(false)
      }
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(id: string, activo: boolean) {
    setAccionando(id)
    try {
      const res = await fetch(`/api/repartidores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      })
      if (res.ok) {
        setRepartidores((prev) => prev.map((r) => r.id === id ? { ...r, activo: !activo } : r))
      }
    } finally {
      setAccionando(null)
    }
  }

  function getLinkRepartidor(token: string) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/delivery/${token}`
  }

  async function copiarLink(token: string) {
    await navigator.clipboard.writeText(getLinkRepartidor(token))
    setCopiado(token)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Repartidores</h2>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      {/* Formulario de nuevo repartidor */}
      {mostrarForm && (
        <form onSubmit={agregar} className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Carlos Flores"
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Teléfono (opcional)</label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="Ej: 987654321"
              type="tel"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : repartidores.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No hay repartidores. Agrega uno para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {repartidores.map((r) => (
            <div
              key={r.id}
              className={cn(
                'border rounded-xl p-3 transition',
                r.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.nombre}</p>
                  {r.telefono && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-gray-400" />
                      <p className="text-xs text-gray-400">{r.telefono}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    r.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  )}>
                    {r.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => toggleActivo(r.id, r.activo)}
                    disabled={accionando === r.id}
                    title={r.activo ? 'Desactivar' : 'Activar'}
                    className="text-gray-400 hover:text-gray-600 transition"
                  >
                    {accionando === r.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : r.activo
                      ? <UserX className="w-4 h-4 text-red-400" />
                      : <UserCheck className="w-4 h-4 text-green-500" />
                    }
                  </button>
                </div>
              </div>

              {/* Link del repartidor */}
              {r.activo && (
                <div className="mt-2 flex items-center gap-2 bg-orange-50 rounded-lg px-2.5 py-1.5">
                  <p className="text-xs text-orange-700 truncate flex-1 font-mono">
                    {getLinkRepartidor(r.token)}
                  </p>
                  <button
                    onClick={() => copiarLink(r.token)}
                    className="shrink-0 text-xs font-medium text-orange-600 hover:text-orange-800 flex items-center gap-1"
                  >
                    {copiado === r.token
                      ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</>
                      : <><Copy className="w-3.5 h-3.5" /> Copiar link</>
                    }
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Cada repartidor recibe un link único que puede abrir en su celular para ver y gestionar sus entregas.
      </p>
    </div>
  )
}
