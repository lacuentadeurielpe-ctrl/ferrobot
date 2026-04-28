'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bot, Mic, MicOff, Send, Loader2, Check, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Package, DollarSign, ToggleLeft, ToggleRight,
  Sparkles, ArrowLeft, AlertTriangle, Plus,
} from 'lucide-react'
import { cn, formatPEN } from '@/lib/utils'
import { UNIDADES_SUNAT, labelUnidad } from '@/lib/constantes/unidades'
import CatalogNav from '@/components/catalog/CatalogNav'
import type {
  AccionAgente, TipoAccion,
  DatosActualizarPrecio, DatosActualizarStock, DatosActualizarCosto,
  DatosNuevoProducto, DatosBulkPrecio,
} from '@/app/api/catalog/agente/route'

// ── Tipos locales ─────────────────────────────────────────────────────────────

type EstadoAccion = 'pendiente' | 'ejecutando' | 'ok' | 'error' | 'descartado'

interface AccionLocal extends AccionAgente {
  _id: string
  estado: EstadoAccion
  errorMsg?: string
  // Overrides editables por el dueño
  _precio_nuevo?: string
  _incremento?: string
  _stock_nuevo?: string
  _precio_compra_nuevo?: string
  _nombre?: string
  _descripcion?: string
  _categoria?: string
  _precio_base?: string
  _precio_compra?: string
  _unidad?: string
  _stock?: string
  _bulkSeleccionados?: Set<string>
  _expandidoBulk?: boolean
}

interface MensajeChat {
  id: string
  role: 'user' | 'agent'
  texto: string
  acciones?: AccionLocal[]
}

// ── Helpers de margen ─────────────────────────────────────────────────────────

function calcMargen(venta: number, costo: number): number | null {
  if (!costo || !venta) return null
  return ((venta - costo) / venta) * 100
}

function MargenBadge({ venta, costo, minimo }: { venta: number; costo: number; minimo: number }) {
  const margen = calcMargen(venta, costo)
  if (!margen || margen <= 0) return null
  const bajo = margen < minimo
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      bajo ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'
    )}>
      {bajo ? <AlertTriangle className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
      {margen.toFixed(0)}%
    </span>
  )
}

// ── Ejecución de acción ───────────────────────────────────────────────────────

