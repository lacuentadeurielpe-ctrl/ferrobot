'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, Camera, MessageSquare, Loader2,
  CheckSquare, Square, CheckCircle, AlertTriangle, ChevronDown,
  ChevronUp, RefreshCw, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import CatalogNav from '@/components/catalog/CatalogNav'
import type { ProductoParaConfirmar } from '@/app/api/catalog/ai-extract/route'

const UNIDADES = ['unidad', 'bolsa', 'saco', 'metro', 'metro cuadrado', 'galón', 'litro', 'kilo', 'tonelada', 'rollo', 'plancha', 'caja', 'par']

type Estado = 'entrada' | 'procesando' | 'confirmacion' | 'guardando' | 'resultado'
type ModoEntrada = 'texto' | 'imagen'

interface ProductoEditando extends ProductoParaConfirmar {
  _key: string
  seleccionado: boolean
  expandido: boolean
  // campos editados por el dueño (sobreescriben lo de la IA)
  _nombre: string
  _descripcion: string
  _categoria: string
  _precio_base: string
  _precio_compra: string
  _unidad: string
  _stock: string
}

function crearEditable(p: ProductoParaConfirmar, idx: number): ProductoEditando {
  return {
    ...p,
    _key: `${idx}-${p.nombre ?? 'prod'}`,
    seleccionado: true,
    expandido: false,
    _nombre: p.nombre ?? '',
    _descripcion: p.descripcion ?? '',
    _categoria: p.categoria ?? '',
    _precio_base: p.precio_base?.toString() ?? '',
    _precio_compra: p.precio_compra?.toString() ?? '',
    _unidad: p.unidad ?? 'unidad',
    _stock: p.stock?.toString() ?? '',
  }
}

