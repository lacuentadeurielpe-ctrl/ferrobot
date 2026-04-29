'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bike, Car, Truck, Package2, Plus, Pencil, Trash2,
  Loader2, Check, X, AlertTriangle, MapPin, Gauge,
  Weight, Clock, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TipoVehiculo = 'moto' | 'auto' | 'camioneta' | 'camion'

interface Vehiculo {
  id: string
  nombre: string
  tipo: TipoVehiculo
  capacidad_kg: number
  capacidad_m3: number
  velocidad_promedio_kmh: number
  costo_por_km: number | null
  activo: boolean
  created_at: string
}

// ── Metadata por tipo ──────────────────────────────────────────────────────────

const TIPOS: Record<TipoVehiculo, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  velDefault: number
  kgDefault: number
}> = {
  moto:      { label: 'Moto',      icon: Bike,     color: 'text-orange-500 bg-orange-50',  velDefault: 35, kgDefault: 50   },
  auto:      { label: 'Auto',      icon: Car,      color: 'text-blue-500   bg-blue-50',    velDefault: 30, kgDefault: 200  },
  camioneta: { label: 'Camioneta', icon: Truck,    color: 'text-violet-500 bg-violet-50',  velDefault: 25, kgDefault: 600  },
  camion:    { label: 'Camión',    icon: Package2, color: 'text-zinc-600   bg-zinc-100',   velDefault: 20, kgDefault: 2000 },
}