async function ejecutarAccion(accion: AccionLocal): Promise<{ ok: boolean; error?: string; productoId?: string }> {
  const tipo = accion.tipo

  if (tipo === 'actualizar_precio') {
    const d = accion.datos as DatosActualizarPrecio
    const precio = parseFloat(accion._precio_nuevo ?? '') || d.precio_nuevo
    const res = await fetch(`/api/products/${accion.producto_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio_base: precio }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'actualizar_stock') {
    const d = accion.datos as DatosActualizarStock
    const stockNuevo = parseInt(accion._stock_nuevo ?? '') || d.stock_nuevo
    const res = await fetch(`/api/products/${accion.producto_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: stockNuevo }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'actualizar_precio_compra') {
    const d = accion.datos as DatosActualizarCosto
    const costo = parseFloat(accion._precio_compra_nuevo ?? '') || d.precio_compra_nuevo
    const res = await fetch(`/api/products/${accion.producto_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio_compra: costo }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'activar' || tipo === 'desactivar') {
    const res = await fetch(`/api/products/${accion.producto_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: tipo === 'activar' }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'nuevo_producto') {
    const d = accion.datos as DatosNuevoProducto
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre:        accion._nombre       ?? d.nombre,
        descripcion:   accion._descripcion  ?? d.descripcion ?? null,
        categoria:     accion._categoria    ?? d.categoria   ?? null,
        precio_base:   parseFloat(accion._precio_base  ?? '') || d.precio_base  || 0,
        precio_compra: parseFloat(accion._precio_compra ?? '') || d.precio_compra || 0,
        unidad:        accion._unidad ?? d.unidad ?? 'NIU',
        stock:         parseInt(accion._stock ?? '') || d.stock || 0,
        activo:        true,
      }),
    })
    const json = await res.json()
    return res.ok ? { ok: true, productoId: json.id } : { ok: false, error: json.error }
  }

  if (tipo === 'bulk_precio') {
    const d = accion.datos as DatosBulkPrecio
    const seleccionados = accion._bulkSeleccionados ?? new Set(d.productos.map((p) => p.producto_id))
    const productosActivos = d.productos.filter((p) => seleccionados.has(p.producto_id))
    const resultados = await Promise.all(
      productosActivos.map((p) =>
        fetch(`/api/products/${p.producto_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ precio_base: p.precio_nuevo }),
        })
      )
    )
    const errores = resultados.filter((r) => !r.ok).length
    if (errores > 0) return { ok: false, error: `${errores} productos fallaron` }
    return { ok: true }
  }

  return { ok: false, error: 'Tipo de acción desconocido' }
}

// ── Componente AccionCard ─────────────────────────────────────────────────────

function AccionCard({
  accion,
  margenMinimo,
  onUpdate,
  onConfirm,
  onDiscard,
}: {
  accion: AccionLocal
  margenMinimo: number
  onUpdate: (patch: Partial<AccionLocal>) => void
  onConfirm: () => void
  onDiscard: () => void
}) {
  const tipo = accion.tipo
  const estado = accion.estado
  const isDone = estado === 'ok' || estado === 'descartado'

  const iconMap: Record<TipoAccion, React.ReactNode> = {
    actualizar_precio:        <DollarSign className="w-3.5 h-3.5" />,
    actualizar_stock:         <Package className="w-3.5 h-3.5" />,
    actualizar_precio_compra: <TrendingDown className="w-3.5 h-3.5" />,
    activar:                  <ToggleRight className="w-3.5 h-3.5" />,
    desactivar:               <ToggleLeft className="w-3.5 h-3.5" />,
    nuevo_producto:           <Plus className="w-3.5 h-3.5" />,
    bulk_precio:              <TrendingUp className="w-3.5 h-3.5" />,
  }

  const labelMap: Record<TipoAccion, string> = {
    actualizar_precio:        'Precio',
    actualizar_stock:         'Stock',
    actualizar_precio_compra: 'Precio de costo',
    activar:                  'Activar',
    desactivar:               'Desactivar',
    nuevo_producto:           'Nuevo producto',
    bulk_precio:              'Actualización masiva',
  }

  const colorMap: Record<TipoAccion, string> = {
    actualizar_precio:        'bg-blue-50 border-blue-200',
    actualizar_stock:         'bg-amber-50 border-amber-200',
    actualizar_precio_compra: 'bg-purple-50 border-purple-200',
    activar:                  'bg-emerald-50 border-emerald-200',
    desactivar:               'bg-zinc-50 border-zinc-200',
    nuevo_producto:           'bg-violet-50 border-violet-200',
    bulk_precio:              'bg-orange-50 border-orange-200',
  }

  return (
    <div className={cn(
      'rounded-xl border p-3.5 text-sm transition',
      isDone ? 'opacity-60' : colorMap[tipo],
      estado === 'ok' && 'opacity-60',
      estado === 'descartado' && 'opacity-40 line-through',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-zinc-500">{iconMap[tipo]}</span>
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
          {labelMap[tipo]}
        </span>
        <span className="font-semibold text-zinc-800 truncate flex-1">{accion.producto_nombre}</span>
        {estado === 'ok' && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
        {estado === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
      </div>

      {/* Cuerpo según tipo */}
      {!isDone && tipo === 'actualizar_precio' && (() => {
        const d = accion.datos as DatosActualizarPrecio
        const nuevoVal = accion._precio_nuevo ?? d.precio_nuevo.toString()
        const nuevoNum = parseFloat(nuevoVal) || 0
        const diff = nuevoNum - d.precio_actual
        const pct  = d.precio_actual > 0 ? (diff / d.precio_actual) * 100 : 0
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400 line-through tabular-nums">{formatPEN(d.precio_actual)}</span>
            <span className="text-zinc-400">→</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">S/</span>
              <input
                type="number" step="0.10" min="0"
                value={nuevoVal}
                onChange={(e) => onUpdate({ _precio_nuevo: e.target.value })}
                className="w-24 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums"
              />
            </div>
            {diff !== 0 && (
              <span className={cn('text-[11px] font-semibold', diff > 0 ? 'text-emerald-600' : 'text-red-500')}>
                {diff > 0 ? '+' : ''}{formatPEN(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </span>
            )}
            {d.precio_compra != null && nuevoNum > 0 && (
              <MargenBadge venta={nuevoNum} costo={d.precio_compra} minimo={margenMinimo} />
            )}
          </div>
        )
      })()}

      {!isDone && tipo === 'actualizar_stock' && (() => {
        const d = accion.datos as DatosActualizarStock
        const incVal = accion._incremento ?? d.incremento.toString()
        const incNum = parseInt(incVal) || 0
        const nuevoStock = Math.max(0, d.stock_actual + incNum)
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-zinc-500">Actual: <strong>{d.stock_actual}</strong></span>
            <span className="text-zinc-400">
              {incNum >= 0 ? '+' : ''}
            </span>
            <input
              type="number"
              value={incVal}
              onChange={(e) => onUpdate({ _incremento: e.target.value })}
              className="w-20 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums"
            />
            <span className="text-sm text-zinc-500">= <strong className={nuevoStock < 0 ? 'text-red-500' : 'text-zinc-900'}>{nuevoStock}</strong></span>
            {d.stock_actual === 0 && incNum > 0 && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Reingreso</span>
            )}
          </div>
        )
      })()}

      {!isDone && tipo === 'actualizar_precio_compra' && (() => {
        const d = accion.datos as DatosActualizarCosto
        const nuevoVal = accion._precio_compra_nuevo ?? d.precio_compra_nuevo.toString()
        const nuevoNum = parseFloat(nuevoVal) || 0
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400 line-through tabular-nums">{formatPEN(d.precio_compra_actual)}</span>
            <span className="text-zinc-400">→</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">S/</span>
              <input
                type="number" step="0.10" min="0"
                value={nuevoVal}
                onChange={(e) => onUpdate({ _precio_compra_nuevo: e.target.value })}
                className="w-24 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums"
              />
            </div>
            {d.precio_base != null && nuevoNum > 0 && (
              <MargenBadge venta={d.precio_base} costo={nuevoNum} minimo={margenMinimo} />
            )}
          </div>
        )
      })()}

      {!isDone && (tipo === 'activar' || tipo === 'desactivar') && (
        <p className="text-xs text-zinc-500">
          {tipo === 'activar'
            ? 'El producto volverá a aparecer en cotizaciones y en el bot.'
            : 'El producto dejará de aparecer en cotizaciones y en el bot.'}
        </p>
      )}

      {!isDone && tipo === 'nuevo_producto' && (() => {
        const d = accion.datos as DatosNuevoProducto
        const pb  = parseFloat(accion._precio_base  ?? '') || d.precio_base  || 0
        const pc  = parseFloat(accion._precio_compra ?? '') || d.precio_compra || 0
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div className="col-span-2">
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Nombre</label>
              <input
                value={accion._nombre ?? d.nombre ?? ''}
                onChange={(e) => onUpdate({ _nombre: e.target.value })}
                className="w-full text-sm font-semibold text-zinc-900 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Categoría</label>
              <input
                value={accion._categoria ?? d.categoria ?? ''}
                onChange={(e) => onUpdate({ _categoria: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="Ej: Cemento"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Unidad</label>
              <select
                value={accion._unidad ?? d.unidad ?? 'NIU'}
                onChange={(e) => onUpdate({ _unidad: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
              >
                {UNIDADES_SUNAT.map((u) => (
                  <option key={u.code} value={u.code}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Precio venta (S/)</label>
              <input
                type="number" step="0.10" min="0"
                value={accion._precio_base ?? (d.precio_base?.toString() ?? '')}
                onChange={(e) => onUpdate({ _precio_base: e.target.value })}
                className="w-full text-sm font-bold text-zinc-900 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">
                Precio costo (S/)
                {!pc && <span className="text-amber-500 ml-1">⚠️</span>}
              </label>
              <input
                type="number" step="0.10" min="0"
                value={accion._precio_compra ?? (d.precio_compra?.toString() ?? '')}
                onChange={(e) => onUpdate({ _precio_compra: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="0.00 (opcional)"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Stock inicial</label>
              <input
                type="number" min="0"
                value={accion._stock ?? (d.stock?.toString() ?? '0')}
                onChange={(e) => onUpdate({ _stock: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
              />
            </div>
            {pb > 0 && pc > 0 && (
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-[10px] text-zinc-400">Margen estimado:</span>
                <MargenBadge venta={pb} costo={pc} minimo={margenMinimo} />
              </div>
            )}
          </div>
        )
      })()}

      {!isDone && tipo === 'bulk_precio' && (() => {
        const d = accion.datos as DatosBulkPrecio
        const sel = accion._bulkSeleccionados ?? new Set(d.productos.map((p) => p.producto_id))
        const expandido = accion._expandidoBulk ?? false
        const PREVIEW = 3
        const visibles = expandido ? d.productos : d.productos.slice(0, PREVIEW)
        return (
          <div>
            <p className="text-xs text-zinc-500 mb-2">{d.descripcion} · {sel.size}/{d.productos.length} seleccionados</p>
            <div className="space-y-1">
              {visibles.map((p) => (
                <label key={p.producto_id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sel.has(p.producto_id)}
                    onChange={() => {
                      const next = new Set(sel)
                      if (next.has(p.producto_id)) next.delete(p.producto_id)
                      else next.add(p.producto_id)
                      onUpdate({ _bulkSeleccionados: next })
                    }}
                    className="rounded border-zinc-300"
                  />
                  <span className="text-xs text-zinc-700 flex-1 truncate">{p.nombre}</span>
                  <span className="text-[11px] text-zinc-400 tabular-nums line-through">{formatPEN(p.precio_actual)}</span>
                  <span className="text-[11px] font-semibold text-zinc-800 tabular-nums">{formatPEN(p.precio_nuevo)}</span>
                </label>
              ))}
            </div>
            {d.productos.length > PREVIEW && (
              <button
                onClick={() => onUpdate({ _expandidoBulk: !expandido })}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 mt-1 flex items-center gap-0.5"
              >
                {expandido
                  ? <><ChevronUp className="w-3 h-3" /> Ver menos</>
                  : <><ChevronDown className="w-3 h-3" /> {d.productos.length - PREVIEW} más...</>}
              </button>
            )}
          </div>
        )
      })()}

      {/* Error */}
      {estado === 'error' && (
        <p className="text-xs text-red-500 mt-2">{accion.errorMsg}</p>
      )}

      {/* Botones */}
      {!isDone && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onConfirm}
            disabled={estado === 'ejecutando'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
          >
            {estado === 'ejecutando'
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Check className="w-3 h-3" />}
            {tipo === 'nuevo_producto' ? 'Crear' : tipo === 'bulk_precio' ? 'Aplicar seleccionados' : 'Confirmar'}
          </button>
          <button
            onClick={onDiscard}
            disabled={estado === 'ejecutando'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-medium rounded-lg hover:bg-zinc-100 transition"
          >
            <X className="w-3 h-3" /> Descartar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CatalogAgentePage() {
  const [mensajes,    setMensajes]    = useState<MensajeChat[]>([])
  const [input,       setInput]       = useState('')
  const [procesando,  setProcesando]  = useState(false)
  const [escuchando,  setEscuchando]  = useState(false)
  const [soportaVoz,  setSoportaVoz]  = useState(false)
  const [margenMin,   setMargenMin]   = useState(10)
  const [error,       setError]       = useState<string | null>(null)

  const bottomRef      = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<EventTarget | null>(null)

  // Detectar soporte de voz
  useEffect(() => {
    setSoportaVoz(!!(
      typeof window !== 'undefined' &&
      ((window as unknown as Record<string, unknown>).SpeechRecognition ||
       (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
    ))
  }, [])

  // Scroll automático
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // ── Actualizar campo de una acción ────────────────────────────────────────

  function updateAccion(msgId: string, accionId: string, patch: Partial<AccionLocal>) {
    setMensajes((prev) => prev.map((m) => {
      if (m.id !== msgId) return m
      return {
        ...m,
        acciones: m.acciones?.map((a) => a._id === accionId ? { ...a, ...patch } : a),
      }
    }))
  }

  function setEstadoAccion(msgId: string, accionId: string, estado: EstadoAccion, errorMsg?: string) {
    setMensajes((prev) => prev.map((m) => {
      if (m.id !== msgId) return m
      return {
        ...m,
        acciones: m.acciones?.map((a) =>
          a._id === accionId ? { ...a, estado, errorMsg } : a
        ),
      }
    }))
  }

  // ── Confirmar acción ──────────────────────────────────────────────────────

  async function confirmarAccion(msgId: string, accion: AccionLocal) {
    setEstadoAccion(msgId, accion._id, 'ejecutando')
    const result = await ejecutarAccion(accion)
    if (result.ok) {
      setEstadoAccion(msgId, accion._id, 'ok')
    } else {
      setEstadoAccion(msgId, accion._id, 'error', result.error ?? 'Error desconocido')
    }
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────

  const enviar = useCallback(async () => {
    const texto = input.trim()
    if (!texto || procesando) return

    setInput('')
    setError(null)
    setProcesando(true)

    const msgUsuario: MensajeChat = {
      id: crypto.randomUUID(),
      role: 'user',
      texto,
    }
    setMensajes((prev) => [...prev, msgUsuario])

    try {
      const res = await fetch('/api/catalog/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: texto }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al procesar')
        return
      }

      setMargenMin(data.margen_minimo ?? 10)

      const accionesLocales: AccionLocal[] = (data.acciones ?? []).map(
        (a: AccionAgente, idx: number) => ({
          ...a,
          _id: `${Date.now()}-${idx}`,
          estado: 'pendiente' as EstadoAccion,
        })
      )

      const msgAgente: MensajeChat = {
        id: crypto.randomUUID(),
        role: 'agent',
        texto: data.mensaje_ia ?? '...',
        acciones: accionesLocales,
      }
      setMensajes((prev) => [...prev, msgAgente])
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setProcesando(false)
      textareaRef.current?.focus()
    }
  }, [input, procesando])

  // ── Voz ───────────────────────────────────────────────────────────────────

  function toggleVoz() {
    if (escuchando) {
      (recognitionRef.current as { stop?: () => void })?.stop?.()
      setEscuchando(false)
      return
    }

    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition as (new () => EventTarget) ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition as (new () => EventTarget)

    if (!SR) return

    const rec = new SR() as EventTarget & {
      lang: string; continuous: boolean; interimResults: boolean
      start(): void; stop(): void
      onresult: ((e: Event) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
    }
    rec.lang = 'es-PE'
    rec.continuous = false
    rec.interimResults = false

    rec.onresult = (e: Event) => {
      const ev = e as Event & { results: { 0: { 0: { transcript: string } } } }
      const transcript = ev.results[0][0].transcript
      setInput((prev) => (prev ? prev + ' ' : '') + transcript)
      setEscuchando(false)
    }
    rec.onerror = () => setEscuchando(false)
    rec.onend   = () => setEscuchando(false)

    recognitionRef.current = rec
    rec.start()
    setEscuchando(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Header con nav */}
      <div className="mb-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-violet-100 border border-violet-200 rounded-xl flex items-center justify-center">
            <Bot className="w-4 h-4 text-violet-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Agente de Catálogo</h1>
            <p className="text-xs text-zinc-400">Actualiza precios, stock y productos con lenguaje natural</p>
          </div>
          <Link
            href="/dashboard/catalog"
            className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </Link>
        </div>
        <CatalogNav />
      </div>

      {/* Ejemplos (solo cuando no hay mensajes) */}
      {mensajes.length === 0 && (
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-zinc-700">Dime qué quieres actualizar</p>
            <p className="text-xs text-zinc-400 mt-1">Escribe o dicta en español — confirma antes de guardar</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { texto: 'El cemento subió a S/32',                  icon: DollarSign },
              { texto: 'Llegaron 200 bolsas de arena gruesa',       icon: Package },
              { texto: 'Agrega tornillo 2" a S/0.80, stock 500',   icon: Plus },
              { texto: 'Sube 10% todos los productos de Pinturas',  icon: TrendingUp },
              { texto: 'El costo del yeso es S/14',                 icon: TrendingDown },
              { texto: 'Desactiva la masilla compac, sin stock',    icon: ToggleLeft },
            ].map(({ texto, icon: Icon }) => (
              <button
                key={texto}
                onClick={() => setInput(texto)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-zinc-200
                           bg-white hover:bg-zinc-50 text-left text-sm text-zinc-600 hover:text-zinc-900
                           transition group"
              >
                <Icon className="w-4 h-4 text-zinc-300 group-hover:text-violet-500 shrink-0 transition" />
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      {mensajes.length > 0 && (
        <div className="flex-1 space-y-4 pb-4">
          {mensajes.map((msg) => (
            <div key={msg.id} className={cn('flex flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
              {/* Burbuja */}
              <div className={cn(
                'max-w-[85%] px-3.5 py-2 rounded-2xl text-sm',
                msg.role === 'user'
                  ? 'bg-zinc-900 text-white rounded-tr-none'
                  : 'bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-tl-none'
              )}>
                {msg.role === 'agent' && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-500 font-semibold mb-0.5">
                    <Bot className="w-2.5 h-2.5" /> Agente
                  </span>
                )}
                <span className="whitespace-pre-wrap">{msg.texto}</span>
              </div>

              {/* Action cards */}
              {msg.acciones && msg.acciones.length > 0 && (
                <div className="w-full space-y-2 max-w-2xl">
                  {msg.acciones.map((accion) => (
                    <AccionCard
                      key={accion._id}
                      accion={accion}
                      margenMinimo={margenMin}
                      onUpdate={(patch) => updateAccion(msg.id, accion._id, patch)}
                      onConfirm={() => confirmarAccion(msg.id, accion)}
                      onDiscard={() => setEstadoAccion(msg.id, accion._id, 'descartado')}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {procesando && (
            <div className="flex items-start gap-2">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl rounded-tl-none px-4 py-2.5">
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className={cn(
        'border-t border-zinc-100 pt-4',
        mensajes.length === 0 && 'mt-6'
      )}>
        <div className="flex items-end gap-2 bg-white border border-zinc-200 rounded-2xl px-3 py-2 focus-within:border-zinc-400 transition">
          {soportaVoz && (
            <button
              onClick={toggleVoz}
              title={escuchando ? 'Detener' : 'Dictar con voz'}
              className={cn(
                'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition mb-0.5',
                escuchando
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'
              )}
            >
              {escuchando ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={escuchando ? '🎙️ Escuchando...' : 'Escribe o dicta un cambio...'}
            rows={1}
            disabled={procesando}
            className="flex-1 resize-none text-sm text-zinc-900 placeholder:text-zinc-400 outline-none bg-transparent min-h-[32px] leading-relaxed disabled:opacity-50"
          />
          <button
            onClick={enviar}
            disabled={!input.trim() || procesando}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-40 mb-0.5"
          >
            {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5 px-1">
          Enter para enviar · Shift+Enter para nueva línea · Los cambios se aplican solo cuando confirmas
        </p>
      </div>
    </div>
  )
}
