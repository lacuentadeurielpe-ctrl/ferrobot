'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TrendingUp, AlertTriangle, Copy, Plus, Trash2, Package2, Receipt } from 'lucide-react'
import { type Producto, type Categoria } from '@/types/database'
import DiscountRulesEditor, { type ReglaForm } from './DiscountRulesEditor'
import { cn, formatPEN } from '@/lib/utils'
import { UNIDADES_SUNAT, normalizarUnidad, labelUnidad, UNIDAD_DEFAULT } from '@/lib/constantes/unidades'

// ── Unidades adicionales ───────────────────────────────────────────────────────
interface UnidadForm {
  id?: string
  unidad: string
  etiqueta: string
  precio: string
  factor_conversion: string
  activo: boolean
}

// ── Helpers dedup ─────────────────────────────────────────────────────────────
function normalizarNombreDedup(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function nombresSimilaresDedup(a: string, b: string): boolean {
  const na = normalizarNombreDedup(a)
  const nb = normalizarNombreDedup(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = na.split(/\s+/).filter((w) => w.length >= 3)
  const tb = nb.split(/\s+/).filter((w) => w.length >= 3)
  if (ta.length === 0 || tb.length === 0) return false
  const comunes = ta.filter((t) => tb.includes(t))
  return comunes.length / Math.min(ta.length, tb.length) >= 0.5
}

interface ProductFormProps {
  producto?: Producto
  categorias: Categoria[]
  margenMinimo?: number
  onSuccess?: () => void
}

const IGV_RATE = 0.18

export default function ProductForm({ producto, categorias, margenMinimo = 10, onSuccess }: ProductFormProps) {
  const router = useRouter()
  const isEdit = !!producto

  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria_id: producto?.categoria_id ?? '',
    precio_base: producto?.precio_base?.toString() ?? '',
    precio_compra: producto?.precio_compra?.toString() ?? '',
    unidad: normalizarUnidad(producto?.unidad) ?? UNIDAD_DEFAULT,
    stock: producto?.stock?.toString() ?? '0',
    stock_minimo: producto?.stock_minimo?.toString() ?? '',
    modo_negociacion: producto?.modo_negociacion ?? false,
    umbral_negociacion_cantidad: producto?.umbral_negociacion_cantidad?.toString() ?? '',
    afecto_igv: producto?.afecto_igv ?? true,
    venta_sin_stock: producto?.venta_sin_stock ?? false,
    activo: producto?.activo ?? true,
  })

  const [reglas, setReglas] = useState<ReglaForm[]>(
    producto?.reglas_descuento?.map((r) => ({
      id: r.id,
      cantidad_min: r.cantidad_min,
      cantidad_max: r.cantidad_max,
      precio_unitario: r.precio_unitario,
      modo: r.modo,
    })) ?? []
  )

  const [unidades, setUnidades] = useState<UnidadForm[]>(
    producto?.unidades_producto?.map((u) => ({
      id: u.id,
      unidad: u.unidad,
      etiqueta: u.etiqueta,
      precio: u.precio.toString(),
      factor_conversion: u.factor_conversion.toString(),
      activo: u.activo,
    })) ?? []
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seccion, setSeccion] = useState<'basico' | 'descuentos' | 'unidades'>('basico')

  // ── Dedup: solo para nuevo producto ─────────────────────────────────────────
  const [productosExistentes, setProductosExistentes] = useState<{ nombre: string }[]>([])
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isEdit) return
    fetch('/api/products')
      .then((r) => r.ok ? r.json() : [])
      .then((data: { nombre: string }[]) => setProductosExistentes(data))
      .catch(() => {})
  }, [isEdit])

  useEffect(() => {
    if (isEdit) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const nombre = form.nombre.trim()
      if (!nombre || nombre.length < 3) { setDupWarning(null); return }
      const match = productosExistentes.find((p) => nombresSimilaresDedup(nombre, p.nombre))
      setDupWarning(match ? match.nombre : null)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.nombre, productosExistentes, isEdit])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  // ── Rentabilidad con IGV ───────────────────────────────────────────────────
  const precioVenta = parseFloat(form.precio_base) || 0
  const precioCompra = parseFloat(form.precio_compra) || 0
  // Si el precio ya incluye IGV, extraemos el neto
  const precioSinIgv = form.afecto_igv && precioVenta > 0 ? precioVenta / (1 + IGV_RATE) : precioVenta
  const igvMonto = precioVenta - precioSinIgv
  const utilidad = precioSinIgv - precioCompra
  const margen = precioSinIgv > 0 ? (utilidad / precioSinIgv) * 100 : 0
  const tieneCosto = precioCompra > 0
  const margenBajo = tieneCosto && margen < margenMinimo

  // ── Helpers unidades adicionales ──────────────────────────────────────────
  function agregarUnidad() {
    setUnidades((prev) => [...prev, { unidad: '', etiqueta: '', precio: '', factor_conversion: '1', activo: true }])
  }

  function actualizarUnidad(idx: number, field: keyof UnidadForm, value: string | boolean) {
    setUnidades((prev) => prev.map((u, i) => (i === idx ? { ...u, [field]: value } : u)))
  }

  function eliminarUnidad(idx: number) {
    setUnidades((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.nombre.trim()) { setError('El nombre del producto es obligatorio.'); return }
    if (!form.precio_base || parseFloat(form.precio_base) < 0) { setError('El precio debe ser un número válido.'); return }

    // Validar unidades adicionales
    for (const u of unidades) {
      if (!u.unidad.trim() || !u.etiqueta.trim()) { setError('Completa el código y etiqueta de todas las unidades adicionales.'); return }
      if (!u.precio || parseFloat(u.precio) < 0) { setError('El precio de cada unidad adicional debe ser válido.'); return }
      if (!u.factor_conversion || parseFloat(u.factor_conversion) <= 0) { setError('El factor de conversión debe ser mayor a 0.'); return }
    }

    setLoading(true)

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria_id: form.categoria_id || null,
      precio_base: parseFloat(form.precio_base),
      precio_compra: parseFloat(form.precio_compra) || 0,
      unidad: form.unidad,
      stock: parseInt(form.stock) || 0,
      stock_minimo: form.stock_minimo ? parseInt(form.stock_minimo) : null,
      modo_negociacion: form.modo_negociacion,
      umbral_negociacion_cantidad: form.umbral_negociacion_cantidad
        ? parseInt(form.umbral_negociacion_cantidad)
        : null,
      afecto_igv: form.afecto_igv,
      venta_sin_stock: form.venta_sin_stock,
      activo: form.activo,
      reglas_descuento: reglas.map(({ id: _, ...r }) => r),
      unidades_producto: unidades.map(({ id, ...u }) => ({
        ...(id ? { id } : {}),
        unidad: u.unidad.trim(),
        etiqueta: u.etiqueta.trim(),
        precio: parseFloat(u.precio) || 0,
        factor_conversion: parseFloat(u.factor_conversion) || 1,
        activo: u.activo,
      })),
    }

    const url = isEdit ? `/api/products/${producto!.id}` : '/api/products'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar el producto.')
      return
    }

    onSuccess?.()
    router.push('/dashboard/catalog')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tabs de sección */}
      <div className="flex border-b border-zinc-100 overflow-x-auto">
        {[
          { key: 'basico', label: 'Datos del producto' },
          { key: 'descuentos', label: `Descuentos${reglas.length > 0 ? ` (${reglas.length})` : ''}` },
          { key: 'unidades', label: `Unidades adicionales${unidades.length > 0 ? ` (${unidades.length})` : ''}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSeccion(key as typeof seccion)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap',
              seccion === key
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── SECCIÓN: Datos básicos ── */}
      {seccion === 'basico' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                placeholder="Ej: Cemento Portland Tipo I"
                className={cn(
                  'w-full px-3 py-2.5 rounded-xl border text-sm text-zinc-900 focus:outline-none focus:ring-2 transition',
                  dupWarning
                    ? 'border-amber-400 focus:ring-amber-300'
                    : 'border-zinc-200 focus:ring-zinc-300'
                )}
              />
              {dupWarning && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <Copy className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    Posible duplicado de <strong>&ldquo;{dupWarning}&rdquo;</strong>.
                    Si es el mismo, edítalo desde el catálogo en vez de crear uno nuevo.
                  </span>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
              <textarea
                name="descripcion"
                value={form.descripcion}
                onChange={handleChange}
                rows={2}
                placeholder="Descripción opcional del producto..."
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Categoría</label>
              <select
                name="categoria_id"
                value={form.categoria_id}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition bg-white"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Unidad de medida <span className="text-red-500">*</span>
              </label>
              <select
                name="unidad"
                value={form.unidad}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition bg-white"
              >
                {UNIDADES_SUNAT.map((u) => (
                  <option key={u.code} value={u.code}>{u.label}</option>
                ))}
              </select>
            </div>

            {/* Precios: compra y venta lado a lado */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Precio de compra (S/)
                <span className="ml-1 text-xs text-zinc-400 font-normal">lo que pagas al proveedor</span>
              </label>
              <input
                type="number"
                name="precio_compra"
                value={form.precio_compra}
                onChange={handleChange}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Precio de venta (S/) <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-zinc-400 font-normal">
                  {form.afecto_igv ? 'incluye IGV' : 'sin IGV'}
                </span>
              </label>
              <input
                type="number"
                name="precio_base"
                value={form.precio_base}
                onChange={handleChange}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
              />
            </div>

            {/* Resumen de rentabilidad con IGV */}
            {precioVenta > 0 && (
              <div className={cn(
                'col-span-2 rounded-xl p-3.5 space-y-2',
                tieneCosto && margenBajo
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-green-50 border border-green-200'
              )}>
                {/* Desglose IGV */}
                {form.afecto_igv && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 pb-1.5 border-b border-zinc-200/60">
                    <Receipt className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="tabular-nums">
                      Sin IGV: <strong className="text-zinc-700">{formatPEN(precioSinIgv)}</strong>
                      {' '}+{' '}IGV 18%: <strong className="text-zinc-700">{formatPEN(igvMonto)}</strong>
                    </span>
                  </div>
                )}
                {/* Utilidad */}
                <div className="flex items-center gap-2">
                  {tieneCosto && margenBajo
                    ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    : <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    {tieneCosto ? (
                      <p className={cn('text-sm font-semibold', tieneCosto && margenBajo ? 'text-red-700' : 'text-green-700')}>
                        Ganancia{form.afecto_igv ? ' neta' : ''}: {formatPEN(utilidad)} / {labelUnidad(form.unidad)} ({margen.toFixed(1)}%)
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-amber-700">
                        Precio de venta registrado — sin costo ingresado
                      </p>
                    )}
                    {tieneCosto && margenBajo && (
                      <p className="text-xs text-red-600 mt-0.5">
                        Margen por debajo del mínimo configurado ({margenMinimo}%)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Stock disponible</label>
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                min={0}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Alerta de stock mínimo
                <span className="ml-1 text-xs text-zinc-400 font-normal">opcional</span>
              </label>
              <input
                type="number"
                name="stock_minimo"
                value={form.stock_minimo}
                onChange={handleChange}
                min={0}
                placeholder="Ej: 5"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
              />
              <p className="text-xs text-zinc-400 mt-1">El dashboard te alertará cuando el stock caiga a este nivel</p>
            </div>
          </div>

          {/* IGV */}
          <div className="rounded-xl border border-zinc-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-800">Afecto a IGV</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  El precio de venta incluye 18% de IGV — se muestra el desglose en la cotización
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, afecto_igv: !p.afecto_igv }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition',
                  form.afecto_igv ? 'bg-zinc-900' : 'bg-zinc-200'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                  form.afecto_igv ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
          </div>

          {/* Venta sin stock */}
          <div className="rounded-xl border border-zinc-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-800">Venta sin stock</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Permite cotizar y vender este producto aunque el stock sea cero (pedido bajo encargo)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, venta_sin_stock: !p.venta_sin_stock }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition',
                  form.venta_sin_stock ? 'bg-blue-600' : 'bg-zinc-200'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                  form.venta_sin_stock ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
          </div>

          {/* Modo negociación */}
          <div className="rounded-xl border border-zinc-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-800">Modo negociación</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  El bot avisa al cliente que hay precio especial para pedidos grandes y notifica al encargado
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, modo_negociacion: !p.modo_negociacion }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition',
                  form.modo_negociacion ? 'bg-zinc-900' : 'bg-zinc-200'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                  form.modo_negociacion ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>

            {form.modo_negociacion && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  A partir de cuántas {labelUnidad(form.unidad).toLowerCase()}s activar la negociación
                </label>
                <input
                  type="number"
                  name="umbral_negociacion_cantidad"
                  value={form.umbral_negociacion_cantidad}
                  onChange={handleChange}
                  min={1}
                  placeholder="Ej: 50"
                  className="w-40 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
                />
              </div>
            )}
          </div>

          {/* Estado activo */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              name="activo"
              id="activo"
              checked={form.activo}
              onChange={handleChange}
              className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
            />
            <label htmlFor="activo" className="text-sm text-zinc-700">
              Producto activo (visible para el bot y los clientes)
            </label>
          </div>
        </div>
      )}

      {/* ── SECCIÓN: Descuentos por volumen ── */}
      {seccion === 'descuentos' && (
        <DiscountRulesEditor
          reglas={reglas}
          onChange={setReglas}
          unidad={form.unidad}
          precioCompra={precioCompra}
          margenMinimo={margenMinimo}
        />
      )}

      {/* ── SECCIÓN: Unidades adicionales ── */}
      {seccion === 'unidades' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <Package2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-700 space-y-0.5">
              <p className="font-semibold">¿Para qué sirve esto?</p>
              <p>
                Permite que el cliente cotice el mismo producto en distintas unidades.
                Por ejemplo: <em>arena gruesa</em> puede venderse <em>por lata</em> (S/ 3.50) o <em>por metro cúbico</em> (S/ 63.00, factor: 18 latas = 1 m³).
              </p>
              <p className="text-blue-500 mt-1">
                El bot detectará automáticamente cuándo el cliente pide por lata, m³, paquete, etc.
              </p>
            </div>
          </div>

          {unidades.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-zinc-200 rounded-xl">
              <Package2 className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 font-medium">Sin unidades adicionales</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                La unidad base es <strong>{labelUnidad(form.unidad)}</strong>.
                Agrega variantes si el producto se vende en más de una presentación.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 px-1">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Código / unidad</span>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Etiqueta (bot)</span>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-24">Precio S/</span>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-20">Factor</span>
                <span className="w-8" />
              </div>

              {unidades.map((u, idx) => (
                <div key={idx} className={cn(
                  'grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center p-2 rounded-xl border transition',
                  u.activo ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50'
                )}>
                  <input
                    value={u.unidad}
                    onChange={(e) => actualizarUnidad(idx, 'unidad', e.target.value)}
                    placeholder="Ej: lata, MTR3"
                    className="px-2.5 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
                  />
                  <input
                    value={u.etiqueta}
                    onChange={(e) => actualizarUnidad(idx, 'etiqueta', e.target.value)}
                    placeholder="Ej: Por lata, Por m³"
                    className="px-2.5 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">S/</span>
                    <input
                      type="number"
                      value={u.precio}
                      onChange={(e) => actualizarUnidad(idx, 'precio', e.target.value)}
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className="w-full pl-7 pr-2 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      value={u.factor_conversion}
                      onChange={(e) => actualizarUnidad(idx, 'factor_conversion', e.target.value)}
                      min={0.0001}
                      step="0.01"
                      title="Cuántas unidades base equivale (ej: 1 m³ = 18 latas → factor 18)"
                      className="w-full px-2.5 py-2 rounded-lg border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title={u.activo ? 'Desactivar' : 'Activar'}
                      onClick={() => actualizarUnidad(idx, 'activo', !u.activo)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition shrink-0',
                        u.activo ? 'bg-zinc-900' : 'bg-zinc-300'
                      )}
                    >
                      <span className={cn(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition',
                        u.activo ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarUnidad(idx)}
                      className="p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Factor hint */}
          {unidades.length > 0 && (
            <p className="text-xs text-zinc-400">
              <strong>Factor:</strong> cuántas unidades base ({labelUnidad(form.unidad)}) equivale a 1 de esta presentación.
              Ej: si 1 m³ = 18 latas, escribe <strong>18</strong>.
              Sirve para descontar stock automáticamente.
            </p>
          )}

          <button
            type="button"
            onClick={agregarUnidad}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-zinc-200 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            Agregar unidad adicional
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
        <button
          type="button"
          onClick={() => router.push('/dashboard/catalog')}
          className="text-sm text-zinc-500 hover:text-zinc-700 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white font-medium rounded-xl text-sm transition"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </form>
  )
}
