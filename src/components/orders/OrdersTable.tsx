'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatPEN, formatFecha, formatFechaHoraLima, labelEstadoPedido, colorEstadoPedido, labelEstadoPago, colorEstadoPago, matchesFuzzy } from '@/lib/utils'
import { ChevronDown, Package, Loader2, Search, X, FileText, Send, ExternalLink, Plus, Bell, Download, CreditCard, CheckCircle2, Mic, Clock, Trash2, Pencil } from 'lucide-react'
import NuevoPedidoModal from './NuevoPedidoModal'
import { toast } from 'sonner'
import PedidoVozModal from './PedidoVozModal'
import EditarPedidoModal from './EditarPedidoModal'
import ModalEmitirBoleta from '@/components/comprobantes/ModalEmitirBoleta'
import ModalEmitirFactura from '@/components/comprobantes/ModalEmitirFactura'
import ModalNotaCredito from '@/components/comprobantes/ModalNotaCredito'
import { createClient } from '@/lib/supabase/client'
import type { Rol } from '@/lib/auth/roles'
import { checkPermiso, type PermisoMap } from '@/lib/auth/permisos'
import type { Pedido as PedidoDB } from '@/types/database'
import { useOrderActions } from './hooks/useOrderActions'
import { useOrderComprobantes } from './hooks/useOrderComprobantes'
import { useOrderFilters } from './hooks/useOrderFilters'
import OrderFilters from './components/OrderFilters'
import ModalCancelarPedido from './components/ModalCancelarPedido'
import ModalAprobarCredito from './components/ModalAprobarCredito'

interface Repartidor {
  id: string
  nombre: string
  telefono: string | null
  activo: boolean
}

interface ItemPedido {
  id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface EntregaResumen {
  id: string
  estado: string
  vehiculos: { nombre: string; tipo: string } | null
}

interface Pedido {
  id: string
  numero_pedido: string
  estado: string
  modalidad: string
  total: number
  costo_total: number | null
  notas: string | null
  motivo_cancelacion: string | null
  repartidor_id: string | null
  cobrado_monto: number | null
  cobrado_metodo: string | null
  incidencia_tipo: string | null
  incidencia_desc: string | null
  metodo_pago: string | null
  estado_pago: string
  pago_confirmado_por: string | null
  pago_confirmado_at: string | null
  created_at: string
  nombre_cliente: string
  telefono_cliente: string
  eta_minutos: number | null
  direccion_entrega: string | null
  fecha_entrega_programada: string | null
  clientes: { nombre: string | null; telefono: string | null; dni_ruc: string | null } | null
  zonas_delivery: { nombre: string } | null
  items_pedido: ItemPedido[]
  entregas: EntregaResumen[] | null
  comprobantes?: { id: string; tipo: string; numero_completo: string; estado: string; pdf_url: string | null }[]
}

// ── Helpers de pago ───────────────────────────────────────────────────────────

function labelMetodoPago(metodo: string | null): string {
  if (!metodo) return '—'
  const labels: Record<string, string> = {
    efectivo: '💵 Efectivo',
    yape: '📱 Yape',
    transferencia: '🏦 Transferencia',
    tarjeta: '💳 Tarjeta',
    credito: '🤝 Crédito',
  }
  return labels[metodo] ?? metodo
}

// labelEstadoPago y colorEstadoPago importados desde @/lib/utils (fuente única de verdad)

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

const ESTADOS = ['programado', 'pendiente', 'confirmado', 'en_preparacion', 'listo_para_recojo', 'enviado', 'entregado', 'cancelado', 'devuelto']

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

export default function OrdersTable({ pedidos: inicial, productos = [], zonas = [], ferreteriaId, rol = 'dueno', repartidores = [], permisos, nubefactConfigurado = false, tieneRuc = false }: {
  pedidos: Pedido[]
  productos?: Producto[]
  zonas?: Zona[]
  ferreteriaId?: string
  rol?: Rol
  repartidores?: Repartidor[]
  permisos?: Partial<PermisoMap>
  nubefactConfigurado?: boolean
  tieneRuc?: boolean
}) {
  const router = useRouter()
  const esDueno = rol === 'dueno'
  const sessionData = { rol, permisos: permisos ?? {} }
  const puedeConfirmarPagos = checkPermiso(sessionData, 'registrar_pagos')
  const puedeAprobarCreditos = checkPermiso(sessionData, 'aprobar_creditos')
  const [pedidos, setPedidos] = useState(inicial)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalVoz, setModalVoz]     = useState(false)
  const [nuevoPedidoAlert, setNuevoPedidoAlert] = useState(false)
  // Dialog de motivo de cancelación
  const [cancelDialog, setCancelDialog] = useState<{ pedidoId: string; motivo: string } | null>(null)
  // Dialog de aprobación de crédito
  const [creditoDialog, setCreditoDialog] = useState<{
    pedidoId: string
    fechaLimite: string
    notas: string
  } | null>(null)

