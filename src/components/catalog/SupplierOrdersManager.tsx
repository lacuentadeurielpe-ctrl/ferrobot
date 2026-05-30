'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Search, Plus, ClipboardList, Trash2, Check, RefreshCw, 
  Send, Download, Tag, FileText, AlertTriangle, Building, 
  Bookmark, Package, Sparkles, X, ChevronDown, CheckCircle
} from 'lucide-react'
import { type Producto, type Categoria } from '@/types/database'
import { formatPEN } from '@/lib/utils'
import Badge from '@/components/ui/Badge'

interface SupplierOrdersManagerProps {
  productos: Producto[]
  categorias: Categoria[]
}

interface ManualItem {
  id: string
  nombre: string
  marca: string
  proveedor: string
  cantidad: number
  precio_compra: number
  unidad: string
}

export default function SupplierOrdersManager({ 
  productos: initialProductos, 
  categorias 
}: SupplierOrdersManagerProps) {
  const router = useRouter()

  // --- Estados locales ---
  const [productos, setProductos] = useState<Producto[]>(initialProductos)
  const [manualItems, setManualItems] = useState<ManualItem[]>([])
  
  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [proveedorFiltro, setProveedorFiltro] = useState<string>('todos')
  const [mostrarTodos, setMostrarTodos] = useState(false) // false = solo stock bajo, true = todo el catálogo
  
  // Estados de edición y selección
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedManualIds, setSelectedManualIds] = useState<string[]>([])
  
  // Cantidades y costos customizados
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({})
  const [orderCosts, setOrderCosts] = useState<Record<string, number>>({})
  
  // Guardado inline
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editProveedorId, setEditProveedorId] = useState<string | null>(null)
  const [editMarcaId, setEditMarcaId] = useState<string | null>(null)
  
  // Formulario de ítem manual (fuera de catálogo)
  const [mostrarFormManual, setMostrarFormManual] = useState(false)
  const [formManual, setFormManual] = useState({
    nombre: '',
    marca: '',
    proveedor: '',
    cantidad: 1,
    precio_compra: 0,
    unidad: 'unidad'
  })

  // Listar proveedores únicos existentes para filtros y autocompletado
  const proveedoresUnicos = useMemo(() => {
    const sets = new Set<string>()
    productos.forEach(p => {
      if (p.proveedor?.trim()) sets.add(p.proveedor.trim())
    })
    manualItems.forEach(m => {
      if (m.proveedor?.trim()) sets.add(m.proveedor.trim())
    })
    return Array.from(sets).sort()
  }, [productos, manualItems])

  // Inicializar cantidad recomendada por defecto (mínimo - stock)
  const getCantidadRecomendada = (p: Producto) => {
    if (orderQuantities[p.id] !== undefined) return orderQuantities[p.id]
    if (p.stock_minimo !== null && p.stock < p.stock_minimo) {
      return p.stock_minimo - p.stock
    }
    return 1
  }

  // Costo por defecto
  const getCostoDefecto = (p: Producto) => {
    if (orderCosts[p.id] !== undefined) return orderCosts[p.id]
    return p.precio_compra || 0
  }

  // Filtrado de productos del catálogo
  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      // Búsqueda por término (nombre, descripción, marca, proveedor)
      const matchTerm = busqueda.trim() === '' || [
        p.nombre,
        p.descripcion ?? '',
        p.marca ?? '',
        p.proveedor ?? ''
      ].some(str => str.toLowerCase().includes(busqueda.toLowerCase()))

      // Filtro de proveedor
      let matchProveedor = true
      if (proveedorFiltro === 'sin_proveedor') {
        matchProveedor = !p.proveedor || p.proveedor.trim() === ''
      } else if (proveedorFiltro !== 'todos') {
        matchProveedor = p.proveedor?.trim() === proveedorFiltro
      }

      // Filtro de stock bajo (alerta)
      const esBajoStock = p.stock_minimo !== null ? p.stock <= p.stock_minimo : p.stock === 0
      const matchStock = mostrarTodos || esBajoStock

      return matchTerm && matchProveedor && matchStock
    })
  }, [productos, busqueda, proveedorFiltro, mostrarTodos])

  // --- Acciones de actualización inline ---
  const handleSaveProductField = async (productId: string, field: 'proveedor' | 'marca', value: string) => {
    setSavingId(productId)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value.trim() || null })
      })
      if (res.ok) {
        setProductos(prev => prev.map(p => p.id === productId ? { ...p, [field]: value.trim() || null } : p))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSavingId(null)
      setEditProveedorId(null)
      setEditMarcaId(null)
    }
  }

  // --- Manejo de productos manuales ---
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formManual.nombre.trim()) return

    const newItem: ManualItem = {
      id: `manual_${Date.now()}`,
      nombre: formManual.nombre.trim(),
      marca: formManual.marca.trim(),
      proveedor: formManual.proveedor.trim(),
      cantidad: Number(formManual.cantidad) || 1,
      precio_compra: Number(formManual.precio_compra) || 0,
      unidad: formManual.unidad
    }

    setManualItems(prev => [...prev, newItem])
    setSelectedManualIds(prev => [...prev, newItem.id]) // Auto-seleccionar para el pedido
    
    // Reset form
    setFormManual({
      nombre: '',
      marca: '',
      proveedor: '',
      cantidad: 1,
      precio_compra: 0,
      unidad: 'unidad'
    })
    setMostrarFormManual(false)
  }

  const handleRemoveManualItem = (id: string) => {
    setManualItems(prev => prev.filter(m => m.id !== id))
    setSelectedManualIds(prev => prev.filter(mid => mid !== id))
  }

  // --- Toggle de selección ---
  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleToggleSelectManual = (id: string) => {
    setSelectedManualIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllFiltered = () => {
    const filteredIds = productosFiltrados.map(p => p.id)
    const allSelected = filteredIds.every(id => selectedProductIds.includes(id))
    
    if (allSelected) {
      // Deseleccionar los filtrados
      setSelectedProductIds(prev => prev.filter(id => !filteredIds.includes(id)))
    } else {
      // Seleccionar los filtrados sin duplicar
      setSelectedProductIds(prev => Array.from(new Set([...prev, ...filteredIds])))
    }
  }

  // --- Agrupación final por Proveedor ---
  const orderGroups = useMemo(() => {
    const groups: Record<string, { catalog: { product: Producto; cantidad: number; costo: number }[]; manual: ManualItem[] }> = {}

    // Agregar productos de catálogo seleccionados
    selectedProductIds.forEach(id => {
      const prod = productos.find(p => p.id === id)
      if (!prod) return
      
      const provName = prod.proveedor?.trim() || 'Sin proveedor asignado'
      if (!groups[provName]) {
        groups[provName] = { catalog: [], manual: [] }
      }
      
      const cantidad = orderQuantities[prod.id] !== undefined ? orderQuantities[prod.id] : getCantidadRecomendada(prod)
      const costo = orderCosts[prod.id] !== undefined ? orderCosts[prod.id] : getCostoDefecto(prod)
      
      groups[provName].catalog.push({ product: prod, cantidad, costo })
    })

    // Agregar productos manuales seleccionados
    selectedManualIds.forEach(id => {
      const item = manualItems.find(m => m.id === id)
      if (!item) return
      
      const provName = item.proveedor?.trim() || 'Sin proveedor asignado'
      if (!groups[provName]) {
        groups[provName] = { catalog: [], manual: [] }
      }
      
      groups[provName].manual.push(item)
    })

    return groups
  }, [selectedProductIds, selectedManualIds, productos, manualItems, orderQuantities, orderCosts])

  // Totales
  const stats = useMemo(() => {
    let totalItems = 0
    let totalCosto = 0

    // Catálogo
    selectedProductIds.forEach(id => {
      const prod = productos.find(p => p.id === id)
      if (!prod) return
      const cantidad = orderQuantities[prod.id] !== undefined ? orderQuantities[prod.id] : getCantidadRecomendada(prod)
      const costo = orderCosts[prod.id] !== undefined ? orderCosts[prod.id] : getCostoDefecto(prod)
      totalItems += cantidad
      totalCosto += cantidad * costo
    })

    // Manuales
    selectedManualIds.forEach(id => {
      const item = manualItems.find(m => m.id === id)
      if (!item) return
      totalItems += item.cantidad
      totalCosto += item.cantidad * item.precio_compra
    })

    return { totalItems, totalCosto }
  }, [selectedProductIds, selectedManualIds, productos, manualItems, orderQuantities, orderCosts])

  // --- Herramientas de salida ---
  const copyWhatsAppMessage = (proveedor: string) => {
    const group = orderGroups[proveedor]
    if (!group) return

    let text = `📦 *Solicitud de Reabastecimiento*\n`
    text += `*Proveedor:* ${proveedor}\n`
    text += `*Fecha:* ${new Date().toLocaleDateString()}\n`
    text += `-------------------------------------------\n\n`

    let index = 1
    group.catalog.forEach(item => {
      const marcaStr = item.product.marca ? ` (${item.product.marca})` : ''
      text += `${index++}. ${item.cantidad} ${item.product.unidad}(s) - *${item.product.nombre}*${marcaStr}\n`
    })

    group.manual.forEach(item => {
      const marcaStr = item.marca ? ` (${item.marca})` : ''
      text += `${index++}. ${item.cantidad} ${item.unidad}(s) - *${item.nombre}*${marcaStr} _[Nuevo]_\n`
    })

    text += `\n-------------------------------------------\n`
    text += `Por favor confirmar precios y disponibilidad de stock.`

    navigator.clipboard.writeText(text)
    alert(`Mensaje de WhatsApp para "${proveedor}" copiado al portapapeles.`)
  }

  const exportCsv = (proveedor: string) => {
    const group = orderGroups[proveedor]
    if (!group) return

    let csvContent = "data:text/csv;charset=utf-8,"
    csvContent += "Producto,Marca,Cantidad,Unidad,Costo Unitario,Subtotal,Tipo\n"

    group.catalog.forEach(item => {
      const sub = item.cantidad * item.costo
      csvContent += `"${item.product.nombre}","${item.product.marca || ''}",${item.cantidad},"${item.product.unidad}",${item.costo},${sub},"Catalogo"\n`
    })

    group.manual.forEach(item => {
      const sub = item.cantidad * item.precio_compra
      csvContent += `"${item.nombre}","${item.marca || ''}",${item.cantidad},"${item.unidad}",${item.precio_compra},${sub},"Nuevo"\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Pedido_${proveedor.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Resumen de Pedido y Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 text-white rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute right-3 bottom-3 text-white/[0.03]">
            <ClipboardList className="w-24 h-24" />
          </div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Resumen del Pedido</p>
          <p className="text-3xl font-extrabold tracking-tight mt-1">{stats.totalItems} <span className="text-sm font-normal text-zinc-400">ítems seleccionados</span></p>
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/[0.08] text-xs text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>Selecciona productos abajo para incluirlos en el pedido</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Costo Estimado de Compra</p>
            <p className="text-3xl font-extrabold text-zinc-900 tracking-tight mt-1 tabular-nums">
              {formatPEN(stats.totalCosto)}
            </p>
          </div>
          <p className="text-xs text-zinc-400 mt-2">Basado en el precio de compra a proveedores</p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Proveedores en el Pedido</p>
            <p className="text-3xl font-extrabold text-zinc-900 tracking-tight mt-1">
              {Object.keys(orderGroups).filter(k => k !== 'Sin proveedor asignado').length}
            </p>
          </div>
          <p className="text-xs text-zinc-400 mt-2">Diferentes órdenes de compra agrupadas</p>
        </div>
      </div>

      {/* Controles de Filtro */}
      <div className="flex items-center gap-3 flex-wrap bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, marca o proveedor..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 transition"
          />
        </div>

        {/* Proveedor */}
        <select
          value={proveedorFiltro}
          onChange={(e) => setProveedorFiltro(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950 transition bg-white"
        >
          <option value="todos">Todos los proveedores</option>
          <option value="sin_proveedor">Sin proveedor asignado</option>
          {proveedoresUnicos.map(prov => (
            <option key={prov} value={prov}>{prov}</option>
          ))}
        </select>

        {/* Interruptor Mostrar Todos */}
        <button
          onClick={() => setMostrarTodos(!mostrarTodos)}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${
            mostrarTodos 
              ? 'border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800' 
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {mostrarTodos ? 'Filtrar por Stock Bajo' : 'Ver Todo el Catálogo'}
        </button>

        {/* Botón Agregar Manual */}
        <button
          onClick={() => setMostrarFormManual(!mostrarFormManual)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition shadow-sm ml-auto"
        >
          <Plus className="w-4 h-4" />
          Ítem Fuera de Catálogo
        </button>
      </div>

      {/* Formulario Ítem Manual (Collapsible) */}
      {mostrarFormManual && (
        <form onSubmit={handleAddManualItem} className="bg-violet-50/50 border border-violet-100 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-violet-100 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-bold text-violet-950">Solicitar Producto Fuera de Catálogo</h3>
            </div>
            <button type="button" onClick={() => setMostrarFormManual(false)} className="text-violet-500 hover:text-violet-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-violet-800 mb-1">Nombre del producto *</label>
              <input
                required
                value={formManual.nombre}
                onChange={(e) => setFormManual(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Arena Fina Especial"
                className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-violet-800 mb-1">Marca</label>
              <input
                value={formManual.marca}
                onChange={(e) => setFormManual(p => ({ ...p, marca: e.target.value }))}
                placeholder="Ej: Arequipa"
                className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-violet-800 mb-1">Proveedor sugerido</label>
              <input
                value={formManual.proveedor}
                onChange={(e) => setFormManual(p => ({ ...p, proveedor: e.target.value }))}
                placeholder="Ej: Aceros S.A."
                className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-violet-800 mb-1">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={formManual.cantidad}
                  onChange={(e) => setFormManual(p => ({ ...p, cantidad: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-violet-800 mb-1">Unidad</label>
                <input
                  value={formManual.unidad}
                  onChange={(e) => setFormManual(p => ({ ...p, unidad: e.target.value }))}
                  placeholder="Ej: bolsa"
                  className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-violet-800 mb-1">Costo Unitario (S/)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={formManual.precio_compra}
                onChange={(e) => setFormManual(p => ({ ...p, precio_compra: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMostrarFormManual(false)}
              className="px-4 py-2 border border-violet-200 text-xs font-semibold text-violet-700 rounded-xl hover:bg-violet-100/50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white rounded-xl shadow-sm"
            >
              Agregar a la lista
            </button>
          </div>
        </form>
      )}

      {/* Listas de ítems */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Principal: Tabla de Selección (2/3 de ancho) */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Ítems manuales agregados (si los hay) */}
          {manualItems.length > 0 && (
            <div className="bg-violet-50/20 border border-violet-100 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-violet-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Productos temporales fuera de catálogo ({manualItems.length})
              </h3>
              <div className="space-y-2">
                {manualItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-white border border-violet-100 p-3 rounded-xl shadow-sm">
                    <input
                      type="checkbox"
                      checked={selectedManualIds.includes(item.id)}
                      onChange={() => handleToggleSelectManual(item.id)}
                      className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900">{item.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                        {item.marca && <span>Marca: {item.marca}</span>}
                        {item.marca && item.proveedor && <span>•</span>}
                        {item.proveedor && <span>Prov: {item.proveedor}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-zinc-500">Cant:</span>
                        <input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1
                            setManualItems(prev => prev.map(m => m.id === item.id ? { ...m, cantidad: val } : m))
                          }}
                          className="w-16 ml-1 px-1.5 py-1 text-center border border-zinc-200 rounded-lg font-semibold"
                        />
                      </div>
                      <div>
                        <span className="text-zinc-500">Costo:</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.precio_compra}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setManualItems(prev => prev.map(m => m.id === item.id ? { ...m, precio_compra: val } : m))
                          }}
                          className="w-20 ml-1 px-1.5 py-1 text-right border border-zinc-200 rounded-lg font-semibold"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveManualItem(item.id)}
                        className="p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de Productos Catálogo */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Productos del Catálogo
              </h3>
              <button
                onClick={handleSelectAllFiltered}
                className="text-xs text-zinc-600 hover:text-zinc-950 font-semibold transition"
              >
                {productosFiltrados.every(p => selectedProductIds.includes(p.id)) 
                  ? 'Deseleccionar todos' 
                  : 'Seleccionar todos los filtrados'
                }
              </button>
            </div>
            
            {productosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <Package className="w-10 h-10 mx-auto text-zinc-300 mb-2" />
                <p className="text-sm font-medium">No se encontraron productos</p>
                <p className="text-xs text-zinc-400 mt-1">Prueba cambiando los filtros o agregando ítems manuales</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/30 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider text-left">
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Proveedor</th>
                      <th className="px-4 py-3">Marca</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-center w-24">Cantidad</th>
                      <th className="px-4 py-3 text-right w-28">Costo Est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 text-sm">
                    {productosFiltrados.map(prod => {
                      const isSelected = selectedProductIds.includes(prod.id)
                      const isOutOfStock = prod.stock === 0 && !prod.venta_sin_stock
                      const isLowStock = prod.stock_minimo !== null && prod.stock <= prod.stock_minimo
                      
                      const isSaving = savingId === prod.id
                      const isEditingProveedor = editProveedorId === prod.id
                      const isEditingMarca = editMarcaId === prod.id

                      return (
                        <tr 
                          key={prod.id} 
                          className={`hover:bg-zinc-50/50 transition-colors ${
                            isSelected ? 'bg-zinc-50/30' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectProduct(prod.id)}
                              className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-900 w-4 h-4"
                            />
                          </td>

                          {/* Nombre */}
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-semibold text-zinc-900 leading-tight">{prod.nombre}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-400">
                                <span>{prod.categorias?.nombre || 'Sin categoría'}</span>
                                <span>•</span>
                                <span>por {prod.unidad}</span>
                              </div>
                            </div>
                          </td>

                          {/* Proveedor (Inline Editable) */}
                          <td className="px-4 py-3">
                            {isEditingProveedor ? (
                              <input
                                autoFocus
                                defaultValue={prod.proveedor || ''}
                                onBlur={(e) => handleSaveProductField(prod.id, 'proveedor', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveProductField(prod.id, 'proveedor', (e.target as HTMLInputElement).value)
                                  } else if (e.key === 'Escape') {
                                    setEditProveedorId(null)
                                  }
                                }}
                                className="px-2 py-1 border border-zinc-300 rounded-lg text-xs w-full focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                              />
                            ) : (
                              <div 
                                onClick={() => setEditProveedorId(prod.id)}
                                className={`text-xs px-2 py-1 rounded-lg border border-dashed transition cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 truncate max-w-[120px] ${
                                  prod.proveedor 
                                    ? 'border-zinc-200 text-zinc-700 bg-white' 
                                    : 'border-amber-200 text-amber-700 bg-amber-50/50'
                                }`}
                                title="Click para editar"
                              >
                                {isSaving && savingId === prod.id ? (
                                  <span className="flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Guardando...
                                  </span>
                                ) : (
                                  prod.proveedor || '+ Asignar'
                                )}
                              </div>
                            )}
                          </td>

                          {/* Marca (Inline Editable) */}
                          <td className="px-4 py-3">
                            {isEditingMarca ? (
                              <input
                                autoFocus
                                defaultValue={prod.marca || ''}
                                onBlur={(e) => handleSaveProductField(prod.id, 'marca', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveProductField(prod.id, 'marca', (e.target as HTMLInputElement).value)
                                  } else if (e.key === 'Escape') {
                                    setEditMarcaId(null)
                                  }
                                }}
                                className="px-2 py-1 border border-zinc-300 rounded-lg text-xs w-full focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                              />
                            ) : (
                              <div 
                                onClick={() => setEditMarcaId(prod.id)}
                                className="text-xs px-2 py-1 rounded-lg border border-dashed border-zinc-200 text-zinc-600 bg-white transition cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 truncate max-w-[90px]"
                                title="Click para editar"
                              >
                                {isSaving && savingId === prod.id ? (
                                  '...'
                                ) : (
                                  prod.marca || '+ Asignar'
                                )}
                              </div>
                            )}
                          </td>

                          {/* Stock e Indicador Alerta */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-semibold ${
                                isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-600' : 'text-zinc-600'
                              }`}>
                                {prod.stock}
                              </span>
                              {prod.stock_minimo !== null && (
                                <span className="text-[9px] text-zinc-400 font-normal">
                                  mín. {prod.stock_minimo}
                                </span>
                              )}
                              {isOutOfStock && (
                                <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5 mt-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> Agotado
                                </span>
                              )}
                              {!isOutOfStock && isLowStock && (
                                <span className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5 mt-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> Stock bajo
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Cantidad a Pedir */}
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={1}
                              disabled={!isSelected}
                              value={orderQuantities[prod.id] !== undefined ? orderQuantities[prod.id] : getCantidadRecomendada(prod)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1
                                setOrderQuantities(prev => ({ ...prev, [prod.id]: val }))
                              }}
                              className={`w-16 px-2 py-1 text-center border rounded-lg text-xs font-semibold ${
                                isSelected 
                                  ? 'border-zinc-300 text-zinc-950 font-bold focus:ring-1 focus:ring-zinc-900 bg-white' 
                                  : 'border-zinc-100 text-zinc-300 bg-zinc-50'
                              }`}
                            />
                          </td>

                          {/* Costo Unitario */}
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-block w-24">
                              <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${
                                isSelected ? 'text-zinc-400' : 'text-zinc-300'
                              }`}>S/</span>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                disabled={!isSelected}
                                value={orderCosts[prod.id] !== undefined ? orderCosts[prod.id] : getCostoDefecto(prod)}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setOrderCosts(prev => ({ ...prev, [prod.id]: val }))
                                }}
                                className={`w-full pl-6 pr-1.5 py-1 text-right border rounded-lg text-xs font-semibold ${
                                  isSelected 
                                    ? 'border-zinc-300 text-zinc-950 focus:ring-1 focus:ring-zinc-900 bg-white' 
                                    : 'border-zinc-100 text-zinc-300 bg-zinc-50'
                                }`}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Panel de Órdenes Agrupadas (1/3 de ancho) */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-zinc-500" />
                Órdenes de Compra
              </h3>
              <Badge variant="blue">{Object.keys(orderGroups).length}</Badge>
            </div>

            {Object.keys(orderGroups).length === 0 ? (
              <div className="text-center py-12 text-zinc-400">
                <ClipboardList className="w-10 h-10 mx-auto text-zinc-200 mb-2" />
                <p className="text-xs font-semibold">No hay ítems seleccionados</p>
                <p className="text-[10px] text-zinc-400 mt-1">Selecciona productos a la izquierda para armar la orden</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {Object.entries(orderGroups).map(([proveedor, items]) => {
                  const totalItemsGroup = items.catalog.reduce((s, c) => s + c.cantidad, 0) + items.manual.reduce((s, m) => s + m.cantidad, 0)
                  const totalCostoGroup = items.catalog.reduce((s, c) => s + (c.cantidad * c.costo), 0) + items.manual.reduce((s, m) => s + (m.cantidad * m.precio_compra), 0)

                  return (
                    <div key={proveedor} className="border border-zinc-100 rounded-xl p-4 bg-zinc-50/50 space-y-3">
                      {/* Header Proveedor */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-zinc-900 text-sm leading-tight">{proveedor}</h4>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{totalItemsGroup} producto(s) en total</p>
                        </div>
                        <span className="text-xs font-black text-zinc-900 tabular-nums">
                          {formatPEN(totalCostoGroup)}
                        </span>
                      </div>

                      {/* Lista de ítems en miniatura */}
                      <div className="space-y-1 bg-white border border-zinc-100 rounded-lg p-2 max-h-[140px] overflow-y-auto">
                        {items.catalog.map(item => (
                          <div key={item.product.id} className="flex justify-between items-center text-xs py-0.5 border-b border-zinc-50 last:border-0 gap-2">
                            <span className="text-zinc-600 truncate flex-1 font-medium">{item.product.nombre}</span>
                            <span className="text-[10px] font-bold text-zinc-900 shrink-0 bg-zinc-100 px-1 rounded">{item.cantidad}u</span>
                          </div>
                        ))}
                        {items.manual.map(item => (
                          <div key={item.id} className="flex justify-between items-center text-xs py-0.5 border-b border-zinc-50 last:border-0 gap-2">
                            <span className="text-violet-600 truncate flex-1 font-medium">{item.nombre} <span className="text-[9px] bg-violet-100 px-1 rounded-full">N</span></span>
                            <span className="text-[10px] font-bold text-violet-900 shrink-0 bg-violet-100 px-1 rounded">{item.cantidad}u</span>
                          </div>
                        ))}
                      </div>

                      {/* Botones de acción por proveedor */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          onClick={() => copyWhatsAppMessage(proveedor)}
                          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition"
                          title="Copiar lista de productos para enviar por WhatsApp"
                        >
                          <Send className="w-3.5 h-3.5" />
                          WhatsApp
                        </button>
                        <button
                          onClick={() => exportCsv(proveedor)}
                          className="flex items-center justify-center p-2 text-zinc-600 hover:bg-white hover:text-zinc-900 border border-zinc-200 rounded-lg transition bg-zinc-50"
                          title="Exportar CSV Excel"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
