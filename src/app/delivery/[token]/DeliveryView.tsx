'use client'

import { useState } from 'react'
import {
  MapPin, Phone, Package, ChevronDown, CheckCircle, AlertTriangle,
  Loader2, RotateCcw, Siren, X, Inbox, BarChart2,
  FileText, Truck, CreditCard, BadgeCheck, Clock,
} from 'lucide-react'
import PinModal from '@/components/ui/PinModal'
import { cn, formatPEN } from '@/lib/utils'

interface ItemPedido {
  id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
}

interface EntregaInfo {
  id: string
  estado: string
  eta_actual: string | null
  orden_en_ruta: number | null
  vehiculos: { nombre: string; tipo: string } | null
}

interface PedidoDelivery {
  id: string
  numero_pedido: string
  nombre_cliente: string
  telefono_cliente: string
  direccion_entrega: string | null
  total: number
  estado: string
  estado_pago: string
  notas: string | null
  cobrado_monto: number | null
  cobrado_metodo: string | null
  incidencia_tipo: string | null
  incidencia_desc: string | null
  created_at: string
  eta_minutos: number | null
  clientes: { nombre: string | null; telefono: string } | null
  zonas_delivery: { nombre: string } | null
  items_pedido: ItemPedido[]
  entregas: EntregaInfo[] | null
}

interface CobroHoy {
  id: string
  numero_pedido: string
  total: number
  cobrado_monto: number | null
  cobrado_metodo: string | null
  estado_pago: string | null
  clientes: { nombre: string | null } | null
  created_at: string
}

const INCIDENCIAS = [
  { value: 'cliente_ausente',   label: 'Cliente no estaba' },
  { value: 'pedido_incorrecto', label: 'Pedido incorrecto' },
  { value: 'pago_rechazado',    label: 'No pudo pagar' },
  { value: 'otro',              label: 'Otro problema' },
]

const ESTADO_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  confirmado:     { label: 'Confirmado',     icon: '✅', color: 'text-blue-600'   },
  en_preparacion: { label: 'En preparación', icon: '📦', color: 'text-amber-600'  },
  enviado:        { label: 'En camino',       icon: '🚚', color: 'text-orange-600' },
  entregado:      { label: 'Entregado',       icon: '✔️', color: 'text-green-600'  },
}

const PAGO_LABELS: Record<string, { label: string; color: string }> = {
  pendiente:      { label: 'Pago pendiente',      color: 'bg-zinc-100 text-zinc-600'    },
  pagado:         { label: 'Pagado ✓',             color: 'bg-green-100 text-green-700'  },
  credito_activo: { label: 'Deuda activa',         color: 'bg-amber-100 text-amber-700'  },
  verificando:    { label: 'Verificando pago',     color: 'bg-blue-50 text-blue-600'     },
}

type Tab = 'mis_pedidos' | 'disponibles' | 'rendicion'

