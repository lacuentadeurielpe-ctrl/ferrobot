'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn, iniciales } from '@/lib/utils'
import {
  Users, Plus, ChevronDown, ChevronUp, Eye, EyeOff,
  Loader2, UserX, UserCheck, KeyRound, Trash2, Check, X,
  ShieldCheck,
} from 'lucide-react'
import {
  GRUPOS_PERMISOS, PLANTILLAS, ETIQUETAS_PLANTILLA, DESCRIPCIONES_PLANTILLA,
  detectarPlantilla, normalizarPermisos,
  type Permiso, type PermisoMap, type PlantillaPermiso,
} from '@/lib/auth/permisos'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Miembro {
  id: string
  user_id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  permisos: Record<string, boolean>
  created_at: string
}

// ── Colores de plantilla ──────────────────────────────────────────────────────

const COLOR_PLANTILLA: Record<PlantillaPermiso, string> = {
  solo_reparte:   'bg-blue-50 text-blue-700',
  atiende_tienda: 'bg-orange-50 text-orange-700',
  hace_de_todo:   'bg-purple-50 text-purple-700',
  de_confianza:   'bg-green-50 text-green-700',
  personalizado:  'bg-gray-100 text-gray-600',
}

// ── Toggle switch reutilizable ────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
        checked ? 'bg-orange-500' : 'bg-gray-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0.5'
      )} />
    </button>
  )
}

// ── Modal nuevo empleado ──────────────────────────────────────────────────────

