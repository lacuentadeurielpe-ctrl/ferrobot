'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatPEN, formatFecha, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import { ChevronDown, Package, Loader2, Search, X, FileText, Send, ExternalLink, Plus, Bell } from 'lucide-react'
import NuevoPedidoModal from './NuevoPedidoModal'
import { createClient } from '@/lib/supabase/client'

interface ItemPedido {
  id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface Pedido {
  id: string
  numero_pedido: string
  estado: string
  modalidad: string
  total: number
  costo_total: number | null
  notas: string | null
  created_at: string
  nombre_cliente: string
  telefono_cliente: string
  clientes: { nombre: string | null; telefono: string } | null
  zonas_delivery: { nombre: string } | null
  items_pedido: ItemPedido[]
}

interface Producto {
  id: string
  nombre: string
  unidad: string
  precio_base: number
  precio_compra: number
  stock: number
}

interface Zona {
  id: string
  nombre: string
  tiempo_estimado_min: number
}

const ESTADOS = ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado']

const RANGOS_FECHA = [
  { label: 'Todos', value: '' },
  { label: 'Hoy', value: 'hoy' },
  { label: 'Esta semana', value: 'semana' },
  { label: 'Este mes', value: 'mes' },
]

function estaEnRango(fecha: string, rango: string): boolean {
  if (!rango) return true
  const d = new Date(fecha)
  const ahora = new Date()
  ahora.setHours(23, 59, 59, 999)
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  if (rango === 'hoy') return d >= inicio && d <= ahora
  if (rango === 'semana') {
    inicio.setDate(inicio.getDate() - inicio.getDay())
    return d >= inicio && d <= ahora
  }
  if (rango === 'mes') {
    inicio.setDate(1)
    return d >= inicio && d <= ahora
  }
  return true
}

export default function OrdersTable({ pedidos: inicial, productos = [], zonas = [], ferreteriaId }: {
  pedidos: Pedido[]
  productos?: Producto[]
  zonas?: Zona[]
  ferreteriaId?: string
}) {
  const router = useRouter()
  const [pedidos, setPedidos] = useState(inicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [nuevoPedidoAlert, setNuevoPedidoAlert] = useState(false)

  // Realtime: notificar cuando llega un pedido nuevo
  useEffect(() => {
    if (!ferreteriaId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`pedidos-${ferreteriaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `ferreteria_id=eq.${ferreteriaId}` },
        () => setNuevoPedidoAlert(true)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [ferreteriaId])

  // Estado de comprobantes por pedido: { pedidoId: { url, cargando, reenviando, error } }
  const [comprobantes, setComprobantes] = useState<Record<string, {
    url: string | null
    cargando: boolean
    reenviando: boolean
    enviado: boolean
    error: string | null
  }>>({})

  function estadoComprobante(pedidoId: string) {
    return comprobantes[pedidoId] ?? { url: null, cargando: false, reenviando: false, enviado: false, error: null }
  }

  function patchComprobante(pedidoId: string, patch: Partial<typeof comprobantes[string]>) {
    setComprobantes((prev) => ({
      ...prev,
      [pedidoId]: { ...estadoComprobante(pedidoId), ...patch },
    }))
  }

  // Viewer local — página HTML que embebe el PDF, funciona en cualquier browser
  function viewerUrl(pedidoId: string) {
    return `/api/orders/${pedidoId}/comprobante/view`
  }

  async function verComprobante(pedidoId: string) {
    const estado = estadoComprobante(pedidoId)
    // Si ya confirmamos que existe, abrir proxy directamente
    if (estado.url) { window.open(viewerUrl(pedidoId), '_blank'); return }

    patchComprobante(pedidoId, { cargando: true, error: null })
    try {
      const res = await fetch(`/api/orders/${pedidoId}/comprobante`)
      if (res.ok) {
        const data = await res.json()
        patchComprobante(pedidoId, { url: data.pdf_url, cargando: false })
        window.open(viewerUrl(pedidoId), '_blank')
      } else if (res.status === 404) {
        // No existe — generarlo ahora
        const gen = await fetch(`/api/orders/${pedidoId}/comprobante`, { method: 'POST' })
        if (gen.ok) {
          const data = await gen.json()
          patchComprobante(pedidoId, { url: data.pdf_url, cargando: false })
          window.open(viewerUrl(pedidoId), '_blank')
        } else {
          throw new Error((await gen.json()).error ?? 'Error al generar')
        }
      } else {
        throw new Error((await res.json()).error ?? 'Error')
      }
    } catch (e) {
      patchComprobante(pedidoId, { cargando: false, error: e instanceof Error ? e.message : 'Error' })
    }
  }

  async function reenviarComprobante(pedidoId: string) {
    patchComprobante(pedidoId, { reenviando: true, enviado: false, error: null })
    try {
      const res = await fetch(`/api/orders/${pedidoId}/comprobante/reenviar`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al reenviar')
      const data = await res.json()
      patchComprobante(pedidoId, { url: data.pdf_url, reenviando: false, enviado: true })
      setTimeout(() => patchComprobante(pedidoId, { enviado: false }), 3000)
    } catch (e) {
      patchComprobante(pedidoId, { reenviando: false, error: e instanceof Error ? e.message : 'Error' })
    }
  }

  const ESTADOS_CON_COMPROBANTE = new Set(['confirmado', 'en_preparacion', 'enviado', 'entregado'])

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return pedidos.filter((p) => {
      const nombreCliente = p.clientes?.nombre ?? p.nombre_cliente ?? ''
      const telefono = p.clientes?.telefono ?? p.telefono_cliente ?? ''

      const matchBusqueda = !q ||
        nombreCliente.toLowerCase().includes(q) ||
        telefono.includes(q) ||
        p.numero_pedido.toLowerCase().includes(q)

      const matchEstado = !filtroEstado || p.estado === filtroEstado
      const matchFecha = estaEnRango(p.created_at, filtroFecha)

      return matchBusqueda && matchEstado && matchFecha
    })
  }, [pedidos, busqueda, filtroEstado, filtroFecha])

  const hayFiltros = busqueda || filtroEstado || filtroFecha

  async function cambiarEstado(pedidoId: string, nuevoEstado: string) {
    setActualizando(pedidoId)
    try {
      const res = await fetch(`/api/orders/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) throw new Error('Error')
      const actualizado = await res.json()
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, estado: actualizado.estado } : p))
      )
      router.refresh()
    } catch {
      alert('Error al actualizar el estado')
    } finally {
      setActualizando(null)
    }
  }

  return (
    <div>
      {/* Alerta de nuevo pedido (Realtime) */}
      {nuevoPedidoAlert && (
        <div className="mb-4 flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 animate-pulse-once">
          <span className="flex items-center gap-2 text-sm font-medium text-orange-800">
            <Bell className="w-4 h-4" />
            ¡Llegó un nuevo pedido!
          </span>
          <button
            onClick={() => { router.refresh(); setNuevoPedidoAlert(false) }}
            className="text-xs font-semibold text-orange-600 hover:text-orange-800 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition"
          >
            Ver ahora
          </button>
        </div>
      )}

      {/* Botón nuevo pedido */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo pedido
        </button>
      </div>

      {/* Barra de búsqueda + filtro de fecha */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, teléfono o N° pedido…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 transition"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro fecha */}
        <div className="flex gap-1">
          {RANGOS_FECHA.map(({ label, value }) => (
            <button key={value} onClick={() => setFiltroFecha(value)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium transition',
                filtroFecha === value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros por estado */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={cn('px-3 py-1 rounded-full text-xs font-medium transition',
            !filtroEstado ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map((e) => {
          const count = pedidos.filter((p) => p.estado === e).length
          if (!count) return null
          return (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition',
                filtroEstado === e ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {labelEstadoPedido(e)} ({count})
            </button>
          )
        })}
        {hayFiltros && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroFecha('') }}
            className="ml-auto text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1">
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Resultados */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {hayFiltros ? 'No hay pedidos con estos filtros' : 'No hay pedidos aún'}
          </p>
          {hayFiltros && (
            <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroFecha('') }}
              className="mt-2 text-xs text-orange-500 hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((pedido) => {
            const isOpen = expandido === pedido.id
            const nombreCliente = pedido.clientes?.nombre ?? pedido.nombre_cliente ?? 'Cliente'

            return (
              <div key={pedido.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandido(isOpen ? null : pedido.id)}
                >
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform shrink-0', isOpen && 'rotate-180')} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{nombreCliente}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">{pedido.numero_pedido}</span>
                      {' · '}{formatFecha(pedido.created_at)}
                      {' · '}{pedido.modalidad === 'delivery' ? '🚚 Delivery' : '🏪 Recojo'}
                      {pedido.zonas_delivery && ` — ${pedido.zonas_delivery.nombre}`}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-gray-900 shrink-0">
                    {formatPEN(pedido.total)}
                  </p>

                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {actualizando === pedido.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <select
                        value={pedido.estado}
                        onChange={(e) => cambiarEstado(pedido.id, e.target.value)}
                        className={cn(
                          'text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-300',
                          colorEstadoPedido(pedido.estado)
                        )}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>{labelEstadoPedido(e)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-200">
                          <th className="text-left pb-1.5 font-medium">Producto</th>
                          <th className="text-right pb-1.5 font-medium">Cant.</th>
                          <th className="text-right pb-1.5 font-medium">P. Unit.</th>
                          <th className="text-right pb-1.5 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pedido.items_pedido.map((item) => (
                          <tr key={item.id}>
                            <td className="py-1.5 text-gray-800">{item.nombre_producto}</td>
                            <td className="py-1.5 text-right text-gray-600">{item.cantidad}</td>
                            <td className="py-1.5 text-right text-gray-600">{formatPEN(item.precio_unitario)}</td>
                            <td className="py-1.5 text-right font-medium text-gray-800">{formatPEN(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200">
                          <td colSpan={3} className="pt-2 text-right font-semibold text-gray-700">Total</td>
                          <td className="pt-2 text-right font-bold text-gray-900">{formatPEN(pedido.total)}</td>
                        </tr>
                        {pedido.costo_total != null && pedido.costo_total > 0 && (() => {
                          const ganancia = pedido.total - pedido.costo_total
                          const margen = pedido.total > 0 ? (ganancia / pedido.total) * 100 : 0
                          const positivo = ganancia >= 0
                          return (
                            <tr>
                              <td colSpan={3} className="pt-1 text-right text-xs text-gray-400">Ganancia</td>
                              <td className={cn('pt-1 text-right text-xs font-semibold', positivo ? 'text-green-600' : 'text-red-500')}>
                                {positivo ? '+' : ''}{formatPEN(ganancia)}
                                <span className="ml-1 font-normal opacity-70">({margen.toFixed(0)}%)</span>
                              </td>
                            </tr>
                          )
                        })()}
                      </tfoot>
                    </table>
                    {pedido.notas && (
                      <p className="text-xs text-gray-500 mb-3">
                        <span className="font-medium">Notas:</span> {pedido.notas}
                      </p>
                    )}

                    {/* Botones de comprobante */}
                    {ESTADOS_CON_COMPROBANTE.has(pedido.estado) && (() => {
                      const cp = estadoComprobante(pedido.id)
                      return (
                        <div className="border-t border-gray-200 pt-3 flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => verComprobante(pedido.id)}
                            disabled={cp.cargando}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition disabled:opacity-50"
                          >
                            {cp.cargando
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <FileText className="w-3.5 h-3.5" />
                            }
                            {cp.cargando ? 'Generando…' : 'Ver comprobante'}
                            {!cp.cargando && <ExternalLink className="w-3 h-3 opacity-60" />}
                          </button>

                          <button
                            onClick={() => reenviarComprobante(pedido.id)}
                            disabled={cp.reenviando}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition disabled:opacity-50"
                          >
                            {cp.reenviando
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : cp.enviado
                              ? <span className="text-green-600 flex items-center gap-1">✓ Enviado</span>
                              : <><Send className="w-3.5 h-3.5" /> Reenviar al cliente</>
                            }
                          </button>

                          {cp.error && (
                            <span className="text-xs text-red-500">{cp.error}</span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}

          {/* Contador de resultados filtrados */}
          {hayFiltros && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Mostrando {filtrados.length} de {pedidos.length} pedidos
            </p>
          )}
        </div>
      )}

      {/* Modal nuevo pedido */}
      {modalNuevo && (
        <NuevoPedidoModal
          productos={productos}
          zonas={zonas}
          onClose={() => setModalNuevo(false)}
        />
      )}
    </div>
  )
}
