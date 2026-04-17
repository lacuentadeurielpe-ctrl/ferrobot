'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TrendingUp, AlertTriangle } from 'lucide-react'
import { type Producto, type Categoria } from '@/types/database'
import DiscountRulesEditor, { type ReglaForm } from './DiscountRulesEditor'
import { cn } from '@/lib/utils'

const UNIDADES = ['unidad', 'bolsa', 'saco', 'metro', 'metro cuadrado', 'galón', 'litro', 'kilo', 'tonelada', 'rollo', 'plancha', 'caja', 'par']

interface ProductFormProps {
  producto?: Producto
  categorias: Categoria[]
  margenMinimo?: number
  onSuccess?: () => void
}

export default function ProductForm({ producto, categorias, margenMinimo = 10, onSuccess }: ProductFormProps) {
  const router = useRouter()
  const isEdit = !!producto

  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria_id: producto?.categoria_id ?? '',
    precio_base: producto?.precio_base?.toString() ?? '',
    precio_compra: producto?.precio_compra?.toString() ?? '',
    unidad: producto?.unidad ?? 'unidad',
    stock: producto?.stock?.toString() ?? '0',
    stock_minimo: producto?.stock_minimo?.toString() ?? '',
    modo_negociacion: producto?.modo_negociacion ?? false,
    umbral_negociacion_cantidad: producto?.umbral_negociacion_cantidad?.toString() ?? '',
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

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seccion, setSeccion] = useState<'basico' | 'descuentos'>('basico')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  // Cálculo automático de utilidad y margen
  const precioVenta = parseFloat(form.precio_base) || 0
  const precioCompra = parseFloat(form.precio_compra) || 0
  const utilidad = precioVenta - precioCompra
  const margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0
  const tieneCosto = precioCompra > 0
  const margenBajo = tieneCosto && margen < margenMinimo

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.nombre.trim()) { setError('El nombre del producto es obligatorio.'); return }
    if (!form.precio_base || parseFloat(form.precio_base) < 0) { setError('El precio debe ser un número válido.'); return }

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
      activo: form.activo,
      reglas_descuento: reglas.map(({ id: _, ...r }) => r),
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
      <div className="flex border-b border-gray-100">
        {[
          { key: 'basico', label: 'Datos del producto' },
          { key: 'descuentos', label: `Descuentos por volumen ${reglas.length > 0 ? `(${reglas.length})` : ''}` },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSeccion(key as typeof seccion)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition',
              seccion === key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                placeholder="Ej: Cemento Portland Tipo I"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                name="descripcion"
                value={form.descripcion}
                onChange={handleChange}
                rows={2}
                placeholder="Descripción opcional del producto..."
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                name="categoria_id"
                value={form.categoria_id}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unidad de medida <span className="text-red-500">*</span>
              </label>
              <select
                name="unidad"
                value={form.unidad}
                onChange={handleChange}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Precios: compra y venta lado a lado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de compra (S/)
                <span className="ml-1 text-xs text-gray-400 font-normal">lo que pagas al proveedor</span>
              </label>
              <input
                type="number"
                name="precio_compra"
                value={form.precio_compra}
                onChange={handleChange}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de venta (S/) <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-gray-400 font-normal">lo que cobra al cliente</span>
              </label>
              <input
                type="number"
                name="precio_base"
                value={form.precio_base}
                onChange={handleChange}
                min={0}
                step="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
            </div>

            {/* Resumen de rentabilidad automático */}
            {tieneCosto && precioVenta > 0 && (
              <div className={cn(
                'col-span-2 rounded-xl p-3.5 flex items-center gap-3',
                margenBajo
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-green-50 border border-green-200'
              )}>
                {margenBajo
                  ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  : <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-semibold', margenBajo ? 'text-red-700' : 'text-green-700')}>
                    Ganancia: S/{utilidad.toFixed(2)} por {form.unidad} ({margen.toFixed(1)}%)
                  </p>
                  {margenBajo && (
                    <p className="text-xs text-red-600 mt-0.5">
                      Margen por debajo del mínimo configurado ({margenMinimo}%)
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock disponible</label>
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                min={0}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alerta de stock mínimo
                <span className="ml-1 text-xs text-gray-400 font-normal">opcional</span>
              </label>
              <input
                type="number"
                name="stock_minimo"
                value={form.stock_minimo}
                onChange={handleChange}
                min={0}
                placeholder="Ej: 5"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <p className="text-xs text-gray-400 mt-1">El dashboard te alertará cuando el stock caiga a este nivel</p>
            </div>
          </div>

          {/* Modo negociación */}
          <div className="rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Modo negociación</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  El bot avisa al cliente que hay precio especial para pedidos grandes y notifica al encargado
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, modo_negociacion: !p.modo_negociacion }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition',
                  form.modo_negociacion ? 'bg-orange-500' : 'bg-gray-200'
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
                <label className="block text-xs text-gray-500 mb-1">
                  A partir de cuántas {form.unidad}s activar la negociación
                </label>
                <input
                  type="number"
                  name="umbral_negociacion_cantidad"
                  value={form.umbral_negociacion_cantidad}
                  onChange={handleChange}
                  min={1}
                  placeholder="Ej: 50"
                  className="w-40 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
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
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
            />
            <label htmlFor="activo" className="text-sm text-gray-700">
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => router.push('/dashboard/catalog')}
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </form>
  )
}