export default function DeliveryView({
  pedidos: inicialAsignados,
  pedidosDisponibles: inicialDisponibles,
  cobrosHoy: inicialCobros,
  token,
  modo,
  puedeRegistrarDeuda,
  tienePin = false,
}: {
  pedidos: PedidoDelivery[]
  pedidosDisponibles: PedidoDelivery[]
  cobrosHoy: CobroHoy[]
  token: string
  modo: 'manual' | 'libre'
  puedeRegistrarDeuda: boolean
  tienePin?: boolean
}) {
  const [pedidos,    setPedidos]    = useState(inicialAsignados)
  const [disponibles, setDisponibles] = useState(inicialDisponibles)
  const [cobrosHoy,  setCobrosHoy]  = useState(inicialCobros)

  const [tab,       setTab]       = useState<Tab>('mis_pedidos')
  const [expandido, setExpandido] = useState<string | null>(inicialAsignados[0]?.id ?? null)
  const [cargando,  setCargando]  = useState<string | null>(null) // pedidoId en proceso
  const [aceptando, setAceptando] = useState<string | null>(null)

  // Estado inline de cobro por pedido (sin modal)
  const [cobros, setCobros] = useState<Record<string, { monto: string; metodo: string }>>({})

  // Modal de incidencia / retorno / emergencia
  const [modal, setModal] = useState<{ pedidoId: string; tipo: 'incidencia' | 'retorno' | 'emergencia' } | null>(null)

  // PIN gate para cobros con deuda
  const [pinPendiente, setPinPendiente] = useState<PedidoDelivery | null>(null)
  const [pinVerificado, setPinVerificado] = useState(false)
  const [incTipo,  setIncTipo]  = useState('')
  const [incDesc,  setIncDesc]  = useState('')
  const [emergMsg, setEmergMsg] = useState('')

  function cobroDeState(pedidoId: string) {
    return cobros[pedidoId] ?? { monto: '', metodo: '' }
  }
  function updateCobro(pedidoId: string, patch: Partial<{ monto: string; metodo: string }>) {
    setCobros(prev => ({ ...prev, [pedidoId]: { ...cobroDeState(pedidoId), ...patch } }))
  }

  // ── Cambiar estado (enviado) ───────────────────────────────────────────────
  async function cambiarEstado(pedidoId: string, nuevoEstado: string) {
    setCargando(pedidoId)
    try {
      const res = await fetch(`/api/delivery/${token}/pedido/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cambiar_estado', nuevo_estado: nuevoEstado }),
      })
      if (!res.ok) throw new Error('Error')
      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado } : p))
    } catch {
      alert('Error al cambiar estado. Intenta de nuevo.')
    } finally {
      setCargando(null)
    }
  }

  // ── Confirmar entrega ─────────────────────────────────────────────────────
  async function confirmarEntrega(pedido: PedidoDelivery, pinYaVerificado = false) {
    const { monto, metodo } = cobroDeState(pedido.id)
    const montoNum = parseFloat(monto) || 0
    const esDeuda  = montoNum > 0 && montoNum < pedido.total

    // Validar pago parcial sin permiso
    if (esDeuda && !puedeRegistrarDeuda) {
      alert(`El monto cobrado (${formatPEN(montoNum)}) es menor al total (${formatPEN(pedido.total)}).\n\nNo tienes permiso para registrar deudas. Consulta con el encargado.`)
      return
    }

    // PIN gate: si hay deuda, el repartidor tiene PIN y aún no lo verificó → pedir PIN
    if (esDeuda && tienePin && !pinYaVerificado && !pinVerificado) {
      setPinPendiente(pedido)
      return
    }

    setCargando(pedido.id)
    try {
      const res = await fetch(`/api/delivery/${token}/pedido/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion:         'entregado',
          cobrado_monto:  montoNum > 0 ? montoNum : null,
          cobrado_metodo: metodo || null,
        }),
      })

      if (res.status === 403) {
        const data = await res.json()
        alert(data.error ?? 'Sin permiso para registrar deuda.')
        return
      }
      if (!res.ok) throw new Error('Error')

      const data = await res.json()
      // Mover a cobros del día
      setCobrosHoy(prev => [{
        id:            pedido.id,
        numero_pedido: pedido.numero_pedido,
        total:         pedido.total,
        cobrado_monto: montoNum > 0 ? montoNum : null,
        cobrado_metodo: metodo || null,
        estado_pago:   data.estado_pago ?? null,
        clientes:      pedido.clientes,
        created_at:    pedido.created_at,
      }, ...prev])
      setPedidos(prev => prev.filter(p => p.id !== pedido.id))
    } catch {
      alert('Error al registrar entrega. Intenta de nuevo.')
    } finally {
      setCargando(null)
    }
  }

  // ── Modal incidencia / retorno / emergencia ───────────────────────────────
  function abrirModal(pedidoId: string, tipo: 'incidencia' | 'retorno' | 'emergencia') {
    setIncTipo(''); setIncDesc(''); setEmergMsg('')
    setModal({ pedidoId, tipo })
  }

  async function confirmarModal() {
    if (!modal) return
    setCargando(modal.pedidoId)
    try {
      const body: Record<string, unknown> = { accion: modal.tipo }
      if (modal.tipo === 'incidencia') {
        body.incidencia_tipo = incTipo || 'otro'
        body.incidencia_desc = incDesc || null
      } else if (modal.tipo === 'retorno') {
        body.incidencia_tipo = incTipo || 'otro'
        body.incidencia_desc = incDesc || 'Pedido retornado'
      } else if (modal.tipo === 'emergencia') {
        body.mensaje_emergencia = emergMsg || null
      }

      const res = await fetch(`/api/delivery/${token}/pedido/${modal.pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Error')

      if (modal.tipo === 'retorno') {
        setPedidos(prev => prev.filter(p => p.id !== modal.pedidoId))
      } else if (modal.tipo === 'incidencia') {
        setPedidos(prev => prev.map(p =>
          p.id === modal.pedidoId
            ? { ...p, incidencia_tipo: incTipo || 'otro', incidencia_desc: incDesc || null }
            : p
        ))
      }
      setModal(null)
    } catch {
      alert('Error. Intenta de nuevo.')
    } finally {
      setCargando(null)
    }
  }

  // ── Aceptar pedido (modo libre) ───────────────────────────────────────────
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
      if (!res.ok) throw new Error('Error')
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

  // ── Tarjeta de pedido ─────────────────────────────────────────────────────
  function TarjetaPedido({ pedido, idx, showAcciones, totalPedidos }: {
    pedido: PedidoDelivery
    idx: number
    showAcciones: boolean
    totalPedidos?: number
  }) {
    const isOpen       = expandido === pedido.id
    const nombre       = pedido.clientes?.nombre ?? pedido.nombre_cliente ?? 'Cliente'
    const telefono     = pedido.clientes?.telefono ?? pedido.telefono_cliente ?? null
    const tieneInc     = !!pedido.incidencia_tipo
    const yaPagado     = pedido.estado_pago === 'pagado'
    const estadoInfo   = ESTADO_LABELS[pedido.estado] ?? { label: pedido.estado, icon: '•', color: 'text-zinc-500' }
    const pagoInfo     = PAGO_LABELS[pedido.estado_pago] ?? PAGO_LABELS['pendiente']
    const { monto, metodo } = cobroDeState(pedido.id)
    const montoNum     = parseFloat(monto) || 0
    const esParcial    = montoNum > 0 && montoNum < pedido.total
    const enProceso    = cargando === pedido.id
    // Número de parada: priorizar orden_en_ruta de la entrega, si no usar idx+1
    const entrega      = pedido.entregas?.[0]
    const numParada    = entrega?.orden_en_ruta ?? (idx + 1)

    return (
      <div className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden',
        tieneInc ? 'border-amber-300' : 'border-zinc-200'
      )}>
        {/* Cabecera siempre visible */}
        <div className="px-4 py-3.5 cursor-pointer" onClick={() => setExpandido(isOpen ? null : pedido.id)}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                tieneInc ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-600'
              )}>
                {numParada}
              </div>
              <div>
                <p className="font-semibold text-zinc-900 text-sm">{nombre}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-zinc-400 font-mono">{pedido.numero_pedido}</p>
                  {totalPedidos && totalPedidos > 1 && (
                    <span className="text-[10px] text-zinc-400">
                      · parada {numParada}/{totalPedidos}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <p className="font-bold text-zinc-900 text-sm">{formatPEN(pedido.total)}</p>
              <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
            </div>
          </div>

          {pedido.direccion_entrega && (
            <div className="flex items-center gap-1.5 mt-2">
              <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <p className="text-xs text-zinc-600 truncate">{pedido.direccion_entrega}</p>
            </div>
          )}

          {/* Badges de estado */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100', estadoInfo.color)}>
              {estadoInfo.icon} {estadoInfo.label}
            </span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', pagoInfo.color)}>
              {pagoInfo.label}
            </span>
          </div>

          {/* ETA y vehículo asignado */}
          {(() => {
            const entrega = pedido.entregas?.[0]
            const vehiculo = entrega?.vehiculos
            const etaMin = pedido.eta_minutos
            if (!etaMin && !vehiculo) return null
            return (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {etaMin != null && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    {etaMin < 60
                      ? `~${etaMin} min`
                      : `~${Math.floor(etaMin / 60)}h${etaMin % 60 > 0 ? ` ${etaMin % 60}min` : ''}`
                    }
                  </span>
                )}
                {vehiculo && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                    <Truck className="w-2.5 h-2.5" />
                    {vehiculo.nombre}
                  </span>
                )}
              </div>
            )
          })()}

          {tieneInc && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Incidencia: {INCIDENCIAS.find(i => i.value === pedido.incidencia_tipo)?.label ?? pedido.incidencia_tipo}</span>
            </div>
          )}
        </div>

        {/* Cuerpo expandido */}
        {isOpen && (
          <div className="border-t border-zinc-100 px-4 py-4 bg-zinc-50 space-y-4">
            {/* Teléfono y zona */}
            {telefono && (
              <a href={`tel:${telefono}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Phone className="w-4 h-4" />
                {telefono}
              </a>
            )}
            {pedido.zonas_delivery && (
              <p className="text-xs text-zinc-500"><span className="font-medium">Zona:</span> {pedido.zonas_delivery.nombre}</p>
            )}
            {pedido.notas && (
              <p className="text-xs text-zinc-500"><span className="font-medium">Notas:</span> {pedido.notas}</p>
            )}

            {/* Productos */}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5">Productos</p>
              <div className="space-y-1">
                {pedido.items_pedido.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700">{item.cantidad}× {item.nombre_producto}</span>
                    <span className="text-zinc-500">{formatPEN(item.precio_unitario * item.cantidad)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-200 mt-2 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-zinc-700">Total</span>
                <span className="text-zinc-900">{formatPEN(pedido.total)}</span>
              </div>
            </div>

            {showAcciones && (
              <>
                {/* ── Selector de estado ── */}
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2">Estado del envío</p>
                  <div className="flex gap-2">
                    {(['confirmado', 'en_preparacion'] as const).includes(pedido.estado as any) && (
                      <button
                        onClick={() => cambiarEstado(pedido.id, 'enviado')}
                        disabled={enProceso}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Marcar en camino
                      </button>
                    )}
                    {pedido.estado === 'enviado' && (
                      <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-orange-50 border border-orange-200 text-orange-700">
                        🚚 En camino
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Ver comprobante ── */}
                <button
                  onClick={() => window.open(`/api/orders/${pedido.id}/comprobante/view`, '_blank')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition"
                >
                  <FileText className="w-4 h-4" />
                  Ver comprobante
                </button>

                {/* ── Sección de cobro ── */}
                <div className="bg-white rounded-xl border border-zinc-200 p-3.5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-zinc-500" />
                    <p className="text-sm font-semibold text-zinc-800">Cobro</p>
                  </div>

                  {yaPagado ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2.5">
                      <BadgeCheck className="w-4 h-4 shrink-0" />
                      <span>Pago ya confirmado (WhatsApp/digital) — solo confirma la entrega</span>
                    </div>
                  ) : (
                    <>
                      {/* Método de pago */}
                      <div className="flex gap-2">
                        {[
                          { value: 'efectivo',      label: '💵',  name: 'Efectivo' },
                          { value: 'yape',          label: '📱',  name: 'Yape' },
                          { value: 'transferencia', label: '🏦',  name: 'Transfer' },
                        ].map(({ value, label, name }) => (
                          <button
                            key={value}
                            onClick={() => updateCobro(pedido.id, { metodo: metodo === value ? '' : value })}
                            className={cn(
                              'flex-1 py-2 rounded-xl text-xs font-medium border transition flex flex-col items-center gap-0.5',
                              metodo === value
                                ? 'bg-zinc-900 border-zinc-900 text-white'
                                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                            )}
                          >
                            <span className="text-base leading-none">{label}</span>
                            <span>{name}</span>
                          </button>
                        ))}
                      </div>

                      {/* Monto */}
                      <div>
                        <label className="text-xs text-zinc-500 font-medium mb-1 block">
                          Monto cobrado <span className="text-zinc-400">(deja vacío si ya está pagado)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 font-medium">S/</span>
                          <input
                            type="number" step="0.10" min="0"
                            value={monto}
                            onChange={(e) => updateCobro(pedido.id, { monto: e.target.value })}
                            placeholder={pedido.total.toFixed(2)}
                            className="w-full pl-9 pr-3 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                          />
                        </div>
                      </div>

                      {/* Aviso de cobro parcial */}
                      {esParcial && (
                        <div className={cn(
                          'text-xs rounded-xl px-3 py-2',
                          puedeRegistrarDeuda
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        )}>
                          {puedeRegistrarDeuda
                            ? `⚠️ Cobro parcial: S/${montoNum.toFixed(2)} de S/${pedido.total.toFixed(2)} — se registrará deuda de S/${(pedido.total - montoNum).toFixed(2)}`
                            : `❌ Cobro parcial no permitido. Debes cobrar S/${pedido.total.toFixed(2)} completo o consultar con el encargado.`
                          }
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── Botones de acción ── */}
                <div className="space-y-2">
                  <button
                    onClick={() => confirmarEntrega(pedido)}
                    disabled={enProceso || (!yaPagado && esParcial && !puedeRegistrarDeuda)}
                    className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition"
                  >
                    {enProceso ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Confirmar entrega
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => abrirModal(pedido.id, 'incidencia')}
                      disabled={enProceso}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-medium py-2.5 rounded-xl text-xs transition"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Problema
                    </button>
                    <button
                      onClick={() => abrirModal(pedido.id, 'retorno')}
                      disabled={enProceso}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-medium py-2.5 rounded-xl text-xs transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retornar
                    </button>
                    <button
                      onClick={() => abrirModal(pedido.id, 'emergencia')}
                      disabled={enProceso}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-medium py-2.5 rounded-xl text-xs transition"
                    >
                      <Siren className="w-3.5 h-3.5" />
                      SOS
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'mis_pedidos',  label: 'Mis pedidos',  count: pedidos.length },
    ...(modo === 'libre' ? [{ id: 'disponibles' as Tab, label: 'Disponibles', count: disponibles.length }] : []),
    { id: 'rendicion', label: 'Mi día', count: cobrosHoy.length },
  ]

  const totalCobradoHoy  = cobrosHoy.reduce((s, c) => s + (c.cobrado_monto ?? 0), 0)
  const totalEsperadoHoy = cobrosHoy.reduce((s, c) => s + c.total, 0)
  const entregasHoy      = cobrosHoy.length

  return (
    <>
      {/* Tabs */}
      <div className="flex bg-white rounded-xl border border-zinc-200 p-1 mb-4 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 text-xs font-medium rounded-lg transition',
              tab === t.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn(
                'ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold',
                tab === t.id ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
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
              <Package className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">Sin entregas asignadas</p>
              {modo === 'libre' && disponibles.length > 0 && (
                <button
                  onClick={() => setTab('disponibles')}
                  className="mt-3 text-sm text-zinc-600 hover:text-zinc-900 font-medium underline"
                >
                  Ver pedidos disponibles →
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ── Banner de ruta multi-parada ── */}
              {pedidos.length >= 2 && (() => {
                // Calcular si la ruta está optimizada (al menos un pedido tiene orden_en_ruta)
                const rutaOptimizada = pedidos.some(p => p.entregas?.[0]?.orden_en_ruta != null)
                const etaMax = Math.max(...pedidos.map(p => p.eta_minutos ?? 0))
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Truck className="w-4 h-4 text-orange-600 shrink-0" />
                      <p className="text-sm font-semibold text-orange-800">
                        Ruta con {pedidos.length} paradas
                      </p>
                      {rutaOptimizada && (
                        <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-medium">
                          ✓ Optimizada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-orange-700">
                      📦 Carga el vehículo en orden <strong>inverso</strong>: la parada {pedidos.length} abajo, la parada 1 arriba.
                    </p>
                    {etaMax > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⏱ ETA última parada:{' '}
                        <strong>
                          {etaMax < 60 ? `~${etaMax} min` : `~${Math.floor(etaMax / 60)}h${etaMax % 60 > 0 ? ` ${etaMax % 60}min` : ''}`}
                        </strong>
                      </p>
                    )}
                  </div>
                )
              })()}
              {pedidos.map((p, i) => (
                <TarjetaPedido key={p.id} pedido={p} idx={i} showAcciones totalPedidos={pedidos.length} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Tab: Disponibles (modo libre) */}
      {tab === 'disponibles' && (
        <div className="space-y-3">
          {disponibles.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">No hay pedidos disponibles</p>
              <p className="text-sm text-zinc-500 mt-1">Regresa en unos momentos</p>
            </div>
          ) : (
            disponibles.map((p, i) => (
              <div key={p.id}>
                <TarjetaPedido pedido={p} idx={i} showAcciones={false} totalPedidos={disponibles.length} />
                <div className="px-4 py-3 bg-white border border-t-0 border-zinc-200 rounded-b-2xl -mt-2">
                  <button
                    onClick={() => aceptarPedido(p.id)}
                    disabled={aceptando === p.id}
                    className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition"
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

      {/* Tab: Mi día (rendición) */}
      {tab === 'rendicion' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-zinc-500" />
              <p className="text-sm font-semibold text-zinc-900">Resumen del día</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400 mb-1">Entregas</p>
                <p className="text-2xl font-bold text-zinc-900">{entregasHoy}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-600 mb-1">Cobrado</p>
                <p className="text-lg font-bold text-green-700">{formatPEN(totalCobradoHoy)}</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400 mb-1">Total pedidos</p>
                <p className="text-lg font-bold text-zinc-700">{formatPEN(totalEsperadoHoy)}</p>
              </div>
            </div>
            {totalEsperadoHoy > 0 && totalCobradoHoy !== totalEsperadoHoy && (
              <div className={cn(
                'mt-3 text-xs rounded-lg px-3 py-2 text-center font-medium',
                totalCobradoHoy < totalEsperadoHoy ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
              )}>
                Diferencia: {totalCobradoHoy >= totalEsperadoHoy ? '+' : ''}{formatPEN(totalCobradoHoy - totalEsperadoHoy)}
              </div>
            )}
          </div>

          {cobrosHoy.length === 0 ? (
            <div className="text-center py-8 text-zinc-400">
              <p className="text-sm">Aún no hay entregas completadas hoy</p>
            </div>
          ) : (
            cobrosHoy.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-zinc-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{c.clientes?.nombre ?? 'Cliente'}</p>
                  <p className="text-xs text-zinc-400 font-mono">{c.numero_pedido}</p>
                  {c.cobrado_metodo && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {{ efectivo: '💵', yape: '📱', transferencia: '🏦' }[c.cobrado_metodo] ?? ''} {c.cobrado_metodo}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-700">
                    {c.cobrado_monto != null ? formatPEN(c.cobrado_monto) : '—'}
                  </p>
                  {c.estado_pago && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      (PAGO_LABELS[c.estado_pago] ?? PAGO_LABELS['pendiente']).color
                    )}>
                      {(PAGO_LABELS[c.estado_pago] ?? PAGO_LABELS['pendiente']).label}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: incidencia / retorno / emergencia */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl mb-2">
            <div className="flex items-center justify-between mb-4">
              {modal.tipo === 'incidencia'  && <h3 className="font-bold text-zinc-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Reportar problema</h3>}
              {modal.tipo === 'retorno'     && <h3 className="font-bold text-zinc-900 flex items-center gap-2"><RotateCcw className="w-5 h-5 text-zinc-500" /> Retornar pedido</h3>}
              {modal.tipo === 'emergencia'  && <h3 className="font-bold text-zinc-900 flex items-center gap-2"><Siren className="w-5 h-5 text-red-500" /> Emergencia</h3>}
              <button onClick={() => setModal(null)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
            </div>

            {(modal.tipo === 'incidencia' || modal.tipo === 'retorno') && (
              <>
                {modal.tipo === 'retorno' && (
                  <p className="text-sm text-zinc-600 mb-3">El pedido vuelve a la tienda y se desasignará de tu lista.</p>
                )}
                <p className="text-xs text-zinc-500 mb-2 font-medium">¿Qué pasó?</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {INCIDENCIAS.map(({ value, label }) => (
                    <button key={value} onClick={() => setIncTipo(value)}
                      className={cn('py-2 px-3 rounded-xl text-xs font-medium border transition text-left',
                        incTipo === value ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      )}>{label}</button>
                  ))}
                </div>
                <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Detalle adicional (opcional)…" rows={2}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </>
            )}

            {modal.tipo === 'emergencia' && (
              <>
                <p className="text-sm text-zinc-600 mb-3">Se enviará un mensaje de emergencia al encargado por WhatsApp.</p>
                <textarea value={emergMsg} onChange={(e) => setEmergMsg(e.target.value)}
                  placeholder="Describe la emergencia…" rows={3}
                  className="w-full text-sm border border-red-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 text-sm text-zinc-600 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition">
                Cancelar
              </button>
              <button
                onClick={confirmarModal}
                disabled={
                  cargando !== null ||
                  ((modal.tipo === 'incidencia' || modal.tipo === 'retorno') && !incTipo)
                }
                className={cn(
                  'flex-1 py-2.5 text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50',
                  modal.tipo === 'emergencia' ? 'bg-red-500 hover:bg-red-600 text-white' :
                  modal.tipo === 'retorno'    ? 'bg-zinc-700 hover:bg-zinc-800 text-white' :
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

      {/* ── PIN Modal para cobros con deuda ──────────────────────────────────── */}
      {pinPendiente && (
        <PinModal
          open={!!pinPendiente}
          onClose={() => setPinPendiente(null)}
          miembroId=""
          verificarUrl={`/api/delivery/${token}/pin`}
          accion="Confirmar cobro parcial (deuda)"
          onSuccess={() => {
            setPinVerificado(true)
            const pedido = pinPendiente
            setPinPendiente(null)
            // Pequeño delay para que el modal cierre antes de proceder
            setTimeout(() => confirmarEntrega(pedido, true), 100)
          }}
        />
      )}
    </>
  )
}
