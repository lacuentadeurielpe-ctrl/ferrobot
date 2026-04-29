'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, Mic, MicOff, Send, Loader2, Check, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Package, DollarSign, ToggleLeft, ToggleRight,
  Sparkles, AlertTriangle, Plus, Paperclip, Eye, Image as ImageIcon,
  CheckCheck, XCircle,
} from 'lucide-react'
import { cn, formatPEN } from '@/lib/utils'
import { UNIDADES_SUNAT } from '@/lib/constantes/unidades'
import CatalogNav from '@/components/catalog/CatalogNav'
import type {
  AccionAgente, TipoAccion,
  DatosActualizarPrecio, DatosActualizarStock, DatosActualizarCosto,
  DatosNuevoProducto, DatosBulkPrecio,
} from '@/app/api/catalog/agente/route'

// ── Tipos locales ──────────────────────────────────────────────────────────────

type EstadoAccion = 'pendiente' | 'ejecutando' | 'ok' | 'error' | 'descartado'

interface AccionLocal extends AccionAgente {
  _id: string
  estado: EstadoAccion
  errorMsg?: string
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
  imagenPreview?: string   // data URL, solo en mensajes de usuario
  acciones?: AccionLocal[]
  agentesUsados?: string[]
}

interface ImagenAdjunta {
  base64: string
  mime: string
  preview: string
}

// ── Helpers de margen ──────────────────────────────────────────────────────────

function MargenBadge({ venta, costo, minimo }: { venta: number; costo: number; minimo: number }) {
  if (!costo || !venta) return null
  const m = ((venta - costo) / venta) * 100
  if (m <= 0) return null
  const bajo = m < minimo
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      bajo ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'
    )}>
      {bajo ? <AlertTriangle className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
      {m.toFixed(0)}%
    </span>
  )
}

// ── Ejecución de una acción ────────────────────────────────────────────────────