export default function CatalogAIPage() {
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>('entrada')
  const [modo, setModo] = useState<ModoEntrada>('texto')
  const [texto, setTexto] = useState('')
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenBase64, setImagenBase64] = useState<string | null>(null)
  const [imagenMime, setImagenMime] = useState<string>('')
  const [mensajeIA, setMensajeIA] = useState('')
  const [productos, setProductos] = useState<ProductoEditando[]>([])
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number } | null>(null)
  const inputImagenRef = useRef<HTMLInputElement>(null)

  // ── Manejo de imagen ─────────────────────────────────────────────────────
  function handleImagen(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen no puede superar los 8 MB')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagenPreview(dataUrl)
      // Separar el base64 puro del data URL
      const base64 = dataUrl.split(',')[1]
      setImagenBase64(base64)
      setImagenMime(file.type)
    }
    reader.readAsDataURL(file)
  }

  // ── Enviar a la IA ───────────────────────────────────────────────────────
  async function analizar() {
    setError(null)

    if (modo === 'texto' && !texto.trim()) {
      setError('Escribe algo para que la IA analice')
      return
    }
    if (modo === 'imagen' && !imagenBase64) {
      setError('Selecciona una imagen primero')
      return
    }

    setEstado('procesando')

    const body = modo === 'imagen'
      ? { modo: 'imagen', imagen_base64: imagenBase64, mime_type: imagenMime }
      : { modo: 'texto', texto }

    const res = await fetch('/api/catalog/ai-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Error al analizar')
      setEstado('entrada')
      return
    }

    setMensajeIA(data.mensaje_ia)
    setProductos(data.productos.map(crearEditable))
    setEstado('confirmacion')
  }

  // ── Edición de un producto ───────────────────────────────────────────────
  const actualizarCampo = useCallback(
    (key: string, campo: keyof ProductoEditando, valor: unknown) => {
      setProductos((prev) =>
        prev.map((p) => (p._key === key ? { ...p, [campo]: valor } : p))
      )
    },
    []
  )

  // ── Selección ────────────────────────────────────────────────────────────
  const seleccionados = productos.filter((p) => p.seleccionado)
  function seleccionarTodos() { setProductos((p) => p.map((x) => ({ ...x, seleccionado: true }))) }
  function deseleccionarTodos() { setProductos((p) => p.map((x) => ({ ...x, seleccionado: false }))) }

  // ── Guardar ──────────────────────────────────────────────────────────────
  async function confirmar() {
    if (seleccionados.length === 0) return
    setEstado('guardando')
    setError(null)

    const items = seleccionados.map((p) => ({
      accion: p.accion,
      producto_existente_id: p.producto_existente_id,
      nombre: p._nombre.trim() || p.nombre || 'Producto sin nombre',
      descripcion: p._descripcion.trim() || null,
      categoria: p._categoria.trim() || null,
      precio_base: p._precio_base ? parseFloat(p._precio_base) : null,
      precio_compra: p._precio_compra ? parseFloat(p._precio_compra) : null,
      unidad: p._unidad || 'unidad',
      stock: p._stock ? parseInt(p._stock) : null,
    }))

    const res = await fetch('/api/catalog/ai-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
      setEstado('confirmacion')
      return
    }

    setResultado(data)
    setEstado('resultado')
    router.refresh()
  }

  // ── Reiniciar ────────────────────────────────────────────────────────────
  function reiniciar() {
    setEstado('entrada')
    setTexto('')
    setImagenPreview(null)
    setImagenBase64(null)
    setImagenMime('')
    setProductos([])
    setMensajeIA('')
    setError(null)
    setResultado(null)
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Catálogo</h1>
      </div>

      <CatalogNav />

      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Carga inteligente con IA</h2>
          <p className="text-sm text-gray-500">Sube una foto o escribe en lenguaje natural</p>
        </div>
      </div>

      {/* ── ESTADO: Resultado ────────────────────────────────────────────── */}
      {estado === 'resultado' && resultado && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-3">¡Listo!</h2>
          <div className="flex justify-center gap-6 mb-6">
            {resultado.creados > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{resultado.creados}</p>
                <p className="text-sm text-gray-500">producto{resultado.creados !== 1 ? 's' : ''} creado{resultado.creados !== 1 ? 's' : ''}</p>
              </div>
            )}
            {resultado.actualizados > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{resultado.actualizados}</p>
                <p className="text-sm text-gray-500">producto{resultado.actualizados !== 1 ? 's' : ''} actualizado{resultado.actualizados !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={reiniciar}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
              <RefreshCw className="w-4 h-4" />
              Analizar más
            </button>
            <Link href="/dashboard/catalog"
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Ver catálogo
            </Link>
          </div>
        </div>
      )}

      {/* ── ESTADO: Procesando ───────────────────────────────────────────── */}
      {estado === 'procesando' && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
          <p className="text-lg font-semibold text-gray-800 mb-1">Analizando...</p>
          <p className="text-sm text-gray-400">La IA está leyendo el contenido, un momento</p>
        </div>
      )}

      {/* ── ESTADO: Guardando ────────────────────────────────────────────── */}
      {estado === 'guardando' && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
          </div>
          <p className="text-lg font-semibold text-gray-800 mb-1">Guardando productos...</p>
          <p className="text-sm text-gray-400">Un momento</p>
        </div>
      )}

      {/* ── ESTADO: Entrada ──────────────────────────────────────────────── */}
      {estado === 'entrada' && (
        <div className="space-y-4">
          {/* Tabs de modo */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => setModo('imagen')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition',
                  modo === 'imagen'
                    ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <Camera className="w-4 h-4" />
                📷 Foto / Imagen
              </button>
              <button
                onClick={() => setModo('texto')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition',
                  modo === 'texto'
                    ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <MessageSquare className="w-4 h-4" />
                ✏️ Texto libre
              </button>
            </div>

            <div className="p-5">
              {/* ── Modo imagen ── */}
              {modo === 'imagen' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Sube una foto de un producto, lista de precios, factura de proveedor o cualquier documento
                  </p>
                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImagen(e.target.files[0])}
                  />
                  {!imagenPreview ? (
                    <button
                      onClick={() => inputImagenRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-purple-300 hover:bg-purple-50/30 transition group"
                    >
                      <Camera className="w-10 h-10 text-gray-300 group-hover:text-purple-400 mx-auto mb-3 transition" />
                      <p className="text-sm font-medium text-gray-500 group-hover:text-purple-600">
                        Haz clic para seleccionar una imagen
                      </p>
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · Máx. 8 MB</p>
                    </button>
                  ) : (
                    <div className="relative">
                      <img
                        src={imagenPreview}
                        alt="Imagen seleccionada"
                        className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50"
                      />
                      <button
                        onClick={() => { setImagenPreview(null); setImagenBase64(null) }}
                        className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow text-gray-500 hover:text-red-500 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Modo texto ── */}
              {modo === 'texto' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Escribe en lenguaje natural. Ejemplos:
                  </p>
                  <div className="space-y-1.5">
                    {[
                      '"agrega cemento Sol bolsa 42 kilos a 9 soles"',
                      '"actualiza la pintura CPP blanca que subió a 32"',
                      '"clavo 2 pulgadas 8 el kilo, tornillo 3/8 a 0.50 la unidad"',
                    ].map((ej) => (
                      <button
                        key={ej}
                        onClick={() => setTexto(ej.replace(/"/g, ''))}
                        className="block w-full text-left text-xs text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-1.5 transition"
                      >
                        {ej}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe aquí los productos o precios..."
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 transition resize-none"
                  />
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={analizar}
            disabled={modo === 'imagen' ? !imagenBase64 : !texto.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            Analizar con IA
          </button>
        </div>
      )}

      {/* ── ESTADO: Confirmación ─────────────────────────────────────────── */}
      {estado === 'confirmacion' && (
        <div className="space-y-4">
          {/* Mensaje de la IA */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-0.5">IA dice:</p>
              <p className="text-sm text-purple-800">{mensajeIA}</p>
            </div>
          </div>

          {/* Barra de acciones */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">
                  {productos.length} producto{productos.length !== 1 ? 's' : ''} encontrado{productos.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-gray-400">
                  {seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={seleccionarTodos}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium transition">
                  Seleccionar todo
                </button>
                <span className="text-gray-400">|</span>
                <button onClick={deseleccionarTodos}
                  className="text-xs text-gray-400 hover:text-gray-600 font-medium transition">
                  Deseleccionar todo
                </button>
              </div>
            </div>

            {/* Lista de productos */}
            <div className="divide-y divide-gray-50">
              {productos.map((p) => (
                <ProductoRow
                  key={p._key}
                  producto={p}
                  onToggleSelect={() => actualizarCampo(p._key, 'seleccionado', !p.seleccionado)}
                  onToggleExpand={() => actualizarCampo(p._key, 'expandido', !p.expandido)}
                  onChange={(campo, valor) => actualizarCampo(p._key, campo, valor)}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Botones de confirmación */}
          <div className="flex gap-3">
            <button
              onClick={reiniciar}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={seleccionados.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition"
            >
              <CheckCircle className="w-4 h-4" />
              Confirmar {seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-componente: fila de producto en pantalla de confirmación
// ════════════════════════════════════════════════════════════════════════════
interface ProductoRowProps {
  producto: ProductoEditando
  onToggleSelect: () => void
  onToggleExpand: () => void
  onChange: (campo: keyof ProductoEditando, valor: string) => void
}

function ProductoRow({ producto: p, onToggleSelect, onToggleExpand, onChange }: ProductoRowProps) {
  const esActualizacion = p.accion === 'actualizar'

  return (
    <div className={cn('transition', !p.seleccionado && 'opacity-50')}>
      {/* Fila principal */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        <button onClick={onToggleSelect} className="shrink-0 text-gray-400 hover:text-purple-600 transition">
          {p.seleccionado
            ? <CheckSquare className="w-5 h-5 text-purple-600" />
            : <Square className="w-5 h-5" />
          }
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">
              {p._nombre || <span className="text-gray-400 italic">Sin nombre</span>}
            </p>
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
              esActualizacion
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            )}>
              {esActualizacion ? `↺ Actualizar: ${p.producto_existente_nombre}` : '+ Nuevo'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {[
              p._precio_base ? `S/${parseFloat(p._precio_base).toFixed(2)}` : null,
              p._unidad,
              p._categoria,
            ].filter(Boolean).join(' · ')}
            {!p._nombre && !p._precio_base && (
              <span className="text-orange-500">⚠ Revisa los datos</span>
            )}
          </p>
        </div>

        {/* Toggle expand */}
        <button onClick={onToggleExpand} className="shrink-0 text-gray-400 hover:text-gray-600 transition p-1">
          {p.expandido
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Campos editables (expandidos) */}
      {p.expandido && (
        <div className="px-4 pb-4 bg-gray-50/60 border-t border-gray-100">
          <p className="text-xs text-gray-400 py-2 mb-1">Edita los campos si necesitas corregir algo:</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input
                value={p._nombre}
                onChange={(e) => onChange('_nombre', e.target.value)}
                placeholder="Nombre del producto"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Descripción</label>
              <input
                value={p._descripcion}
                onChange={(e) => onChange('_descripcion', e.target.value)}
                placeholder="Descripción opcional"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio venta (S/)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p._precio_base}
                onChange={(e) => onChange('_precio_base', e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Precio compra (S/)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p._precio_compra}
                onChange={(e) => onChange('_precio_compra', e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unidad</label>
              <select
                value={p._unidad}
                onChange={(e) => onChange('_unidad', e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              >
                <option value="">— seleccionar —</option>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Categoría</label>
              <input
                value={p._categoria}
                onChange={(e) => onChange('_categoria', e.target.value)}
                placeholder="Ej: Cemento, Pinturas"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Stock</label>
              <input
                type="number"
                min={0}
                value={p._stock}
                onChange={(e) => onChange('_stock', e.target.value)}
                placeholder="0"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white transition"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