  const {
    actualizando,
    pagando,
    asignando,
    eliminando,
    aprobandoCredito,
    cambiarEstado,
    actualizarPago,
    aprobarCredito,
    asignarRepartidor,
    eliminarPedido,
  } = useOrderActions(setPedidos, setCancelDialog, setCreditoDialog)

  const {
    modalBoleta, setModalBoleta,
    modalFactura, setModalFactura,
    modalNC, setModalNC,
    boletasEmitidas,
    facturasEmitidas,
    estadoComprobante,
    verComprobante,
    reenviarComprobante,
    handleBoletaEmitida,
    handleFacturaEmitida
  } = useOrderComprobantes(pedidos)

  // Modal editar pedido
  const [modalEditar, setModalEditar] = useState<typeof pedidos[0] | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

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


  const ESTADOS_CON_COMPROBANTE = new Set(['confirmado', 'en_preparacion', 'enviado', 'entregado'])

  // Filtros
  const { busqueda, setBusqueda, filtroEstado, setFiltroEstado, filtroFecha, setFiltroFecha, filtrados, hayFiltros } = useOrderFilters(pedidos)

  // Exportar pedidos filtrados como CSV
  function exportarCSV() {
    const headers = esDueno
      ? ['N° Pedido', 'Cliente', 'Teléfono', 'Modalidad', 'Estado', 'Total', 'Costo', 'Ganancia', 'Motivo cancelación', 'Fecha']
      : ['N° Pedido', 'Cliente', 'Teléfono', 'Modalidad', 'Estado', 'Motivo cancelación', 'Fecha']

    const filas = [
      headers,
      ...filtrados.map((p) => {
        const nombre = p.clientes?.nombre ?? p.nombre_cliente
        const tel = p.clientes?.telefono ?? p.telefono_cliente
        const base = [
          p.numero_pedido,
          nombre,
          tel,
          p.modalidad,
          p.estado,
        ]
        if (esDueno) {
          const ganancia = p.costo_total != null ? (p.total - p.costo_total).toFixed(2) : ''
          return [...base, p.total.toFixed(2), p.costo_total?.toFixed(2) ?? '', ganancia, p.motivo_cancelacion ?? '', new Date(p.created_at).toLocaleDateString('es-PE')]
        }
        return [...base, p.motivo_cancelacion ?? '', new Date(p.created_at).toLocaleDateString('es-PE')]
      }),
    ]
    const csv = filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Alerta de nuevo pedido (Realtime) */}
      {nuevoPedidoAlert && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Bell className="w-4 h-4" />
            ¡Llegó un nuevo pedido!
          </span>
          <button
            onClick={() => { router.refresh(); setNuevoPedidoAlert(false) }}
            className="text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-1.5 rounded-lg transition"
          >
            Ver ahora
          </button>
        </div>
      )}

      {/* Dialog de motivo de cancelación */}
      <ModalCancelarPedido
        cancelDialog={cancelDialog}
        setCancelDialog={setCancelDialog}
        cambiarEstado={cambiarEstado}
      />

      {/* Dialog de aprobación de crédito */}
      <ModalAprobarCredito
        creditoDialog={creditoDialog}
        setCreditoDialog={setCreditoDialog}
        aprobarCredito={aprobarCredito}
        aprobandoCredito={aprobandoCredito}
      />

      {/* Acciones superiores */}
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={exportarCSV}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium rounded-xl transition"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
        <button
          onClick={() => setModalVoz(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition"
          title="Crear pedido por voz con IA"
        >
          <Mic className="w-4 h-4" />
          Por voz
        </button>
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo pedido
        </button>
      </div>

      <OrderFilters
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        filtroFecha={filtroFecha}
        setFiltroFecha={setFiltroFecha}
        pedidosCount={pedidos.length}
        pedidos={pedidos}
      />

      {/* Resultados */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-zinc-300">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-zinc-400">
            {hayFiltros ? 'No hay pedidos con estos filtros' : 'No hay pedidos aún'}
          </p>
          {hayFiltros && (
            <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroFecha('') }}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 transition">
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
              <div key={pedido.id} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 transition"
                  onClick={() => setExpandido(isOpen ? null : pedido.id)}
                >
                  <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform shrink-0', isOpen && 'rotate-180')} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">{nombreCliente}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      <span className="font-mono">{pedido.numero_pedido}</span>
                      {' · '}{formatFecha(pedido.created_at)}
                      {' · '}{pedido.modalidad === 'delivery' ? '🚚 Delivery' : '🏪 Recojo'}
                      {pedido.zonas_delivery && ` — ${pedido.zonas_delivery.nombre}`}
                    </p>
                    {/* Fecha programada — solo para pedidos en estado 'programado' */}
                    {pedido.estado === 'programado' && pedido.fecha_entrega_programada && (
                      <div className="flex gap-1 mt-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                          <Clock className="w-2.5 h-2.5" />
                          📅 {formatFechaHoraLima(pedido.fecha_entrega_programada)}
                        </span>
                      </div>
                    )}
                    {/* ETA + vehículo asignado — solo para delivery inmediato */}
                    {pedido.estado !== 'programado' && pedido.modalidad === 'delivery' && (pedido.eta_minutos != null || pedido.entregas?.[0]?.vehiculos) && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {pedido.eta_minutos != null && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5" />
                            {pedido.eta_minutos < 60
                              ? `~${pedido.eta_minutos} min`
                              : `~${Math.floor(pedido.eta_minutos / 60)}h${pedido.eta_minutos % 60 > 0 ? ` ${pedido.eta_minutos % 60}min` : ''}`
                            }
                          </span>
                        )}
                        {pedido.entregas?.[0]?.vehiculos && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                            🚗 {pedido.entregas[0].vehiculos.nombre}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-bold text-zinc-900 shrink-0 tabular-nums">
                    {formatPEN(pedido.total)}
                  </p>

                  {/* Badge de estado de pago — solo métodos que no son efectivo ni crédito */}
                  {pedido.metodo_pago && pedido.metodo_pago !== 'efectivo' && pedido.metodo_pago !== 'credito' && pedido.estado !== 'cancelado' && (
                    <span className={cn(
                      'hidden sm:inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      colorEstadoPago(pedido.estado_pago)
                    )}>
                      {pedido.estado_pago === 'pagado'
                        ? <CheckCircle2 className="w-3 h-3" />
                        : <CreditCard className="w-3 h-3" />
                      }
                      {labelEstadoPago(pedido.estado_pago)}
                    </span>
                  )}

                  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {actualizando === pedido.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : (
                      <>
                        {(() => {
                          let nextState = ''
                          let label = ''
                          if (pedido.estado === 'pendiente') { nextState = 'confirmado'; label = 'Confirmar' }
                          else if (pedido.estado === 'confirmado') { nextState = 'en_preparacion'; label = 'Preparar' }
                          else if (pedido.estado === 'en_preparacion') {
                            if (pedido.modalidad === 'recojo') { nextState = 'listo_para_recojo'; label = 'Listo Recojo' }
                            else { nextState = 'enviado'; label = 'Enviar' }
                          }
                          else if (pedido.estado === 'enviado' || pedido.estado === 'listo_para_recojo') { nextState = 'entregado'; label = 'Entregar' }

                          if (nextState) {
                            return (
                              <button
                                onClick={() => cambiarEstado(pedido.id, nextState)}
                                className={cn('text-xs font-bold px-3 py-1.5 rounded-full shadow-sm hover:scale-105 transition', colorEstadoPedido(nextState))}
                              >
                                {label} →
                              </button>
                            )
                          }
                          return null
                        })()}
                        {/* Selector tradicional pequeño/secundario */}
                        <select
                          value={pedido.estado}
                          onChange={(e) => cambiarEstado(pedido.id, e.target.value)}
                          className={cn(
                            'text-[10px] font-semibold px-2 py-1.5 rounded-full border border-zinc-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-300 bg-white text-zinc-600',
                            !['entregado', 'cancelado'].includes(pedido.estado) ? 'opacity-60 hover:opacity-100' : ''
                          )}
                          title="Cambiar estado manualmente"
                        >
                          {ESTADOS.map((e) => (
                            <option key={e} value={e}>{labelEstadoPedido(e)}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-zinc-100 px-4 py-4 bg-zinc-50">
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr className="text-xs text-zinc-400 border-b border-zinc-200">
                          <th className="text-left pb-1.5 font-medium">Producto</th>
                          <th className="text-right pb-1.5 font-medium">Cant.</th>
                          <th className="text-right pb-1.5 font-medium">P. Unit.</th>
                          <th className="text-right pb-1.5 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {pedido.items_pedido.map((item: any) => (
                          <tr key={item.id}>
                            <td className="py-1.5 text-zinc-800">{item.nombre_producto}</td>
                            <td className="py-1.5 text-right text-zinc-500">{item.cantidad}</td>
                            <td className="py-1.5 text-right text-zinc-500">{formatPEN(item.precio_unitario)}</td>
                            <td className="py-1.5 text-right font-semibold text-zinc-800">{formatPEN(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-zinc-200">
                          <td colSpan={3} className="pt-2 text-right font-semibold text-zinc-500">Total</td>
                          <td className="pt-2 text-right font-bold text-zinc-950 tabular-nums">{formatPEN(pedido.total)}</td>
                        </tr>
                        {esDueno && pedido.costo_total != null && pedido.costo_total > 0 && (() => {
                          const ganancia = pedido.total - pedido.costo_total
                          const margen = pedido.total > 0 ? (ganancia / pedido.total) * 100 : 0
                          const positivo = ganancia >= 0
                          return (
                            <tr>
                              <td colSpan={3} className="pt-1 text-right text-xs text-zinc-400">Ganancia</td>
                              <td className={cn('pt-1 text-right text-xs font-semibold', positivo ? 'text-green-600' : 'text-red-500')}>
                                {positivo ? '+' : ''}{formatPEN(ganancia)}
                                <span className="ml-1 font-normal opacity-70">({margen.toFixed(0)}%)</span>
                              </td>
                            </tr>
                          )
                        })()}
                      </tfoot>
                    </table>
                    {pedido.direccion_entrega && (
                      <p className="text-xs text-zinc-500 mb-2">
                        <span className="font-medium">📍 Dirección:</span> {pedido.direccion_entrega}
                        {pedido.eta_minutos != null && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-sky-600 font-medium">
                            <Clock className="w-3 h-3" />
                            {pedido.eta_minutos < 60
                              ? `~${pedido.eta_minutos} min`
                              : `~${Math.floor(pedido.eta_minutos / 60)}h${pedido.eta_minutos % 60 > 0 ? ` ${pedido.eta_minutos % 60}min` : ''}`
                            }
                          </span>
                        )}
                      </p>
                    )}
                    {pedido.notas && (
                      <p className="text-xs text-zinc-500 mb-2">
                        <span className="font-medium">Notas:</span> {pedido.notas}
                      </p>
                    )}

                    {/* ── Sección de pago ───────────────────────────────────── */}
                    {pedido.estado !== 'cancelado' && (
                      <div className="mb-3 border border-zinc-200 rounded-xl p-3 bg-white">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-zinc-500">Método de pago:</span>
                            <select
                              value={pedido.metodo_pago ?? ''}
                              disabled={pagando === pedido.id || pedido.estado === 'entregado'}
                              onChange={(e) => actualizarPago(pedido.id, { metodo_pago: e.target.value || undefined })}
                              className="text-xs border border-zinc-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-50"
                            >
                              <option value="">— Sin definir —</option>
                              <option value="efectivo">💵 Efectivo</option>
                              <option value="yape">📱 Yape</option>
                              <option value="transferencia">🏦 Transferencia</option>
                              <option value="tarjeta">💳 Tarjeta</option>
                              <option value="credito">🤝 Crédito</option>
                            </select>
                          </div>

                          {/* Acciones según método y estado de pago */}
                          {pagando === pedido.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                          ) : !pedido.metodo_pago ? (
                            <span className="text-xs text-zinc-400">Sin método definido</span>
                          ) : pedido.estado_pago === 'pagado' ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Pago confirmado
                            </span>
                          ) : pedido.metodo_pago === 'credito' && pedido.estado_pago === 'pendiente' ? (
                            puedeAprobarCreditos ? (
                              <button
                                onClick={() => setCreditoDialog({ pedidoId: pedido.id, fechaLimite: '', notas: '' })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Aprobar crédito
                              </button>
                            ) : (
                              <span className="text-xs text-blue-600">Pendiente aprobación</span>
                            )
                          ) : pedido.metodo_pago === 'credito' && pedido.estado_pago === 'credito_activo' ? (
                            <a
                              href="/dashboard/creditos"
                              className="text-xs text-blue-600 font-medium hover:underline"
                            >
                              Ver crédito activo →
                            </a>
                          ) : pedido.estado_pago === 'verificando' ? (
                            puedeConfirmarPagos ? (
                              <button
                                onClick={() => actualizarPago(pedido.id, { estado_pago: 'pagado' })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Confirmar pago
                              </button>
                            ) : (
                              <span className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', colorEstadoPago('verificando'))}>
                                <CreditCard className="w-3 h-3" />
                                En verificación
                              </span>
                            )
                          ) : pedido.metodo_pago === 'tarjeta' ? (
                            /* POS — requiere confirmación antes de avanzar */
                            puedeConfirmarPagos ? (
                              <button
                                onClick={() => actualizarPago(pedido.id, { estado_pago: 'pagado' })}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Confirmar POS
                              </button>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">POS — pendiente confirmación</span>
                            )
                          ) : (
                            /* efectivo / yape / transferencia — contra entrega, registro opcional */
                            <button
                              onClick={() => actualizarPago(pedido.id, { estado_pago: 'verificando' })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 text-xs font-medium rounded-lg border border-zinc-200 transition"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Marcar cobrado
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Asignar repartidor — solo para delivery, solo para dueño/vendedor */}
                    {pedido.modalidad === 'delivery' && repartidores.length > 0 && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs text-zinc-500 shrink-0">🚚 Repartidor:</span>
                        <select
                          value={pedido.repartidor_id ?? ''}
                          disabled={asignando === pedido.id}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val) asignarRepartidor(pedido.id, val)
                          }}
                          className="flex-1 text-xs border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-300 bg-white"
                        >
                          <option value="">— Sin asignar —</option>
                          {repartidores.filter(r => r.activo).map((r) => (
                            <option key={r.id} value={r.id}>{r.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Incidencia de delivery */}
                    {pedido.incidencia_tipo && (
                      <div className="mb-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                        <span className="font-medium">Incidencia:</span> {
                          ({ pedido_incorrecto: 'Pedido incorrecto', cliente_ausente: 'Cliente no estaba', pago_rechazado: 'No pudo pagar', otro: 'Otro' } as Record<string, string>)[pedido.incidencia_tipo] ?? pedido.incidencia_tipo
                        }
                        {pedido.incidencia_desc && ` — ${pedido.incidencia_desc}`}
                      </div>
                    )}

                    {/* Cobro registrado */}
                    {pedido.cobrado_monto != null && (
                      <div className="mb-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                        <span className="font-medium">Cobrado:</span> S/ {pedido.cobrado_monto.toFixed(2)} · {pedido.cobrado_metodo === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo'}
                      </div>
                    )}

                    {pedido.motivo_cancelacion && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5 mb-2">
                        <span className="font-medium">Motivo cancelación:</span> {pedido.motivo_cancelacion}
                      </p>
                    )}

                    {/* ── Botón Editar pedido ──────────────────────────────── */}
                    {pedido.estado_pago !== 'pagado' && !boletasEmitidas[pedido.id] && !facturasEmitidas[pedido.id] && pedido.estado !== 'cancelado' && (
                      <div className="mb-3">
                        <button
                          onClick={() => setModalEditar(pedido)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium rounded-lg border border-amber-200 transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Editar pedido
                        </button>
                      </div>
                    )}

                    {/* Botones de comprobante */}
                    {ESTADOS_CON_COMPROBANTE.has(pedido.estado) && (() => {
                      const cp = estadoComprobante(pedido.id)
                      const boletaEmitida = boletasEmitidas[pedido.id]
                      const facturaEmitida = facturasEmitidas[pedido.id]

                      return (
                        <div className="border-t border-zinc-200 pt-3 flex items-center gap-2 flex-wrap">
                          {/* 1. Ver Nota de Venta */}
                          <button
                            onClick={() => verComprobante(pedido.id)}
                            disabled={cp.cargando}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 transition disabled:opacity-50"
                          >
                            {cp.cargando ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            {cp.cargando ? 'Generando…' : 'Ver Nota de Venta'}
                            {!cp.cargando && <ExternalLink className="w-3 h-3 opacity-60" />}
                          </button>

                          {/* 2. Ver Boleta */}
                          {nubefactConfigurado && (
                            boletaEmitida ? (
                              <button
                                onClick={() => window.open(boletaEmitida.pdfUrl || `/orders/print/${pedido.id}?comprobanteId=${boletaEmitida.comprobanteId}`, '_blank')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg border border-green-200 transition"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Ver Boleta ({boletaEmitida.numeroCompleto})
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setModalBoleta(pedido as unknown as PedidoDB)}
                                disabled={!!facturaEmitida}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg border border-green-200 transition disabled:opacity-40 disabled:hover:bg-green-50 disabled:cursor-not-allowed"
                                title={facturaEmitida ? "Bloqueado porque ya se emitió Factura" : "Emitir boleta ante SUNAT"}
                              >
                                🧾 Ver Boleta
                              </button>
                            )
                          )}

                          {/* 3. Ver Factura */}
                          {nubefactConfigurado && tieneRuc && (
                            facturaEmitida ? (
                              <button
                                onClick={() => window.open(facturaEmitida.pdfUrl || `/orders/print/${pedido.id}?comprobanteId=${facturaEmitida.comprobanteId}`, '_blank')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Ver Factura ({facturaEmitida.numeroCompleto})
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setModalFactura(pedido as unknown as PedidoDB)}
                                disabled={!!boletaEmitida}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition disabled:opacity-40 disabled:hover:bg-indigo-50 disabled:cursor-not-allowed"
                                title={boletaEmitida ? "Bloqueado porque ya se emitió Boleta" : "Emitir factura ante SUNAT"}
                              >
                                🧾 Ver Factura
                              </button>
                            )
                          )}

                          {cp.error && (
                            <span className="text-xs text-red-500">{cp.error}</span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Botón de eliminar (solo para dueño) */}
                    {esDueno && (
                      <div className="border-t border-zinc-200 mt-3 pt-3 flex justify-end">
                        <button
                          onClick={() => eliminarPedido(pedido.id)}
                          disabled={eliminando === pedido.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg border border-red-200 transition disabled:opacity-50"
                        >
                          {eliminando === pedido.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Eliminar Pedido
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Contador de resultados filtrados */}
          {hayFiltros && (
            <p className="text-xs text-zinc-400 text-center pt-2">
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

      {/* Modal pedido por voz */}
      {modalVoz && (
        <PedidoVozModal
          productos={productos}
          zonas={zonas}
          onClose={() => setModalVoz(false)}
        />
      )}

      {/* Modal emitir boleta electrónica (F3) */}
      {modalBoleta && (
        <ModalEmitirBoleta
          pedido={modalBoleta as PedidoDB}
          clienteDniRuc={(modalBoleta as any).clientes?.dni_ruc ?? null}
          onClose={() => setModalBoleta(null)}
          onEmitida={(r) => handleBoletaEmitida(modalBoleta.id, r)}
        />
      )}

      {/* Modal emitir factura electrónica (F4) */}
      {modalFactura && (
        <ModalEmitirFactura
          pedido={modalFactura as PedidoDB}
          clienteRuc={(modalFactura as any).clientes?.dni_ruc ?? null}
          clienteRazonSocial={(modalFactura as any).clientes?.nombre ?? null}
          onClose={() => setModalFactura(null)}
          onEmitida={(r) => handleFacturaEmitida(modalFactura.id, r)}
        />
      )}

      {/* Modal editar pedido */}
      {modalEditar && (
        <EditarPedidoModal
          pedido={modalEditar}
          productos={productos}
          zonas={zonas}
          onClose={() => setModalEditar(null)}
        />
      )}
    </div>
  )
}