async function ejecutarAccion(a: AccionLocal): Promise<{ ok: boolean; error?: string }> {
  const tipo = a.tipo

  if (tipo === 'actualizar_precio') {
    const d = a.datos as DatosActualizarPrecio
    const precio = parseFloat(a._precio_nuevo ?? '') || d.precio_nuevo
    const res = await fetch(`/api/products/${a.producto_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio_base: precio }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'actualizar_stock') {
    const d = a.datos as DatosActualizarStock
    const stock = parseInt(a._stock_nuevo ?? '') || d.stock_nuevo
    const res = await fetch(`/api/products/${a.producto_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'actualizar_precio_compra') {
    const d = a.datos as DatosActualizarCosto
    const costo = parseFloat(a._precio_compra_nuevo ?? '') || d.precio_compra_nuevo
    const res = await fetch(`/api/products/${a.producto_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio_compra: costo }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'activar' || tipo === 'desactivar') {
    const res = await fetch(`/api/products/${a.producto_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: tipo === 'activar' }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'nuevo_producto') {
    const d = a.datos as DatosNuevoProducto
    const res = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre:        a._nombre        ?? d.nombre,
        descripcion:   a._descripcion   ?? d.descripcion ?? null,
        categoria:     a._categoria     ?? d.categoria   ?? null,
        precio_base:   parseFloat(a._precio_base  ?? '') || d.precio_base  || 0,
        precio_compra: parseFloat(a._precio_compra ?? '') || d.precio_compra || 0,
        unidad:        a._unidad ?? d.unidad ?? 'NIU',
        stock:         parseInt(a._stock ?? '') || d.stock || 0,
        activo:        true,
      }),
    })
    return res.ok ? { ok: true } : { ok: false, error: (await res.json()).error }
  }

  if (tipo === 'bulk_precio') {
    const d = a.datos as DatosBulkPrecio
    const sel = a._bulkSeleccionados ?? new Set(d.productos.map(p => p.producto_id))
    const activos = d.productos.filter(p => sel.has(p.producto_id))
    const resultados = await Promise.all(
      activos.map(p =>
        fetch(`/api/products/${p.producto_id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ precio_base: p.precio_nuevo }),
        })
      )
    )
    const errores = resultados.filter(r => !r.ok).length
    return errores > 0 ? { ok: false, error: `${errores} productos fallaron` } : { ok: true }
  }

  return { ok: false, error: 'Tipo desconocido' }
}

// ── AccionCard ─────────────────────────────────────────────────────────────────

const TIPO_META: Record<TipoAccion, { label: string; icon: React.ReactNode; color: string }> = {
  actualizar_precio:        { label: 'Precio',           icon: <DollarSign className="w-3.5 h-3.5" />,  color: 'bg-blue-50   border-blue-200'   },
  actualizar_stock:         { label: 'Stock',            icon: <Package className="w-3.5 h-3.5" />,     color: 'bg-amber-50  border-amber-200'  },
  actualizar_precio_compra: { label: 'Costo',            icon: <TrendingDown className="w-3.5 h-3.5" />,color: 'bg-purple-50 border-purple-200' },
  activar:                  { label: 'Activar',          icon: <ToggleRight className="w-3.5 h-3.5" />, color: 'bg-emerald-50 border-emerald-200'},
  desactivar:               { label: 'Desactivar',       icon: <ToggleLeft className="w-3.5 h-3.5" />,  color: 'bg-zinc-50   border-zinc-200'   },
  nuevo_producto:           { label: 'Nuevo producto',   icon: <Plus className="w-3.5 h-3.5" />,        color: 'bg-violet-50 border-violet-200' },
  bulk_precio:              { label: 'Actualiz. masiva', icon: <TrendingUp className="w-3.5 h-3.5" />,  color: 'bg-orange-50 border-orange-200' },
}

function AccionCard({
  accion, margenMinimo, onUpdate, onConfirm, onDiscard,
}: {
  accion: AccionLocal
  margenMinimo: number
  onUpdate: (p: Partial<AccionLocal>) => void
  onConfirm: () => void
  onDiscard: () => void
}) {
  const meta  = TIPO_META[accion.tipo]
  const isDone = accion.estado === 'ok' || accion.estado === 'descartado'
  const isVision = accion.fuente === 'vision'

  return (
    <div className={cn(
      'rounded-xl border p-3.5 text-sm transition',
      isDone ? 'opacity-50' : meta.color,
      accion.estado === 'descartado' && 'opacity-30 line-through',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className="text-zinc-500">{meta.icon}</span>
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{meta.label}</span>
        {isVision && (
          <span className="text-[9px] font-bold bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Eye className="w-2.5 h-2.5" /> Imagen
          </span>
        )}
        <span className="font-semibold text-zinc-800 truncate flex-1 min-w-0">{accion.producto_nombre}</span>
        {accion.estado === 'ok'    && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
        {accion.estado === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
        {accion.estado === 'ejecutando' && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400 shrink-0" />}
      </div>

      {/* Cuerpo */}
      {!isDone && accion.tipo === 'actualizar_precio' && (() => {
        const d = accion.datos as DatosActualizarPrecio
        const nv = accion._precio_nuevo ?? d.precio_nuevo.toString()
        const nn = parseFloat(nv) || 0
        const diff = nn - d.precio_actual
        const pct  = d.precio_actual > 0 ? (diff / d.precio_actual) * 100 : 0
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400 line-through tabular-nums">{formatPEN(d.precio_actual)}</span>
            <span className="text-zinc-400">→</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-400">S/</span>
              <input type="number" step="0.10" min="0" value={nv}
                onChange={e => onUpdate({ _precio_nuevo: e.target.value })}
                className="w-24 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums" />
            </div>
            {diff !== 0 && (
              <span className={cn('text-[11px] font-semibold', diff > 0 ? 'text-emerald-600' : 'text-red-500')}>
                {diff > 0 ? '+' : ''}{formatPEN(diff)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </span>
            )}
            {d.precio_compra != null && nn > 0 && <MargenBadge venta={nn} costo={d.precio_compra} minimo={margenMinimo} />}
          </div>
        )
      })()}

      {!isDone && accion.tipo === 'actualizar_stock' && (() => {
        const d = accion.datos as DatosActualizarStock
        const iv = accion._incremento ?? d.incremento.toString()
        const in_ = parseInt(iv) || 0
        const ns  = Math.max(0, d.stock_actual + in_)
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-zinc-500">Actual: <strong>{d.stock_actual}</strong></span>
            <input type="number" value={iv}
              onChange={e => onUpdate({ _incremento: e.target.value })}
              className="w-20 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums" />
            <span className="text-sm text-zinc-500">= <strong className={ns < 0 ? 'text-red-500' : 'text-zinc-900'}>{ns}</strong></span>
            {d.stock_actual === 0 && in_ > 0 && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Reingreso</span>}
          </div>
        )
      })()}

      {!isDone && accion.tipo === 'actualizar_precio_compra' && (() => {
        const d = accion.datos as DatosActualizarCosto
        const nv = accion._precio_compra_nuevo ?? d.precio_compra_nuevo.toString()
        const nn = parseFloat(nv) || 0
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400 line-through tabular-nums">{formatPEN(d.precio_compra_actual)}</span>
            <span className="text-zinc-400">→</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-400">S/</span>
              <input type="number" step="0.10" min="0" value={nv}
                onChange={e => onUpdate({ _precio_compra_nuevo: e.target.value })}
                className="w-24 text-sm font-bold text-zinc-900 border-b-2 border-zinc-300 focus:border-zinc-700 bg-transparent outline-none tabular-nums" />
            </div>
            {d.precio_base != null && nn > 0 && <MargenBadge venta={d.precio_base} costo={nn} minimo={margenMinimo} />}
          </div>
        )
      })()}

      {!isDone && (accion.tipo === 'activar' || accion.tipo === 'desactivar') && (
        <p className="text-xs text-zinc-500">
          {accion.tipo === 'activar'
            ? 'El producto volverá a aparecer en el bot y en cotizaciones.'
            : 'El producto dejará de aparecer en el bot y en cotizaciones.'}
        </p>
      )}

      {!isDone && accion.tipo === 'nuevo_producto' && (() => {
        const d = accion.datos as DatosNuevoProducto
        const pb = parseFloat(accion._precio_base  ?? '') || d.precio_base  || 0
        const pc = parseFloat(accion._precio_compra ?? '') || d.precio_compra || 0
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
            <div className="col-span-2">
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Nombre</label>
              <input value={accion._nombre ?? d.nombre ?? ''}
                onChange={e => onUpdate({ _nombre: e.target.value })}
                className="w-full text-sm font-semibold text-zinc-900 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Categoría</label>
              <input value={accion._categoria ?? d.categoria ?? ''}
                onChange={e => onUpdate({ _categoria: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="Ej: Cemento" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Unidad</label>
              <select value={accion._unidad ?? d.unidad ?? 'NIU'}
                onChange={e => onUpdate({ _unidad: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5">
                {UNIDADES_SUNAT.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Precio venta (S/)</label>
              <input type="number" step="0.10" min="0"
                value={accion._precio_base ?? (d.precio_base?.toString() ?? '')}
                onChange={e => onUpdate({ _precio_base: e.target.value })}
                className="w-full text-sm font-bold text-zinc-900 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="0.00" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">
                Precio costo (S/) {!pc && <span className="text-amber-500">⚠</span>}
              </label>
              <input type="number" step="0.10" min="0"
                value={accion._precio_compra ?? (d.precio_compra?.toString() ?? '')}
                onChange={e => onUpdate({ _precio_compra: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5"
                placeholder="0.00 (opcional)" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wide">Stock inicial</label>
              <input type="number" min="0"
                value={accion._stock ?? (d.stock?.toString() ?? '0')}
                onChange={e => onUpdate({ _stock: e.target.value })}
                className="w-full text-sm text-zinc-700 border-b border-zinc-200 focus:border-zinc-600 bg-transparent outline-none py-0.5" />
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

      {!isDone && accion.tipo === 'bulk_precio' && (() => {
        const d = accion.datos as DatosBulkPrecio
        const sel = accion._bulkSeleccionados ?? new Set(d.productos.map(p => p.producto_id))
        const exp = accion._expandidoBulk ?? false
        const PREV = 4
        const visibles = exp ? d.productos : d.productos.slice(0, PREV)
        return (
          <div>
            <p className="text-xs text-zinc-500 mb-2">{d.descripcion} · {sel.size}/{d.productos.length} seleccionados</p>
            <div className="space-y-1">
              {visibles.map(p => (
                <label key={p.producto_id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={sel.has(p.producto_id)}
                    onChange={() => {
                      const next = new Set(sel)
                      next.has(p.producto_id) ? next.delete(p.producto_id) : next.add(p.producto_id)
                      onUpdate({ _bulkSeleccionados: next })
                    }} className="rounded border-zinc-300" />
                  <span className="text-xs text-zinc-700 flex-1 truncate">{p.nombre}</span>
                  <span className="text-[11px] text-zinc-400 tabular-nums line-through">{formatPEN(p.precio_actual)}</span>
                  <span className="text-[11px] font-semibold text-zinc-800 tabular-nums">{formatPEN(p.precio_nuevo)}</span>
                </label>
              ))}
            </div>
            {d.productos.length > PREV && (
              <button onClick={() => onUpdate({ _expandidoBulk: !exp })}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 mt-1 flex items-center gap-0.5">
                {exp
                  ? <><ChevronUp className="w-3 h-3" /> Ver menos</>
                  : <><ChevronDown className="w-3 h-3" /> {d.productos.length - PREV} más…</>}
              </button>
            )}
          </div>
        )
      })()}

      {accion.estado === 'error' && (
        <p className="text-xs text-red-500 mt-2">{accion.errorMsg}</p>
      )}

      {!isDone && (
        <div className="flex gap-2 mt-3">
          <button onClick={onConfirm} disabled={accion.estado === 'ejecutando'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50">
            {accion.estado === 'ejecutando'
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Check className="w-3 h-3" />}
            {accion.tipo === 'nuevo_producto' ? 'Crear' : accion.tipo === 'bulk_precio' ? 'Aplicar' : 'Confirmar'}
          </button>
          <button onClick={onDiscard} disabled={accion.estado === 'ejecutando'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-medium rounded-lg hover:bg-zinc-100 transition">
            <X className="w-3 h-3" /> Descartar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CatalogAgentePage() {
  const [mensajes,    setMensajes]    = useState<MensajeChat[]>([])
  const [input,       setInput]       = useState('')
  const [imagen,      setImagen]      = useState<ImagenAdjunta | null>(null)
  const [procesando,  setProcesando]  = useState(false)
  const [escuchando,  setEscuchando]  = useState(false)
  const [soportaVoz,  setSoportaVoz]  = useState(false)
  const [margenMin,   setMargenMin]   = useState(10)
  const [error,       setError]       = useState<string | null>(null)

  const bottomRef      = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSoportaVoz(!!(
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    ))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // ── Cantidad de acciones pendientes (para bulk bar) ─────────────────────────
  const pendientesTotal = mensajes
    .flatMap(m => m.acciones ?? [])
    .filter(a => a.estado === 'pendiente').length

  // ── Imagen ──────────────────────────────────────────────────────────────────
  function handleImageFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { setError('La imagen no puede superar 8 MB'); return }
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes'); return }
    setError(null)
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setImagen({ base64: dataUrl.split(',')[1], mime: file.type, preview: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  // Pegar imagen con Ctrl+V
  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (item) { const file = item.getAsFile(); if (file) handleImageFile(file) }
  }

  // Drag & drop en el textarea
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleImageFile(file)
  }

  // ── Voz ─────────────────────────────────────────────────────────────────────
  function toggleVoz() {
    if (escuchando) { recognitionRef.current?.stop?.(); setEscuchando(false); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-PE'; rec.continuous = true; rec.interimResults = false
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as SpeechRecognitionResultList).map((r: any) => r[0].transcript).join(' ').trim()
      setInput(prev => prev ? prev + ' ' + t : t)
    }
    rec.onerror = rec.onend = () => setEscuchando(false)
    recognitionRef.current = rec; rec.start(); setEscuchando(true)
  }

  // ── Actualizar acción ────────────────────────────────────────────────────────
  function updateAccion(msgId: string, accionId: string, patch: Partial<AccionLocal>) {
    setMensajes(prev => prev.map(m =>
      m.id !== msgId ? m : { ...m, acciones: m.acciones?.map(a => a._id === accionId ? { ...a, ...patch } : a) }
    ))
  }

  function setEstadoAccion(msgId: string, accionId: string, estado: EstadoAccion, errorMsg?: string) {
    setMensajes(prev => prev.map(m =>
      m.id !== msgId ? m : { ...m, acciones: m.acciones?.map(a => a._id === accionId ? { ...a, estado, errorMsg } : a) }
    ))
  }

  async function confirmarAccion(msgId: string, accion: AccionLocal) {
    setEstadoAccion(msgId, accion._id, 'ejecutando')
    const r = await ejecutarAccion(accion)
    setEstadoAccion(msgId, accion._id, r.ok ? 'ok' : 'error', r.error)
  }

  // ── Bulk confirm/discard ────────────────────────────────────────────────────
  async function confirmarTodas() {
    const pendientes: { msgId: string; accion: AccionLocal }[] = []
    for (const m of mensajes) {
      for (const a of m.acciones ?? []) {
        if (a.estado === 'pendiente') pendientes.push({ msgId: m.id, accion: a })
      }
    }
    // Ejecutar en secuencia para no sobrecargar la API
    for (const { msgId, accion } of pendientes) {
      await confirmarAccion(msgId, accion)
    }
  }

  function descartarTodas() {
    setMensajes(prev => prev.map(m => ({
      ...m,
      acciones: m.acciones?.map(a => a.estado === 'pendiente' ? { ...a, estado: 'descartado' } : a),
    })))
  }

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const enviar = useCallback(async () => {
    const texto = input.trim()
    if ((!texto && !imagen) || procesando) return

    recognitionRef.current?.stop?.(); setEscuchando(false)

    const imgCaptura = imagen
    setInput(''); setImagen(null); setError(null); setProcesando(true)

    const msgUsuario: MensajeChat = {
      id: crypto.randomUUID(),
      role: 'user',
      texto: texto || (imgCaptura ? '📷 Imagen adjunta' : ''),
      imagenPreview: imgCaptura?.preview,
    }
    setMensajes(prev => [...prev, msgUsuario])

    // Historial para contexto (últimos 8 mensajes, solo texto)
    const historial = mensajes.slice(-8).map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.texto,
    }))

    try {
      const res = await fetch('/api/catalog/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje:      texto,
          imagen_base64: imgCaptura?.base64,
          mime_type:    imgCaptura?.mime,
          historial,
        }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error ?? 'Error al procesar'); return }

      setMargenMin(data.margen_minimo ?? 10)

      const accionesLocales: AccionLocal[] = (data.acciones ?? []).map(
        (a: AccionAgente, idx: number) => ({
          ...a,
          _id: `${Date.now()}-${idx}`,
          estado: 'pendiente' as EstadoAccion,
        })
      )

      setMensajes(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'agent',
        texto: data.mensaje_ia ?? '...',
        acciones: accionesLocales,
        agentesUsados: data.agentes_usados ?? [],
      }])
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setProcesando(false)
      textareaRef.current?.focus()
    }
  }, [input, imagen, procesando, mensajes])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl flex flex-col" style={{ minHeight: 'calc(100vh - 64px)' }}>

      {/* Header */}
      <div className="mb-1 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-violet-100 border border-violet-200 rounded-2xl flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-violet-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Asistente IA</h1>
            <p className="text-xs text-zinc-400">Actualiza y crea productos — texto, voz o imagen</p>
          </div>
        </div>
        <CatalogNav />
      </div>

      {/* ── Barra de acciones en lote ─────────────────────────────────────── */}
      {pendientesTotal > 0 && (
        <div className="mb-3 shrink-0 flex items-center gap-3 bg-zinc-950 text-white rounded-2xl px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-2 flex-1">
            <span className="w-5 h-5 rounded-full bg-amber-400 text-zinc-900 text-[10px] font-bold flex items-center justify-center shrink-0">
              {pendientesTotal}
            </span>
            <span className="text-sm font-medium">
              {pendientesTotal} acción{pendientesTotal !== 1 ? 'es' : ''} pendiente{pendientesTotal !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={confirmarTodas}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition">
            <CheckCheck className="w-3.5 h-3.5" /> Confirmar todas
          </button>
          <button onClick={descartarTodas}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition">
            <XCircle className="w-3.5 h-3.5" /> Descartar todas
          </button>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {mensajes.length === 0 && (
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-7 h-7 text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-zinc-700">Asistente de catálogo multiagente</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Escribe, dicta o sube una imagen. Actualiza precios, stock, crea productos y más.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { texto: 'El cemento subió a S/32',                  icon: DollarSign,  color: 'text-blue-500'   },
              { texto: 'Llegaron 200 bolsas de arena gruesa',       icon: Package,     color: 'text-amber-500'  },
              { texto: 'Agrega tornillo 2" a S/0.80, stock 500',   icon: Plus,        color: 'text-violet-500' },
              { texto: 'Sube 10% todos los productos de Pinturas',  icon: TrendingUp,  color: 'text-orange-500' },
              { texto: 'El costo del yeso es S/14 la bolsa',        icon: TrendingDown,color: 'text-purple-500' },
              { texto: 'Desactiva la masilla compac, sin stock',    icon: ToggleLeft,  color: 'text-zinc-400'   },
            ].map(({ texto, icon: Icon, color }) => (
              <button key={texto} onClick={() => setInput(texto)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left text-sm text-zinc-600 hover:text-zinc-900 transition group">
                <Icon className={cn('w-4 h-4 shrink-0 transition', color, 'group-hover:scale-110')} />
                {texto}
              </button>
            ))}
          </div>

          {/* Tips de imagen y voz */}
          <div className="mt-6 flex gap-3 flex-wrap justify-center text-xs text-zinc-400">
            <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Sube una foto de lista de precios o factura</span>
            <span className="flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Dicta con el micrófono</span>
            <span className="flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> Pega imágenes con Ctrl+V</span>
          </div>
        </div>
      )}

      {/* ── Chat ─────────────────────────────────────────────────────────── */}
      {mensajes.length > 0 && (
        <div className="flex-1 space-y-4 pb-4 overflow-y-auto">
          {mensajes.map((msg) => (
            <div key={msg.id} className={cn('flex flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>

              {/* Burbuja de texto */}
              <div className={cn(
                'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm',
                msg.role === 'user'
                  ? 'bg-zinc-900 text-white rounded-tr-none'
                  : 'bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-tl-none'
              )}>
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-violet-500 font-semibold">
                      <Bot className="w-2.5 h-2.5" /> Asistente
                    </span>
                    {msg.agentesUsados?.includes('vision') && (
                      <span className="text-[9px] font-bold bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Eye className="w-2 h-2" /> Vision
                      </span>
                    )}
                    {msg.agentesUsados?.includes('catalogo') && (
                      <span className="text-[9px] font-bold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Bot className="w-2 h-2" /> Catálogo
                      </span>
                    )}
                  </div>
                )}

                {/* Imagen adjunta (usuario) */}
                {msg.imagenPreview && (
                  <img src={msg.imagenPreview} alt="adjunta"
                    className="max-w-[220px] max-h-[160px] object-cover rounded-xl mb-2 border border-white/20" />
                )}

                <span className="whitespace-pre-wrap leading-relaxed">{msg.texto}</span>
              </div>

              {/* Action cards */}
              {msg.acciones && msg.acciones.length > 0 && (
                <div className="w-full space-y-2 max-w-2xl">
                  {msg.acciones.map(a => (
                    <AccionCard key={a._id} accion={a} margenMinimo={margenMin}
                      onUpdate={patch => updateAccion(msg.id, a._id, patch)}
                      onConfirm={() => confirmarAccion(msg.id, a)}
                      onDiscard={() => setEstadoAccion(msg.id, a._id, 'descartado')}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {procesando && (
            <div className="flex items-start gap-2">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                <span className="text-xs text-zinc-400">Procesando…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div className={cn('shrink-0 border-t border-zinc-100 pt-4', mensajes.length === 0 && 'mt-6')}>

        {/* Preview de imagen adjunta */}
        {imagen && (
          <div className="mb-2 flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
            <img src={imagen.preview} alt="adjunta" className="w-10 h-10 object-cover rounded-lg border border-sky-200" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sky-700">Imagen adjunta</p>
              <p className="text-[10px] text-sky-500 truncate">{imagen.mime}</p>
            </div>
            <button onClick={() => setImagen(null)} className="text-sky-400 hover:text-sky-700 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-white border border-zinc-200 rounded-2xl px-3 py-2.5 focus-within:border-zinc-400 transition">
          {/* Adjuntar imagen */}
          <button onClick={() => fileInputRef.current?.click()}
            title="Adjuntar imagen (o pega con Ctrl+V)"
            className={cn(
              'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition mb-0.5',
              imagen ? 'bg-sky-100 text-sky-600' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'
            )}>
            <Paperclip className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }} />

          {/* Voz */}
          {soportaVoz && (
            <button onClick={toggleVoz} title={escuchando ? 'Detener dictado' : 'Dictar con voz'}
              className={cn(
                'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition mb-0.5',
                escuchando ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'
              )}>
              {escuchando ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {/* Textarea */}
          <textarea ref={textareaRef} value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            placeholder={
              escuchando ? '🎙️ Escuchando...' :
              imagen ? 'Describe la imagen o envía así...' :
              'Escribe, dicta o adjunta una imagen...'
            }
            rows={1}
            disabled={procesando}
            className="flex-1 resize-none text-sm text-zinc-900 placeholder:text-zinc-400 outline-none bg-transparent min-h-[32px] leading-relaxed disabled:opacity-50" />

          {/* Enviar */}
          <button onClick={enviar} disabled={(!input.trim() && !imagen) || procesando}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-40 mb-0.5">
            {procesando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        <p className="text-[10px] text-zinc-400 mt-1.5 px-1">
          Enter para enviar · Shift+Enter nueva línea · Ctrl+V para pegar imágenes · Los cambios solo se guardan al confirmar
        </p>
      </div>
    </div>
  )
}
