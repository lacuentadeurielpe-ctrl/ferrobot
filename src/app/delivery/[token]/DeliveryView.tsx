'use client'

import { useState } from 'react'
import {
  MapPin, Phone, Package, ChevronDown, CheckCircle, AlertTriangle,
  Loader2, DollarSign, RotateCcw, Siren, X, Inbox, BarChart2,
} from 'lucide-react'
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

interface CobroHoy {
  id: string
  numero_pedido: string
  total: number
  cobrado_monto: number | null
  cobrado_metodo: string | null
  clientes: { nombre: string | null } | null
  created_at: string
}

const INCIDENCIAS = [
  { value: 'cliente_ausente', label: 'Cliente no estaba' },
  { value: 'pedido_incorrecto', label: 'Pedido incorrecto' },
  { value: 'pago_rechazado', label: 'No pudo pagar' },
  { value: 'otro', label: 'Otro problema' },
]

type ModalTipo = 'entregado' | 'incidencia' | 'retorno' | 'emergencia'
type Tab = 'mis_pedidos' | 'disponibles' | 'rendicion'

export default function DeliveryView({
  pedidos: inicialAsignados,
  pedidosDisponibles: inicialDisponibles,
  cobrosHoy: inicialCobros,
  token,
  modo,
}: {
  pedidos: PedidoDelivery[]
  pedidosDisponibles: PedidoDelivery[]
  cobrosHoy: CobroHoy[]
  token: string
  modo: 'manual' | 'libre'
}) {
  const [pedidos, setPedidos] = useState(inicialAsignados)
  const [disponibles, setDisponibles] = useState(inicialDisponibles)
  const [cobrosHoy, setCobrosHoy] = useState(inicialCobros)

  const [tab, setTab] = useState<Tab>('mis_pedidos')
  const [expandido, setExpandido] = useState<string | null>(inicialAsignados[0]?.id ?? null)
  const [modal, setModal] = useState<{ pedidoId: string; tipo: ModalTipo } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aceptando, setAceptando] = useState<string | null>(null)

  // Campos del modal
  const [cobradoMonto, setCobradoMonto] = useState('')
  const [cobradoMetodo, setCobradoMetodo] = useState<'efectivo' | 'yape' | 'transferencia' | ''>('')
  const [incTipo, setIncTipo] = useState('')
  const [incDesc, setIncDesc] = useState('')
  const [emergMsg, setEmergMsg] = useState('')

  function abrirModal(pedidoId: string, tipo: ModalTipo) {
    setCobradoMonto('')
    setCobradoMetodo('')
    setIncTipo('')
    setIncDesc('')
    setEmergMsg('')
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
      } else if (modal.tipo === 'incidencia') {
        body.incidencia_tipo = incTipo || 'otro'
        body.incidencia_desc = incDesc || null
      } else if (modal.tipo === 'retorno') {
        body.incidencia_tipo = incTipo || 'otro'
        body.incidencia_desc = incDesc || 'Pedido retornado a tienda'
      } else if (modal.tipo === 'emergencia') {
        body.mensaje_emergencia = emergMsg || null
      }

      const res = await fetch(`/api/delivery/${token}/pedido/${modal.pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Error al registrar')
      const data = await res.json()

      if (modal.tipo === 'entregado') {
        const pedido = pedidos.find(p => p.id === modal.pedidoId)
        // Mover a cobros del día
        if (pedido) {
          setCobrosHoy(prev => [{
            id: pedido.id,
            numero_pedido: pedido.numero_pedido,
            total: pedido.total,
            cobrado_monto: cobradoMonto ? parseFloat(cobradoMonto) : null,
            cobrado_metodo: cobradoMetodo || null,
            clientes: pedido.clientes,
            created_at: pedido.created_at,
          }, ...prev])
        }
        setPedidos((prev) => prev.filter((p) => p.id !== modal.pedidoId))
      } else if (modal.tipo === 'retorno') {
        // Sacar de mi lista (ya no está asignado)
        setPedidos((prev) => prev.filter((p) => p.id !== modal.pedidoId))
      } else if (modal.tipo === 'incidencia') {
        setPedidos((prev) => prev.map((p) =>
          p.id === modal.pedidoId
            ? { ...p, incidencia_tipo: incTipo || 'otro', incidencia_desc: incDesc || null }
            : p
        ))
      }
      // emergencia: nada cambia en la UI
      setModal(null)
    } catch {
      alert('Error al registrar. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function aceptarPedido(pedidoId: string) {
    setAceptando(pedidoId)
    try {
      const res = await fetch(`/api/delivery/${token}/aceptar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido_id: pedidoId }),
      })
      if (res.status === 409) {
        alert('Este pedido ya fue tomado por otro repartidor.')
        setDisponibles(prev => prev.filter(p => p.id !== pedidoId))
        return
      }
      if (!res.ok) throw new Error('Error al aceptar')
      const pedidoAceptado = await res.json()
      // Mover de disponibles → mis pedidos
      const pedidoCompleto = disponibles.find(p => p.id === pedidoId)
      if (pedidoCompleto) {
        setPedidos(prev => [...prev, pedidoCompleto])
        setDisponibles(prev => prev.filter(p => p.id !== pedidoId))
        setTab('mis_pedidos')
        setExpandido(pedidoId)
      }
    } catch {
      alert('Error al aceptar el pedido.')
    } finally {
      setAceptando(null)
    }
  }

  // ── Render de una tarjeta de pedido ─────────────────────────────────────────

  function TarjetaPedido({ pedido, idx, showAcciones }: {
    pedido: PedidoDelivery
    idx: number
    showAcciones: boolean
  }) {
    const isOpen = expandido === pedido.id
    const nombre = pedido.clientes?.nombre ?? pedido.nombre_cliente ?? 'Cliente'
    const telefono = pedido.clientes?.telefono ?? pedido.telefono_cliente ?? null
    const tieneIncidencia = !!pedido.incidencia_tipo

    return (
      <div className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden',
        tieneIncidencia ? 'border-amber-300' : 'border-gray-200'
      )}>
        <div className="px-4 py-3.5 cursor-pointer" onClick={() => setExpandido(isOpen ? null : pedido.id)}>
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

        {isOpen && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
            {telefono && (
              <a href={`tel:${telefono}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Phone className="w-4 h-4" />
                {telefono}
              </a>
            )}
            {pedido.zonas_delivery && (
              <p className="text-xs text-gray-500"><span className="font-medium">Zona:</span> {pedido.zonas_delivery.nombre}</p>
            )}
            {pedido.notas && (
              <p className="text-xs text-gray-500"><span className="font-medium">Notas:</span> {pedido.notas}</p>
            )}

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

            {showAcciones && (
              <div className="space-y-2 pt-1">
                {/* Botones principales */}
                <div className="flex gap-2">
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
                {/* Botones secundarios */}
                <div className="flex gap-2">
                  <button
                    onClick={() => abrirModal(pedido.id, 'retorno')}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 rounded-xl text-xs transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retornar
                  </button>
                  <button
                    onClick={() => abrirModal(pedido.id, 'emergencia')}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium py-2 rounded-xl text-xs transition"
                  >
                    <Siren className="w-3.5 h-3.5" />
                    Emergencia
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'mis_pedidos', label: 'Mis pedidos', count: pedidos.length },
    ...(modo === 'libre' ? [{ id: 'disponibles' as Tab, label: 'Disponibles', count: disponibles.length }] : []),
    { id: 'rendicion', label: 'Mi día', count: cobrosHoy.length },
  ]

  const totalCobradoHoy = cobrosHoy.reduce((s, c) => s + (c.cobrado_monto ?? 0), 0)
  const totalEsperadoHoy = cobrosHoy.reduce((s, c) => s + c.total, 0)

  return (
    <>
      {/* Tabs */}
      <div className="flex bg-white rounded-xl border border-gray-200 p-1 mb-4 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 text-xs font-medium rounded-lg transition relative',
              tab === t.id ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn(
                'ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold',
                tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Mis pedidos */}
      {tab === 'mis_pedidos' && (
        <div className="space-y-3">
          {pedidos.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Sin entregas asignadas</p>
              {modo === 'libre' && disponibles.length > 0 && (
                <button
                  onClick={() => setTab('disponibles')}
                  className="mt-3 text-sm text-orange-500 hover:text-orange-600 font-medium"
                >
                  Ver pedidos disponibles →
                </button>
              )}
            </div>
          ) : (
            pedidos.map((p, i) => (
              <TarjetaPedido key={p.id} pedido={p} idx={i} showAcciones />
            ))
          )}
        </div>
      )}

      {/* Tab: Disponibles (modo libre) */}
      {tab === 'disponibles' && (
        <div className="space-y-3">
          {disponibles.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No hay pedidos disponibles</p>
              <p className="text-sm text-gray-300 mt-1">Regresa en unos momentos</p>
            </div>
          ) : (
            disponibles.map((p, i) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <TarjetaPedido pedido={p} idx={i} showAcciones={false} />
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <button
                    onClick={() => aceptarPedido(p.id)}
                    disabled={aceptando === p.id}
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition"
                  >
                    {aceptando === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Tomar este pedido
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Rendición del día */}
      {tab === 'rendicion' && (
        <div className="space-y-3">
          {/* Resumen */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-semibold text-gray-900">Resumen del día</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Entregas</p>
                <p className="text-2xl font-bold text-gray-900">{cobrosHoy.length}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-600 mb-1">Cobrado</p>
                <p className="text-xl font-bold text-green-700">{formatPEN(totalCobradoHoy)}</p>
              </div>
            </div>
            {totalEsperadoHoy > 0 && totalCobradoHoy !== totalEsperadoHoy && (
              <div className={cn(
                'mt-3 text-xs rounded-lg px-3 py-2 text-center font-medium',
                totalCobradoHoy < totalEsperadoHoy ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
              )}>
                Esperado: {formatPEN(totalEsperadoHoy)} · Diferencia: {totalCobradoHoy >= totalEsperadoHoy ? '+' : ''}{formatPEN(totalCobradoHoy - totalEsperadoHoy)}
              </div>
            )}
          </div>

          {/* Lista de entregas */}
          {cobrosHoy.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">Aún no hay entregas completadas hoy</p>
            </div>
          ) : (
            cobrosHoy.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.clientes?.nombre ?? 'Cliente'}</p>
                  <p className="text-xs text-gray-400 font-mono">{c.numero_pedido}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">
                    {c.cobrado_monto != null ? formatPEN(c.cobrado_monto) : '—'}
                  </p>
                  {c.cobrado_metodo && (
                    <p className="text-xs text-gray-400">{
                      { efectivo: '💵', yape: '📱', transferencia: '🏦' }[c.cobrado_metodo] ?? ''
                    } {c.cobrado_metodo}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal de registro */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl mb-2">

            {/* Header del modal */}
            <div className="flex items-center justify-between mb-4">
              {modal.tipo === 'entregado' && <h3 className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500" /> Registrar entrega</h3>}
              {modal.tipo === 'incidencia' && <h3 className="font-bold text-gray-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Reportar problema</h3>}
              {modal.tipo === 'retorno' && <h3 className="font-bold text-gray-900 flex items-center gap-2"><RotateCcw className="w-5 h-5 text-gray-500" /> Retornar pedido</h3>}
              {modal.tipo === 'emergencia' && <h3 className="font-bold text-gray-900 flex items-center gap-2"><Siren className="w-5 h-5 text-red-500" /> Emergencia</h3>}
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            {/* Entregado */}
            {modal.tipo === 'entregado' && (
              <>
                <p className="text-xs text-gray-500 mb-1 font-medium">Monto cobrado (opcional)</p>
                <div className="relative mb-3">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number" step="0.10" min="0"
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
                    { value: 'yape', label: '📱 Yape' },
                    { value: 'transferencia', label: '🏦 Transferencia' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setCobradoMetodo(cobradoMetodo === value ? '' : value as typeof cobradoMetodo)}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-xs font-medium border transition',
                        cobradoMetodo === value
                          ? 'bg-green-50 border-green-400 text-green-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      )}
                    >{label}</button>
                  ))}
                </div>
              </>
            )}

            {/* Incidencia */}
            {modal.tipo === 'incidencia' && (
              <>
                <p className="text-xs text-gray-500 mb-2 font-medium">¿Qué pasó?</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {INCIDENCIAS.map(({ value, label }) => (
                    <button key={value} onClick={() => setIncTipo(value)}
                      className={cn('py-2 px-3 rounded-xl text-xs font-medium border transition text-left',
                        incTipo === value ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                      )}>{label}</button>
                  ))}
                </div>
                <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Detalle adicional (opcional)…" rows={2}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </>
            )}

            {/* Retorno */}
            {modal.tipo === 'retorno' && (
              <>
                <p className="text-sm text-gray-600 mb-3">El pedido vuelve a la tienda. Se desasignará de tu lista y el dueño será notificado.</p>
                <p className="text-xs text-gray-500 mb-2 font-medium">¿Por qué retorna?</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {INCIDENCIAS.map(({ value, label }) => (
                    <button key={value} onClick={() => setIncTipo(value)}
                      className={cn('py-2 px-3 rounded-xl text-xs font-medium border transition text-left',
                        incTipo === value ? 'bg-gray-100 border-gray-400 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                      )}>{label}</button>
                  ))}
                </div>
                <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Detalle adicional (opcional)…" rows={2}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </>
            )}

            {/* Emergencia */}
            {modal.tipo === 'emergencia' && (
              <>
                <p className="text-sm text-gray-600 mb-3">Se enviará un mensaje de emergencia al dueño por WhatsApp.</p>
                <textarea
                  value={emergMsg}
                  onChange={(e) => setEmergMsg(e.target.value)}
                  placeholder="Describe la emergencia…"
                  rows={3}
                  className="w-full text-sm border border-red-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl transition">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={
                  cargando ||
                  (modal.tipo === 'incidencia' && !incTipo) ||
                  (modal.tipo === 'retorno' && !incTipo)
                }
                className={cn(
                  'flex-1 py-2.5 text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50',
                  modal.tipo === 'entregado' ? 'bg-green-500 hover:bg-green-600 text-white' :
                  modal.tipo === 'emergencia' ? 'bg-red-500 hover:bg-red-600 text-white' :
                  modal.tipo === 'retorno' ? 'bg-gray-500 hover:bg-gray-600 text-white' :
                  'bg-amber-500 hover:bg-amber-600 text-white'
                )}
              >
                {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
                {modal.tipo === 'emergencia' ? 'Enviar alerta' : modal.tipo === 'retorno' ? 'Confirmar retorno' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