const FORM_EMPTY = {
  nombre:                 '',
  tipo:                   'moto' as TipoVehiculo,
  capacidad_kg:           50,
  capacidad_m3:           0.3,
  velocidad_promedio_kmh: 35,
  costo_por_km:           '',
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  ferreteriaLat?: number | null
  ferreteriaLng?: number | null
  ferreteriaDir?: string | null
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function VehiculosSection({ ferreteriaLat, ferreteriaLng, ferreteriaDir }: Props) {
  const [vehiculos,      setVehiculos]      = useState<Vehiculo[]>([])
  const [cargando,       setCargando]       = useState(true)
  const [form,           setForm]           = useState(FORM_EMPTY)
  const [mostrarForm,    setMostrarForm]    = useState(false)
  const [editandoId,     setEditandoId]     = useState<string | null>(null)
  const [guardando,      setGuardando]      = useState(false)
  const [eliminando,     setEliminando]     = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [tieneUbicacion, setTieneUbicacion] = useState(!!(ferreteriaLat && ferreteriaLng))
  const [geocodificando, setGeocodificando] = useState(false)
  const [geoError,       setGeoError]       = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const res  = await fetch('/api/vehiculos')
    const data = await res.json()
    if (Array.isArray(data)) setVehiculos(data)
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Actualizar tipo predeterminado → velocidad / capacidad cuando cambia tipo
  function handleTipo(tipo: TipoVehiculo) {
    const meta = TIPOS[tipo]
    setForm(f => ({
      ...f,
      tipo,
      velocidad_promedio_kmh: meta.velDefault,
      capacidad_kg:           meta.kgDefault,
    }))
  }

  async function geocodificarLocal() {
    setGeocodificando(true)
    setGeoError(null)
    const res = await fetch('/api/settings/geocode', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setTieneUbicacion(true)
    } else {
      setGeoError(data.error ?? 'Error al ubicar la dirección')
    }
    setGeocodificando(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    setGuardando(true); setError(null)

    const payload = {
      nombre:                 form.nombre.trim(),
      tipo:                   form.tipo,
      capacidad_kg:           Number(form.capacidad_kg),
      capacidad_m3:           Number(form.capacidad_m3),
      velocidad_promedio_kmh: Number(form.velocidad_promedio_kmh),
      costo_por_km:           form.costo_por_km ? Number(form.costo_por_km) : null,
    }

    const url    = editandoId ? `/api/vehiculos/${editandoId}` : '/api/vehiculos'
    const method = editandoId ? 'PATCH' : 'POST'

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
    } else {
      setMostrarForm(false)
      setEditandoId(null)
      setForm(FORM_EMPTY)
      await cargar()
    }
    setGuardando(false)
  }

  async function toggleActivo(v: Vehiculo) {
    await fetch(`/api/vehiculos/${v.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ activo: !v.activo }),
    })
    await cargar()
  }

  async function eliminar(id: string) {
    setEliminando(id)
    const res  = await fetch(`/api/vehiculos/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al eliminar')
    } else {
      await cargar()
    }
    setEliminando(null)
  }

  function abrirEditar(v: Vehiculo) {
    setEditandoId(v.id)
    setForm({
      nombre:                 v.nombre,
      tipo:                   v.tipo,
      capacidad_kg:           v.capacidad_kg,
      capacidad_m3:           v.capacidad_m3,
      velocidad_promedio_kmh: v.velocidad_promedio_kmh,
      costo_por_km:           v.costo_por_km?.toString() ?? '',
    })
    setMostrarForm(true)
    setError(null)
  }

  function cancelar() {
    setMostrarForm(false)
    setEditandoId(null)
    setForm(FORM_EMPTY)
    setError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Banner de ubicación */}
      {!tieneUbicacion && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Activa el cálculo de ETA</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {ferreteriaDir
                ? `Ubicaremos tu local en: "${ferreteriaDir}"`
                : 'Primero configura la dirección de tu negocio en la pestaña General.'}
            </p>
            {geoError && <p className="text-xs text-red-600 mt-1">{geoError}</p>}
          </div>
          {ferreteriaDir && (
            <button
              onClick={geocodificarLocal}
              disabled={geocodificando}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shrink-0"
            >
              {geocodificando
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <MapPin className="w-3.5 h-3.5" />}
              Activar ETA
            </button>
          )}
        </div>
      )}

      {tieneUbicacion && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm text-emerald-700">
            <span className="font-semibold">ETA activa</span> — el sistema calculará tiempos de entrega automáticamente para pedidos delivery.
          </p>
        </div>
      )}

      {/* Header + botón agregar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800">
            {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} registrado{vehiculos.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">Motos, autos, camionetas y camiones de reparto</p>
        </div>
        <button
          onClick={() => { cancelar(); setMostrarForm(true) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl transition"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar vehículo
        </button>
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-800">
            {editandoId ? 'Editar vehículo' : 'Nuevo vehículo'}
          </p>

          {/* Tipo */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-2 block">Tipo</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(TIPOS) as [TipoVehiculo, typeof TIPOS[TipoVehiculo]][]).map(([key, meta]) => {
                const Icon = meta.icon
                return (
                  <button
                    key={key}
                    onClick={() => handleTipo(key)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-medium transition',
                      form.tipo === key
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700',
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1 block">Nombre / Placa</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder={`Ej: "Moto azul", "Camioneta blanca JBC-123"`}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
            />
          </div>

          {/* Capacidad y velocidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1 block flex items-center gap-1">
                <Weight className="w-3 h-3" /> Capacidad (kg)
              </label>
              <input
                type="number" min="1" step="10"
                value={form.capacidad_kg}
                onChange={e => setForm(f => ({ ...f, capacidad_kg: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1 block flex items-center gap-1">
                <Gauge className="w-3 h-3" /> Velocidad prom. (km/h)
              </label>
              <input
                type="number" min="5" max="120" step="5"
                value={form.velocidad_promedio_kmh}
                onChange={e => setForm(f => ({ ...f, velocidad_promedio_kmh: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1 block">
                Capacidad (m³) <span className="text-zinc-400 normal-case font-normal">opcional</span>
              </label>
              <input
                type="number" min="0.01" step="0.1"
                value={form.capacidad_m3}
                onChange={e => setForm(f => ({ ...f, capacidad_m3: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1 block">
                Costo / km (S/) <span className="text-zinc-400 normal-case font-normal">opcional</span>
              </label>
              <input
                type="number" min="0" step="0.5"
                value={form.costo_por_km}
                onChange={e => setForm(f => ({ ...f, costo_por_km: e.target.value }))}
                placeholder="—"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editandoId ? 'Guardar cambios' : 'Agregar'}
            </button>
            <button onClick={cancelar} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 rounded-xl hover:bg-zinc-100 transition">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de vehículos */}
      {cargando ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : vehiculos.length === 0 ? (
        <div className="text-center py-10 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
          <Truck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 font-medium">Sin vehículos registrados</p>
          <p className="text-xs text-zinc-400 mt-1">Agrega tu primera moto o camioneta de reparto</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vehiculos.map(v => {
            const meta = TIPOS[v.tipo] ?? TIPOS['moto']
            const Icon = meta.icon
            return (
              <div
                key={v.id}
                className={cn(
                  'flex items-center gap-3 bg-white border rounded-2xl px-4 py-3 transition',
                  v.activo ? 'border-zinc-200' : 'border-zinc-100 opacity-60',
                )}
              >
                {/* Icono tipo */}
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', meta.color)}>
                  <Icon className="w-4.5 h-4.5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{v.nombre}</p>
                    <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full">
                      {meta.label}
                    </span>
                    {!v.activo && (
                      <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-0.5"><Weight className="w-2.5 h-2.5" /> {v.capacidad_kg} kg</span>
                    <span className="flex items-center gap-0.5"><Gauge className="w-2.5 h-2.5" /> {v.velocidad_promedio_kmh} km/h</span>
                    <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />
                      ETA base ~{Math.ceil((5 / v.velocidad_promedio_kmh) * 60 * 1.35) + 10} min / 5 km
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle activo */}
                  <button
                    onClick={() => toggleActivo(v)}
                    title={v.activo ? 'Desactivar' : 'Activar'}
                    className={cn(
                      'text-xs px-2 py-1 rounded-lg font-medium transition',
                      v.activo
                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-zinc-400 bg-zinc-50 hover:bg-zinc-100',
                    )}
                  >
                    {v.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    onClick={() => abrirEditar(v)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => eliminar(v.id)}
                    disabled={eliminando === v.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-50"
                  >
                    {eliminando === v.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && !mostrarForm && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  )
}
