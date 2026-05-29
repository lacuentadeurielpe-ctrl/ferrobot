'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn, matchesFuzzy } from '@/lib/utils'
import { X, Plus, Trash2, Search, Loader2, Package, Check } from 'lucide-react'

interface Producto {
  id: string
  nombre: string
  unidad: string
  precio_base: number
  precio_compra: number
  stock: number
}

interface ItemCarrito {
  producto_id: string | null
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
}

interface NuevaCotizacionModalProps {
  productos: Producto[]
  onClose: () => void
}

export default function NuevaCotizacionModal({ productos, onClose }: NuevaCotizacionModalProps) {
  const router = useRouter()
  const [items, setItems] = useState<ItemCarrito[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [itemManual, setItemManual] = useState({ nombre: '', unidad: 'und', cantidad: 1, precio: 0 })
  const [modoManual, setModoManual] = useState(false)
  const busquedaRef = useRef<HTMLInputElement>(null)

  const [nombreCliente, setNombreCliente] = useState('')
  const [telefonoCliente, setTelefonoCliente] = useState('')
  const [notas, setNotas] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sugiere productos del catálogo activos
  const sugerencias = busqueda.trim().length >= 1
    ? productos.filter((p) =>
        matchesFuzzy(p.nombre, busqueda)
      ).slice(0, 8)
    : []

  const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)

  function agregarProducto(p: Producto) {
    const existe = items.findIndex((i) => i.producto_id === p.id)
    if (existe >= 0) {
      setItems((prev) => prev.map((i, idx) => idx === existe ? { ...i, cantidad: i.cantidad + 1 } : i))
    } else {
      setItems((prev) => [...prev, {
        producto_id: p.id,
        nombre_producto: p.nombre,
        unidad: p.unidad,
        cantidad: 1,
        precio_unitario: p.precio_base,
      }])
    }
    setBusqueda('')
    setMostrarSugerencias(false)
    busquedaRef.current?.focus()
  }

  function agregarManual() {
    if (!itemManual.nombre.trim() || itemManual.precio <= 0) return
    setItems((prev) => [...prev, {
      producto_id: null,
      nombre_producto: itemManual.nombre.trim(),
      unidad: itemManual.unidad.trim() || 'und',
      cantidad: itemManual.cantidad,
      precio_unitario: itemManual.precio,
    }])
    setItemManual({ nombre: '', unidad: 'und', cantidad: 1, precio: 0 })
    setModoManual(false)
  }

  function actualizarItem(idx: number, campo: 'cantidad' | 'precio_unitario', valor: number) {
    setItems((prev) => prev.map((i, n) => n === idx ? { ...i, [campo]: valor } : i))
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, n) => n !== idx))
  }

  async function guardar() {
    if (!items.length) { setError('Agrega al menos un producto'); return }
    if (!nombreCliente.trim()) { setError('El nombre del cliente es obligatorio'); return }
    if (!telefonoCliente.trim()) { setError('El teléfono del cliente es obligatorio'); return }

    setGuardando(true)
    setError(null)

    try {
      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_cliente: nombreCliente.trim(),
          telefono_cliente: telefonoCliente.trim(),
          notas_dueno: notas.trim() || undefined,
          items,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Error al crear la cotización')
      }

      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-busqueda]')) setMostrarSugerencias(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 font-sans">Nueva cotización manual</h2>
            <p className="text-xs text-gray-400 mt-0.5">Genera una cotización rápida sin afectar stock en inventario</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── SECCIÓN: PRODUCTOS ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Productos</h3>
              <button
                type="button"
                onClick={() => setModoManual((v) => !v)}
                className="text-xs text-orange-600 hover:text-orange-700 transition"
              >
                {modoManual ? 'Buscar en catálogo' : '+ Producto personalizado'}
              </button>
            </div>

            {/* Buscador de catálogo */}
            {!modoManual && (
              <div className="relative" data-busqueda>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={busquedaRef}
                    value={busqueda}
                    onChange={(e) => { setBusqueda(e.target.value); setMostrarSugerencias(true) }}
                    onFocus={() => busqueda && setMostrarSugerencias(true)}
                    placeholder="Buscar producto del catálogo…"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                {mostrarSugerencias && sugerencias.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                    {sugerencias.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => agregarProducto(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 transition text-left"
                      >
                        <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
                          <p className="text-xs text-gray-400">S/{p.precio_base.toFixed(2)} / {p.unidad} · stk: {p.stock}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {mostrarSugerencias && busqueda.trim().length >= 1 && sugerencias.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                    Sin resultados. Usa "Producto personalizado" para añadir uno libre.
                  </div>
                )}
              </div>
            )}

            {/* Producto manual */}
            {modoManual && (
              <div className="bg-orange-50 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input
                      value={itemManual.nombre}
                      onChange={(e) => setItemManual((p) => ({ ...p, nombre: e.target.value }))}
                      placeholder="Nombre del producto"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                    />
                  </div>
                  <input
                    value={itemManual.unidad}
                    onChange={(e) => setItemManual((p) => ({ ...p, unidad: e.target.value }))}
                    placeholder="Unidad (und, m, kg…)"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                  />
                  <input
                    type="number"
                    value={itemManual.precio || ''}
                    onChange={(e) => setItemManual((p) => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                    placeholder="Precio S/"
                    min={0}
                    step={0.01}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={itemManual.cantidad}
                    onChange={(e) => setItemManual((p) => ({ ...p, cantidad: parseInt(e.target.value) || 1 }))}
                    min={1}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                  />
                  <span className="text-sm text-gray-500 flex-1">unidades</span>
                  <button
                    type="button"
                    onClick={agregarManual}
                    className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de items */}
            {items.length > 0 && (
              <div className="mt-3 space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.nombre_producto}</p>
                      <p className="text-xs text-gray-400">{item.unidad}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => actualizarItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                        min={1}
                        className="w-14 px-2 py-1 border border-gray-200 rounded text-sm text-gray-900 text-center bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      <span className="text-gray-400 text-xs">×</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span>
                        <input
                          type="number"
                          value={item.precio_unitario}
                          onChange={(e) => actualizarItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                          min={0}
                          step={0.01}
                          className="w-20 pl-6 pr-2 py-1 border border-gray-200 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-16 text-right font-sans">
                        S/{(item.cantidad * item.precio_unitario).toFixed(2)}
                      </span>
                    </div>
                    <button onClick={() => eliminarItem(idx)} className="text-gray-400 hover:text-red-500 transition ml-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <span className="text-sm font-bold text-gray-900 font-sans">
                    Total: S/{total.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── SECCIÓN: CLIENTE ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Datos del cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input
                  value={nombreCliente}
                  onChange={(e) => setNombreCliente(e.target.value)}
                  placeholder="Juan Pérez"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Teléfono <span className="text-red-500">*</span></label>
                <input
                  value={telefonoCliente}
                  onChange={(e) => setTelefonoCliente(e.target.value)}
                  placeholder="51987654321"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                />
              </div>
            </div>
          </div>

          {/* ── NOTAS ── */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas internas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Escribe comentarios o notas especiales de esta cotización..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {items.length > 0 && (
            <span className="text-sm text-gray-500 mr-auto font-sans">
              {items.length} {items.length === 1 ? 'producto' : 'productos'} ·{' '}
              <span className="font-semibold text-gray-800">S/{total.toFixed(2)}</span>
            </span>
          )}
          {!items.length && <span className="mr-auto" />}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
          >
            {guardando
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Check className="w-4 h-4" />
            }
            {guardando ? 'Guardando…' : 'Crear cotización'}
          </button>
        </div>

        {error && (
          <div className="px-6 pb-4">
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