function ModalNuevoEmpleado({
  onCrear,
  onCerrar,
}: {
  onCrear: (m: Miembro) => void
  onCerrar: () => void
}) {
  const [paso, setPaso] = useState<'datos' | 'permisos'>('datos')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [plantilla, setPlantilla] = useState<PlantillaPermiso>('atiende_tienda')
  const [permisos, setPermisos] = useState<PermisoMap>(normalizarPermisos(PLANTILLAS.atiende_tienda))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function seleccionarPlantilla(p: PlantillaPermiso) {
    setPlantilla(p)
    setPermisos(normalizarPermisos(PLANTILLAS[p]))
  }

  function togglePermiso(key: Permiso, val: boolean) {
    setPermisos((prev) => ({ ...prev, [key]: val }))
    setPlantilla('personalizado')
  }

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!email.trim())  { setError('El correo es obligatorio'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), email: email.trim(), password, plantilla, permisos }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear empleado'); return }
      onCrear(data)
    } catch {
      setError('Error de conexión')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Nuevo empleado</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs paso */}
        <div className="flex border-b border-gray-100">
          {(['datos', 'permisos'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPaso(p)}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition border-b-2 -mb-px',
                paso === p ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400'
              )}
            >
              {p === 'datos' ? '1. Datos' : '2. Permisos'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {/* ── PASO 1: Datos ── */}
          {paso === 'datos' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo <span className="text-red-500">*</span>
                </label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Juan Pérez"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo electrónico <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@ejemplo.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña temporal <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={verPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword(!verPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {verPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">El empleado podrá cambiarla después</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>
          )}

          {/* ── PASO 2: Permisos ── */}
          {paso === 'permisos' && (
            <div className="space-y-4">
              {/* Selector de plantilla */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Plantilla de inicio</p>
                <div className="space-y-2">
                  {(Object.keys(PLANTILLAS) as PlantillaPermiso[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => seleccionarPlantilla(p)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl border transition',
                        plantilla === p
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {ETIQUETAS_PLANTILLA[p]}
                        </span>
                        {plantilla === p && <Check className="w-4 h-4 text-orange-500" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{DESCRIPCIONES_PLANTILLA[p]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ajuste individual */}
              <div>
                <p className="text-xs text-gray-400 mb-3">Ajusta los permisos individuales si necesitas</p>
                <div className="space-y-4">
                  {GRUPOS_PERMISOS.map((grupo) => (
                    <div key={grupo.label}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {grupo.label}
                      </p>
                      <div className="space-y-2">
                        {grupo.permisos.map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-gray-700">{label}</span>
                            <Toggle
                              checked={permisos[key] ?? false}
                              onChange={(v) => togglePermiso(key, v)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {paso === 'datos' ? (
            <>
              <button onClick={onCerrar} className="text-sm text-gray-500 hover:text-gray-700 transition">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!nombre.trim() || !email.trim() || password.length < 6) {
                    setError(!nombre.trim() ? 'El nombre es obligatorio' : !email.trim() ? 'El correo es obligatorio' : 'La contraseña debe tener al menos 6 caracteres')
                    return
                  }
                  setError(null)
                  setPaso('permisos')
                }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition"
              >
                Siguiente → Permisos
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPaso('datos')} className="text-sm text-gray-500 hover:text-gray-700 transition">
                ← Volver
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {guardando ? 'Creando…' : 'Crear empleado'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card de empleado ──────────────────────────────────────────────────────────

function EmpleadoCard({
  miembro,
  onUpdate,
  onEliminar,
}: {
  miembro: Miembro
  onUpdate: (updated: Miembro) => void
  onEliminar: (id: string) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [permisos, setPermisos] = useState<PermisoMap>(
    normalizarPermisos(miembro.permisos ?? {})
  )
  const [guardandoPermisos, setGuardandoPermisos] = useState(false)
  const [accionando, setAccionando] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [nuevaPass, setNuevaPass] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [eliminandoConfirm, setEliminandoConfirm] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const plantilla = detectarPlantilla(permisos)

  function cambiarPermiso(key: Permiso, val: boolean) {
    const nuevos = { ...permisos, [key]: val }
    setPermisos(nuevos)
    // Auto-save con debounce de 800ms
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => guardarPermisos(nuevos), 800)
  }

  async function guardarPermisos(p: PermisoMap) {
    setGuardandoPermisos(true)
    try {
      const res = await fetch(`/api/empleados/${miembro.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permisos: p }),
      })
      if (res.ok) {
        const data = await res.json()
        onUpdate(data)
      }
    } finally {
      setGuardandoPermisos(false)
    }
  }

  function aplicarPlantilla(p: PlantillaPermiso) {
    const nuevos = normalizarPermisos(PLANTILLAS[p])
    setPermisos(nuevos)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => guardarPermisos(nuevos), 400)
  }

  async function toggleActivo() {
    setAccionando(true)
    try {
      const res = await fetch(`/api/empleados/${miembro.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !miembro.activo }),
      })
      if (res.ok) onUpdate(await res.json())
    } finally {
      setAccionando(false)
    }
  }

  async function resetearPassword() {
    if (nuevaPass.length < 6) { setResetError('Mín. 6 caracteres'); return }
    setAccionando(true)
    setResetError(null)
    try {
      const res = await fetch(`/api/empleados/${miembro.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nueva_password: nuevaPass }),
      })
      if (res.ok) {
        setResetMode(false)
        setNuevaPass('')
      } else {
        const d = await res.json()
        setResetError(d.error ?? 'Error')
      }
    } finally {
      setAccionando(false)
    }
  }

  async function eliminar() {
    setAccionando(true)
    try {
      const res = await fetch(`/api/empleados/${miembro.id}`, { method: 'DELETE' })
      if (res.ok) onEliminar(miembro.id)
    } finally {
      setAccionando(false)
      setEliminandoConfirm(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border transition',
      miembro.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
    )}>
      {/* Cabecera de la card */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0',
          miembro.activo ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-500'
        )}>
          {iniciales(miembro.nombre || miembro.email)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">{miembro.nombre || '—'}</p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', COLOR_PLANTILLA[plantilla])}>
              {ETIQUETAS_PLANTILLA[plantilla]}
            </span>
            {!miembro.activo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium">
                Inactivo
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{miembro.email}</p>
        </div>

        {/* Botón expandir */}
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-gray-400 hover:text-gray-600 transition flex-shrink-0"
        >
          {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Panel expandido */}
      {expandido && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">

          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-2">
            {/* Activar / Desactivar */}
            <button
              onClick={toggleActivo}
              disabled={accionando}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
                miembro.activo
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              )}
            >
              {accionando
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : miembro.activo
                ? <UserX className="w-3.5 h-3.5" />
                : <UserCheck className="w-3.5 h-3.5" />
              }
              {miembro.activo ? 'Desactivar' : 'Reactivar'}
            </button>

            {/* Resetear contraseña */}
            <button
              onClick={() => { setResetMode(!resetMode); setResetError(null); setNuevaPass('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Cambiar contraseña
            </button>

            {/* Eliminar */}
            {!eliminandoConfirm ? (
              <button
                onClick={() => setEliminandoConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-600 font-medium">¿Seguro?</span>
                <button
                  onClick={eliminar}
                  disabled={accionando}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setEliminandoConfirm(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* Reset password inline */}
          {resetMode && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">Nueva contraseña</p>
              <div className="relative">
                <input
                  type={verPass ? 'text' : 'password'}
                  value={nuevaPass}
                  onChange={(e) => setNuevaPass(e.target.value)}
                  placeholder="Mín. 6 caracteres"
                  className="w-full px-3 py-2 pr-9 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
                <button type="button" onClick={() => setVerPass(!verPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {verPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {resetError && <p className="text-xs text-red-500">{resetError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={resetearPassword}
                  disabled={accionando}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition disabled:opacity-60"
                >
                  {accionando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Guardar
                </button>
                <button onClick={() => setResetMode(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Selector rápido de plantilla */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plantilla</p>
              {guardandoPermisos && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PLANTILLAS) as PlantillaPermiso[]).map((p) => (
                <button
                  key={p}
                  onClick={() => aplicarPlantilla(p)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full font-medium transition border',
                    plantilla === p
                      ? `${COLOR_PLANTILLA[p]} border-current`
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                >
                  {ETIQUETAS_PLANTILLA[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Permisos por grupo con toggles */}
          <div className="space-y-3">
            {GRUPOS_PERMISOS.map((grupo) => (
              <div key={grupo.label}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  {grupo.label}
                </p>
                <div className="space-y-1.5">
                  {grupo.permisos.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-600">{label}</span>
                      <Toggle
                        checked={permisos[key] ?? false}
                        onChange={(v) => cambiarPermiso(key, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EmpleadosSection() {
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/empleados')
      if (res.ok) setMiembros(await res.json())
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function onCrear(m: Miembro) {
    setMiembros((prev) => [...prev, m])
    setModalAbierto(false)
  }

  function onUpdate(updated: Miembro) {
    setMiembros((prev) => prev.map((m) => m.id === updated.id ? updated : m))
  }

  function onEliminar(id: string) {
    setMiembros((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Empleados</h2>
            {miembros.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {miembros.filter(m => m.activo).length} activo{miembros.filter(m => m.activo).length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo empleado
          </button>
        </div>

        {/* Lista */}
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando empleados…
          </div>
        ) : miembros.length === 0 ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aún no hay empleados.</p>
            <p className="text-xs text-gray-400 mt-1">Crea el primero con el botón de arriba.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {miembros.map((m) => (
              <EmpleadoCard
                key={m.id}
                miembro={m}
                onUpdate={onUpdate}
                onEliminar={onEliminar}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalAbierto && (
        <ModalNuevoEmpleado
          onCrear={onCrear}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </>
  )
}
