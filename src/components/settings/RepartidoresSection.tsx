'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Truck, Plus, UserX, UserCheck, Loader2, Copy, Check,
  Phone, Shuffle, ListOrdered, ShieldCheck, ShieldOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Repartidor {
  id: string
  nombre: string
  telefono: string | null
  activo: boolean
  token: string
  puede_registrar_deuda: boolean
  created_at: string
}

export default function RepartidoresSection({
  modoInicial = 'manual',
}: {
  modoInicial?: 'manual' | 'libre'
}) {
  const [repartidores,   setRepartidores]   = useState<Repartidor[]>([])
  const [cargando,       setCargando]       = useState(true)
  const [accionando,     setAccionando]     = useState<string | null>(null)
  const [copiado,        setCopiado]        = useState<string | null>(null)
  const [form,           setForm]           = useState({ nombre: '', telefono: '' })
  const [guardando,      setGuardando]      = useState(false)
  const [mostrarForm,    setMostrarForm]    = useState(false)
  const [modo,           setModo]           = useState<'manual' | 'libre'>(modoInicial)
  const [guardandoModo,  setGuardandoModo]  = useState(false)

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

  async function toggleModo() {
    const nuevoModo = modo === 'manual' ? 'libre' : 'manual'
    setGuardandoModo(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo_asignacion_delivery: nuevoModo }),
      })
      if (res.ok) setModo(nuevoModo)
    } finally {
      setGuardandoModo(false)
    }
  }

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
    setAccionando(id + '_activo')
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

  async function toggleDeuda(id: string, puedeRegistrarDeuda: boolean) {
    setAccionando(id + '_deuda')
    try {
      const res = await fetch(`/api/repartidores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puede_registrar_deuda: !puedeRegistrarDeuda }),
      })
      if (res.ok) {
        setRepartidores((prev) => prev.map((r) =>
          r.id === id ? { ...r, puede_registrar_deuda: !puedeRegistrarDeuda } : r
        ))
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
    <div className="bg-white rounded-2xl border border-zinc-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-zinc-600" />
          <h2 className="font-semibold text-zinc-900">Repartidores</h2>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-xl transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      {/* Modo de asignación */}
      <div className="mb-5 bg-zinc-50 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {modo === 'libre'
              ? <Shuffle className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
              : <ListOrdered className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            }
            <div>
              <p className="text-sm font-medium text-zinc-900">
                Modo {modo === 'libre' ? 'libre' : 'manual'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {modo === 'libre'
                  ? 'Al confirmar un pedido, todos los repartidores activos reciben un WhatsApp y el primero que lo acepta se lo lleva.'
                  : 'Asignas manualmente cada pedido a un repartidor desde el panel de pedidos.'
                }
              </p>
            </div>
          </div>
          <button
            onClick={toggleModo}
            disabled={guardandoModo}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50',
              modo === 'libre' ? 'bg-zinc-900' : 'bg-zinc-200'
            )}
          >
            <span className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              modo === 'libre' ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
        </div>
        {modo === 'libre' && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-3">
            ⚠️ Para que funcione el modo libre, los repartidores necesitan tener teléfono registrado y el sistema necesita WhatsApp configurado.
          </p>
        )}
      </div>

      {/* Formulario de nuevo repartidor */}
      {mostrarForm && (
        <form onSubmit={agregar} className="bg-zinc-50 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Carlos Flores"
              required
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 mb-1 block">
              Teléfono {modo === 'libre' && <span className="text-zinc-500">* requerido para modo libre</span>}
            </label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="Ej: 51987654321"
              type="tel"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMostrarForm(false)}
              className="flex-1 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-xl hover:bg-zinc-100 transition">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="flex-1 py-2 text-sm font-medium bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 py-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : repartidores.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-6">
          No hay repartidores. Agrega uno para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {repartidores.map((r) => (
            <div key={r.id} className={cn(
              'border rounded-xl p-3 transition',
              r.activo ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50 opacity-60'
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900">{r.nombre}</p>
                    {modo === 'libre' && !r.telefono && r.activo && (
                      <span className="text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">sin tel.</span>
                    )}
                  </div>
                  {r.telefono && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-zinc-400" />
                      <p className="text-xs text-zinc-400">{r.telefono}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    r.activo ? 'bg-green-50 text-green-700' : 'bg-zinc-100 text-zinc-500'
                  )}>
                    {r.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => toggleActivo(r.id, r.activo)}
                    disabled={accionando === r.id + '_activo'}
                    title={r.activo ? 'Desactivar' : 'Activar'}
                    className="text-zinc-400 hover:text-zinc-600 transition"
                  >
                    {accionando === r.id + '_activo'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : r.activo
                      ? <UserX className="w-4 h-4 text-red-400" />
                      : <UserCheck className="w-4 h-4 text-green-500" />
                    }
                  </button>
                </div>
              </div>

              {/* Permiso de deuda */}
              {r.activo && (
                <div className="mt-2.5 flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.puede_registrar_deuda
                      ? <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      : <ShieldOff className="w-3.5 h-3.5 text-zinc-400" />
                    }
                    <span className="text-xs text-zinc-600 font-medium">
                      {r.puede_registrar_deuda ? 'Puede registrar cobros parciales' : 'Sin permiso de deuda'}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleDeuda(r.id, r.puede_registrar_deuda)}
                    disabled={accionando === r.id + '_deuda'}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50',
                      r.puede_registrar_deuda ? 'bg-amber-500' : 'bg-zinc-200'
                    )}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                      r.puede_registrar_deuda ? 'translate-x-4' : 'translate-x-0'
                    )} />
                  </button>
                </div>
              )}

              {/* Link de acceso */}
              {r.activo && (
                <div className="mt-2 flex items-center gap-2 bg-zinc-100 rounded-xl px-2.5 py-1.5">
                  <p className="text-xs text-zinc-700 truncate flex-1 font-mono">
                    {getLinkRepartidor(r.token)}
                  </p>
                  <button
                    onClick={() => copiarLink(r.token)}
                    className="shrink-0 text-xs font-medium text-zinc-600 hover:text-zinc-900 flex items-center gap-1"
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

      <p className="text-xs text-zinc-400 mt-4">
        Cada repartidor recibe un link único que puede abrir en su celular para gestionar sus entregas.
        El permiso de <strong>cobros parciales</strong> permite registrar deudas cuando el cliente paga menos del total.
      </p>
    </div>
  )
}
