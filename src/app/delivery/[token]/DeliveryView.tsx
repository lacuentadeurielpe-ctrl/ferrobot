'use client'

import { useState } from 'react'
import { MapPin, Phone, Package, ChevronDown, CheckCircle, AlertTriangle, Loader2, DollarSign } from 'lucide-react'
import { cn, formatPEN } from '@/lib/utils'

interface ItemPedido {
  id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
}

interface PedidoDelivery {
  id: string
  numero_pedido: string
  nombre_cliente: string
  telefono_cliente: string
  direccion_entrega: string | null
  total: number
  estado: string
  notas: string | null
  cobrado_monto: number | null
  cobrado_metodo: string | null
  incidencia_tipo: string | null
  incidencia_desc: string | null
  created_at: string
  clientes: { nombre: string | null; telefono: string } | null
  zonas_delivery: { nombre: string } | null
  items_pedido: ItemPedido[]
}

const INCIDENCIAS = [
  { value: 'cliente_ausente', label: 'Cliente no estaba' },
  { value: 'pedido_incorrecto', label: 'Pedido incorrecto' },
  { value: 'pago_rechazado', label: 'No pudo pagar' },
  { value: 'otro', label: 'Otro problema' },
]

export default function DeliveryView({
  pedidos: inicial,
  token,
}: {
  pedidos: PedidoDelivery[]
  token: string
}) {
  const [pedidos, setPedidos] = useState(inicial)
  const [expandido, setExpandido] = useState<string | null>(inicial[0]?.id ?? null)
  const [modal, setModal] = useState<{ pedidoId: string; tipo: 'entregado' | 'incidencia' } | null>(null)
  const [cargando, setCargando] = useState(false)

  // Estado del modal de entrega
  const [cobradoMonto, setCobradoMonto] = useState('')
  const [cobradoMetodo, setCobradoMetodo] = useState<'efectivo' | 'transferencia' | ''>('')
  // Estado del modal de incidencia
  const [incTipo, setIncTipo] = useState('')
  const [incDesc, setIncDesc] = useState('')

  function abrirModal(pedidoId: string, tipo: 'entregado' | 'incidencia') {
    setCobradoMonto('')
    setCobradoMetodo('')
    setIncTipo('')
    setIncDesc('')
    setModal({ pedidoId, tipo })
  }

  async function confirmar() {
    if (!modal) return
    setCargando(true)
    try {
      const body: Record<string, unknown> = { accion: modal.tipo }
      if (modal.tipo === 'entregado') {
        body.cobrado_monto = cobradoMonto ? parseFloat(cobradoMonto) : null
        body.cobrado_metodo = cobradoMetodo || null
      } else {
        body.incidencia_tipo = incTipo || 'otro'
        body.incidencia_desc = incDesc || null
      }

      const res = await fetch(`/api/delivery/${token}/pedido/${modal.pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Error al registrar')

      if (modal.tipo === 'entregado') {
        // Quitar de la lista
        setPedidos((prev) => prev.filter((p) => p.id !== modal.pedidoId))
      } else {
        // Marcar con incidencia pero dejar en lista
        setPedidos((prev) => prev.map((p) => p.id === modal.pedidoId
          ? { ...p, incidencia_tipo: incTipo || 'otro', incidencia_desc: incDesc || null }
          : p))
      }
      setModal(null)
    } catch {
      alert('Error al registrar. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {pedidos.map((pedido, idx) => {
          const isOpen = expandido === pedido.id
          const nombre = pedido.clientes?.nombre ?? pedido.nombre_cliente ?? 'Cliente'
          const telefono = pedido.clientes?.telefono ?? pedido.telefono_cliente ?? null
          const tieneIncidencia = !!pedido.incidencia_tipo

          return (
            <div
              key={pedido.id}
              className={cn(
                'bg-white rounded-2xl border shadow-sm overflow-hidden',
                tieneIncidencia ? 'border-amber-300' : 'border-gray-200'
              )}
            >
              {/* Header de la tarjeta */}
              <div
                className="px-4 py-3.5 cursor-pointer"
                onClick={() => setExpandido(isOpen ? null : pedido.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                      tieneIncidencia ? 'bg-amber-100 text-amber-600' : 'bg-orange-100 text-orange-600'
                    )}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{nombre}</p>
                      <p className="text-xs text-gray-400 font-mono">{pedido.numero_pedido}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900 text-sm">{formatPEN(pedido.total)}</p>
                    <ChevronDown className={cn('w-4 h-4 text-gray-400 ml-auto transition-transform', isOpen && 'rotate-180')} />
                  </div>
                </div>

                {/* Dirección siempre visible */}
                {pedido.direccion_entrega && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <p className="text-xs text-gray-600 truncate">{pedido.direccion_entrega}</p>
                  </div>
                )}

                {tieneIncidencia && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Incidencia: {INCIDENCIAS.find(i => i.value === pedido.incidencia_tipo)?.label ?? pedido.incidencia_tipo}</span>
                  </div>
                )}
              </div>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  {/* Teléfono */}
                  {telefono && (
                    <a
                      href={`tel:${telefono}`}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      <Phone className="w-4 h-4" />
                      {telefono}
                    </a>
                  )}

                  {/* Zona */}
                  {pedido.zonas_delivery && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Zona:</span> {pedido.zonas_delivery.nombre}
                    </p>
                  )}

                  {/* Notas */}
                  {pedido.notas && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Notas:</span> {pedido.notas}
                    </p>
                  )}

                  {/* Items */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Productos:</p>
                    <div className="space-y-1">
                      {pedido.items_pedido.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">{item.cantidad}× {item.nombre_producto}</span>
                          <span className="text-gray-500">{formatPEN(item.precio_unitario * item.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm font-semibold">
                      <span className="text-gray-700">Total a cobrar</span>
                      <span className="text-gray-900">{formatPEN(pedido.total)}</span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => abrirModal(pedido.id, 'entregado')}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-xl text-sm transition"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Entregado
                    </button>
                    <button
                      onClick={() => abrirModal(pedido.id, 'incidencia')}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold py-2.5 rounded-xl text-sm transition"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Problema
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de registro */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl mb-2">
            {modal.tipo === 'entregado' ? (
              <>
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Registrar entrega
                </h3>

                <p className="text-xs text-gray-500 mb-1 font-medium">Monto cobrado (opcional)</p>
                <div className="relative mb-3">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={cobradoMonto}
                    onChange={(e) => setCobradoMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <p className="text-xs text-gray-500 mb-2 font-medium">Método de pago</p>
                <div className="flex gap-2 mb-4">
                  {[
                    { value: 'efectivo', label: '💵 Efectivo' },
                    { value: 'transferencia', label: '📱 Transferencia' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setCobradoMetodo(cobradoMetodo === value ? '' : value as 'efectivo' | 'transferencia')}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-sm font-medium border transition',
                        cobradoMetodo === value
                          ? 'bg-green-50 border-green-400 text-green-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Reportar problema
                </h3>

                <p className="text-xs text-gray-500 mb-2 font-medium">¿Qué pasó?</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {INCIDENCIAS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setIncTipo(value)}
                      className={cn(
                        'py-2 px-3 rounded-xl text-xs font-medium border transition text-left',
                        incTipo === value
                          ? 'bg-amber-50 border-amber-400 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Detalle adicional (opcional)…"
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={cargando || (modal.tipo === 'incidencia' && !incTipo)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50',
                  modal.tipo === 'entregado'
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                )}
              >
                {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
