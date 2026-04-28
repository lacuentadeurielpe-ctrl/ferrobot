'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, ToggleLeft, ToggleRight, Tag, Loader2, TrendingUp, AlertTriangle, Copy } from 'lucide-react'
import { type Producto, type Categoria } from '@/types/database'
import { formatPEN } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import CategoryManager from './CategoryManager'
import DuplicadosPanel from './DuplicadosPanel'

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
  const [modalDuplicados, setModalDuplicados] = useState(false)

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

  function handleMerge(conservarId: string, eliminarId: string, stockNuevo: number, accion: string) {
    setProductos((prev) => {
      // Quitar el eliminado
      const sinEliminado = prev.filter((p) => p.id !== eliminarId)
      // Si fue solo eliminación (sin fusión), ya está
      if (!conservarId) return sinEliminado
      // Actualizar stock del conservado
      return sinEliminado.map((p) =>
        p.id === conservarId
          ? { ...p, stock: stockNuevo, activo: accion === 'desactivado' ? p.activo : true }
          : p
      )
    })
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
          className="flex-1 min-w-48 px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition"
        />

        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition bg-white"
        >
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
          />
          Solo activos
        </label>

        <button
          onClick={() => setModalCategorias(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition font-medium"
        >
          <Tag className="w-3.5 h-3.5" />
          Categorías
        </button>

        <button
          onClick={() => setModalDuplicados(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-700 hover:bg-amber-100 transition font-medium"
        >
          <Copy className="w-3.5 h-3.5" />
          Duplicados
        </button>
      </div>

      {/* Conteo */}
      <p className="text-xs text-zinc-400">
        {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}
        {busqueda || categoriaFiltro !== 'todas' ? ' encontrados' : ' en total'}
      </p>

      {/* Tabla */}
      {productosFiltrados.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm font-medium text-zinc-500 mb-1">Sin productos</p>
          <p className="text-sm text-zinc-400">
            {busqueda ? 'No hay productos que coincidan con la búsqueda.' : 'Agrega tu primer producto usando el botón de arriba.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Producto</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Categoría</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Precio venta</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Costo / Margen</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Stock</th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Descuentos</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {productosFiltrados.map((producto) => (
                <tr key={producto.id} className="hover:bg-zinc-50/60 transition">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{producto.nombre}</p>
                      {producto.descripcion && (
                        <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{producto.descripcion}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-0.5">por {producto.unidad}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getNombreCategoria(producto.categoria_id) ? (
                      <Badge variant="blue">{getNombreCategoria(producto.categoria_id)}</Badge>
                    ) : (
                      <span className="text-xs text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-zinc-900 tabular-nums">
                      {formatPEN(producto.precio_base)}
                    </span>
                    {producto.modo_negociacion && (
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">negociable</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {producto.precio_compra > 0 ? (() => {
                      const utilidad = producto.precio_base - producto.precio_compra
                      const margen = producto.precio_base > 0 ? (utilidad / producto.precio_base) * 100 : 0
                      const bajo = margen < margenMinimo
                      return (
                        <div className="space-y-0.5">
                          <p className="text-xs text-zinc-400 tabular-nums">{formatPEN(producto.precio_compra)}</p>
                          <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${bajo ? 'text-red-600' : 'text-emerald-600'}`}>
                            {bajo
                              ? <AlertTriangle className="w-3 h-3" />
                              : <TrendingUp className="w-3 h-3" />
                            }
                            {margen.toFixed(0)}%
                          </div>
                        </div>
                      )
                    })() : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Sin costo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold tabular-nums ${producto.stock === 0 ? 'text-red-500' : producto.stock < 10 ? 'text-amber-600' : 'text-zinc-700'}`}>
                      {producto.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActivo(producto)} disabled={loadingToggle === producto.id}
                      className="text-zinc-400 hover:text-zinc-600 transition">
                      {loadingToggle === producto.id
                        ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        : producto.activo
                          ? <ToggleRight className="w-6 h-6 text-emerald-500" />
                          : <ToggleLeft className="w-6 h-6 text-zinc-300" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {producto.reglas_descuento && producto.reglas_descuento.length > 0 ? (
                      <Badge variant="orange">{producto.reglas_descuento.length} rango{producto.reglas_descuento.length !== 1 ? 's' : ''}</Badge>
                    ) : (
                      <span className="text-xs text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/dashboard/catalog/${producto.id}`}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button onClick={() => setConfirmEliminar(producto.id)}
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
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

      {/* Modal de duplicados */}
      <Modal open={modalDuplicados} onClose={() => setModalDuplicados(false)} title="Detectar y fusionar duplicados" size="lg">
        <DuplicadosPanel
          productos={productos}
          onMerge={handleMerge}
          onClose={() => setModalDuplicados(false)}
        />
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
