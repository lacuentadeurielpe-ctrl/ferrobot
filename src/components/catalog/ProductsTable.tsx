'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, ToggleLeft, ToggleRight, Tag, Loader2, TrendingUp, AlertTriangle } from 'lucide-react'
import { type Producto, type Categoria } from '@/types/database'
import { formatPEN } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import CategoryManager from './CategoryManager'

interface ProductsTableProps {
  productos: Producto[]
  categorias: Categoria[]
  margenMinimo?: number
}

export default function ProductsTable({ productos: initialProductos, categorias: initialCategorias, margenMinimo = 10 }: ProductsTableProps) {
  const router = useRouter()

  const [productos, setProductos] = useState(initialProductos)
  const [categorias, setCategorias] = useState(initialCategorias)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')
  const [soloActivos, setSoloActivos] = useState(false)
  const [modalCategorias, setModalCategorias] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null)
  const [loadingEliminar, setLoadingEliminar] = useState(false)

  // Filtrado local (rápido, sin ir al servidor)
  const productosFiltrados = productos.filter((p) => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchCategoria = categoriaFiltro === 'todas' || p.categoria_id === categoriaFiltro
    const matchActivo = !soloActivos || p.activo
    return matchBusqueda && matchCategoria && matchActivo
  })

  async function toggleActivo(producto: Producto) {
    setLoadingToggle(producto.id)
    const res = await fetch(`/api/products/${producto.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !producto.activo }),
    })
    setLoadingToggle(null)
    if (res.ok) {
      setProductos((prev) =>
        prev.map((p) => (p.id === producto.id ? { ...p, activo: !p.activo } : p))
      )
    }
  }

  async function eliminar(id: string) {
    setLoadingEliminar(true)
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    setLoadingEliminar(false)
    if (res.ok) {
      setProductos((prev) => prev.filter((p) => p.id !== id))
      setConfirmEliminar(null)
    }
  }

  function getNombreCategoria(categoriaId: string | null) {
    if (!categoriaId) return null
    return categorias.find((c) => c.id === categoriaId)?.nombre ?? null
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
        />

        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
        >
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          Solo activos
        </label>

        <button
          onClick={() => setModalCategorias(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          <Tag className="w-3.5 h-3.5" />
          Categorías
        </button>
      </div>

      {/* Conteo */}
      <p className="text-xs text-gray-400">
        {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}
        {busqueda || categoriaFiltro !== 'todas' ? ' encontrados' : ' en total'}
      </p>

      {/* Tabla */}
      {productosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium text-gray-500 mb-2">Sin productos</p>
          <p className="text-sm">
            {busqueda ? 'No hay productos que coincidan con la búsqueda.' : 'Agrega tu primer producto usando el botón de arriba.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio venta</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo / Margen</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descuentos</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productosFiltrados.map((producto) => (
                <tr key={producto.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{producto.nombre}</p>
                      {producto.descripcion && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{producto.descripcion}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">por {producto.unidad}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getNombreCategoria(producto.categoria_id) ? (
                      <Badge variant="blue">{getNombreCategoria(producto.categoria_id)}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatPEN(producto.precio_base)}
                    </span>
                    {producto.modo_negociacion && (
                      <p className="text-xs text-orange-500 mt-0.5">negociable</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {producto.precio_compra > 0 ? (() => {
                      const utilidad = producto.precio_base - producto.precio_compra
                      const margen = producto.precio_base > 0 ? (utilidad / producto.precio_base) * 100 : 0
                      const bajo = margen < margenMinimo
                      return (
                        <div className="space-y-0.5">
                          <p className="text-xs text-gray-400">{formatPEN(producto.precio_compra)}</p>
                          <div className={`flex items-center justify-end gap-1 text-xs font-medium ${bajo ? 'text-red-600' : 'text-green-600'}`}>
                            {bajo
                              ? <AlertTriangle className="w-3 h-3" />
                              : <TrendingUp className="w-3 h-3" />
                            }
                            {margen.toFixed(0)}%
                          </div>
                        </div>
                      )
                    })() : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${producto.stock === 0 ? 'text-red-500' : producto.stock < 10 ? 'text-yellow-600' : 'text-gray-700'}`}>
                      {producto.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActivo(producto)} disabled={loadingToggle === producto.id}
                      className="text-gray-400 hover:text-orange-500 transition">
                      {loadingToggle === producto.id
                        ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        : producto.activo
                          ? <ToggleRight className="w-6 h-6 text-green-500" />
                          : <ToggleLeft className="w-6 h-6 text-gray-400" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {producto.reglas_descuento && producto.reglas_descuento.length > 0 ? (
                      <Badge variant="orange">{producto.reglas_descuento.length} rango{producto.reglas_descuento.length !== 1 ? 's' : ''}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/dashboard/catalog/${producto.id}`}
                        className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button onClick={() => setConfirmEliminar(producto.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de categorías */}
      <Modal open={modalCategorias} onClose={() => setModalCategorias(false)} title="Gestionar categorías" size="sm">
        <CategoryManager categorias={categorias} onChange={setCategorias} />
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={!!confirmEliminar}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => confirmEliminar && eliminar(confirmEliminar)}
        title="Eliminar producto"
        description="¿Seguro que quieres eliminar este producto? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={loadingEliminar}
        danger
      />
    </div>
  )
}
