'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatPEN, formatFecha, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import { ChevronDown, Package, Loader2, Search, X, FileText, Send, ExternalLink, Plus, Bell, Download, CreditCard, CheckCircle2, Mic, Clock } from 'lucide-react'
import NuevoPedidoModal from './NuevoPedidoModal'
import PedidoVozModal from './PedidoVozModal'
import ModalEmitirBoleta from '@/components/comprobantes/ModalEmitirBoleta'
import ModalEmitirFactura from '@/components/comprobantes/ModalEmitirFactura'
import { createClient } from '@/lib/supabase/client'
import type { Rol } from '@/lib/auth/roles'
import { checkPermiso, type PermisoMap } from '@/lib/auth/permisos'
import type { Pedido as PedidoDB } from '@/types/database'

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
  clientes: { nombre: string | null; telefono: string } | null
  zonas_delivery: { nombre: string } | null
  items_pedido: ItemPedido[]
  entregas: EntregaResumen[] | null
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

function labelEstadoPago(estado: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Sin pago',
    verificando: 'Verificando',
    pagado: 'Pagado',
    credito_activo: 'Crédito activo',
    credito_vencido: 'Crédito vencido',
    reembolso_pendiente: 'Reembolso',
  }
  return labels[estado] ?? estado
}

function colorEstadoPago(estado: string): string {
  const colors: Record<string, string> = {
    pendiente: 'bg-zinc-100 text-zinc-500',
    verificando: 'bg-amber-100 text-amber-700',
    pagado: 'bg-green-100 text-green-700',
    credito_activo: 'bg-blue-100 text-blue-700',
    credito_vencido: 'bg-red-100 text-red-600',
    reembolso_pendiente: 'bg-purple-100 text-purple-700',
  }
  return colors[estado] ?? 'bg-zinc-100 text-zinc-500'
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
  const [pedidos, setPedidos] = useState(inicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [asignando, setAsignando] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
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
  const [aprobandoCredito, setAprobandoCredito] = useState(false)
  const puedeAprobarCreditos = checkPermiso(sessionData, 'aprobar_creditos')

  // Modal emitir boleta electrónica (F3)
  const [modalBoleta, setModalBoleta] = useState<PedidoDB | null>(null)
  // Boletas ya emitidas en esta sesión: pedidoId → { numeroCompleto, pdfUrl }
  const [boletasEmitidas, setBoletasEmitidas] = useState<Record<string, { numeroCompleto: string; pdfUrl?: string }>>({})

  function handleBoletaEmitida(pedidoId: string, resultado: { numeroCompleto: string; pdfUrl?: string }) {
    setBoletasEmitidas((prev) => ({ ...prev, [pedidoId]: resultado }))
    setModalBoleta(null)
  }

  // Modal emitir factura electrónica (F4)
  const [modalFactura, setModalFactura] = useState<PedidoDB | null>(null)
  // Facturas ya emitidas en esta sesión: pedidoId → { numeroCompleto, pdfUrl }
  const [facturasEmitidas, setFacturasEmitidas] = useState<Record<string, { numeroCompleto: string; pdfUrl?: string }>>({})

  function handleFacturaEmitida(pedidoId: string, resultado: { numeroCompleto: string; pdfUrl?: string }) {
    setFacturasEmitidas((prev) => ({ ...prev, [pedidoId]: resultado }))
    setModalFactura(null)
  }

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

  async function cambiarEstado(pedidoId: string, nuevoEstado: string, motivoCancelacion?: string) {
    // Si va a cancelar, mostrar dialog primero (a menos que ya venga con motivo)
    if (nuevoEstado === 'cancelado' && motivoCancelacion === undefined) {
      setCancelDialog({ pedidoId, motivo: '' })
      return
    }

    setActualizando(pedidoId)
    try {
      const res = await fetch(`/api/orders/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          ...(motivoCancelacion ? { motivo_cancelacion: motivoCancelacion } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al actualizar el estado')
      }
      const actualizado = await res.json()
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId
          ? { ...p, estado: actualizado.estado, motivo_cancelacion: motivoCancelacion ?? p.motivo_cancelacion }
          : p))
      )
      router.refresh()
    } catch {
      alert('Error al actualizar el estado')
    } finally {
      setActualizando(null)
      setCancelDialog(null)
    }
  }

  async function actualizarPago(pedidoId: string, body: { metodo_pago?: string; estado_pago?: string }) {
    setPagando(pedidoId)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al actualizar el pago')
      }
      const data = await res.json()
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoId
            ? {
                ...p,
                metodo_pago: data.metodo_pago ?? p.metodo_pago,
                estado_pago: data.estado_pago ?? p.estado_pago,
                pago_confirmado_por: data.pago_confirmado_por ?? p.pago_confirmado_por,
                pago_confirmado_at: data.pago_confirmado_at ?? p.pago_confirmado_at,
              }
            : p
        )
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar el pago')
    } finally {
      setPagando(null)
    }
  }

  async function aprobarCredito() {
    if (!creditoDialog) return
    if (!creditoDialog.fechaLimite) return alert('Selecciona la fecha límite del crédito')

    setAprobandoCredito(true)
    try {
      const res = await fetch('/api/creditos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: creditoDialog.pedidoId,
          fecha_limite: creditoDialog.fechaLimite,
          notas: creditoDialog.notas || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al aprobar crédito')
      }
      // Actualizar estado_pago en el pedido local
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === creditoDialog.pedidoId
            ? { ...p, estado_pago: 'credito_activo' }
            : p
        )
      )
      setCreditoDialog(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al aprobar crédito')
    } finally {
      setAprobandoCredito(false)
    }
  }

  async function asignarRepartidor(pedidoId: string, repartidorId: string) {
    setAsignando(pedidoId)
    try {
      const res = await fetch(`/api/repartidores/${repartidorId}/asignar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPedidos((prev) => prev.map((p) => p.id === pedidoId
        ? { ...p, repartidor_id: repartidorId === 'ninguno' ? null : repartidorId }
        : p))
    } catch {
      alert('Error al asignar repartidor')
    } finally {
      setAsignando(null)
    }
  }

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
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="font-semibold text-zinc-900 mb-1">Cancelar pedido</h3>
            <p className="text-sm text-zinc-500 mb-4">¿Por qué se cancela este pedido? (opcional)</p>
            <div className="flex gap-2 mb-4 flex-wrap">
              {['Cliente desistió', 'Sin stock', 'Error en el pedido', 'Otro'].map((m) => (
                <button
                  key={m}
                  onClick={() => setCancelDialog((d) => d ? { ...d, motivo: m } : d)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition',
                    cancelDialog.motivo === m
                      ? 'bg-red-100 border-red-300 text-red-700'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  )}
                >{m}</button>
              ))}
            </div>
            <textarea
              value={cancelDialog.motivo}
              onChange={(e) => setCancelDialog((d) => d ? { ...d, motivo: e.target.value } : d)}
              placeholder="O escribe el motivo aquí…"
              rows={2}
              className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCancelDialog(null)}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition"
              >Volver</button>
              <button
                onClick={() => cambiarEstado(cancelDialog.pedidoId, 'cancelado', cancelDialog.motivo || undefined)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition"
              >Confirmar cancelación</button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de aprobación de crédito */}
      {creditoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="font-semibold text-zinc-900 mb-1">Aprobar crédito</h3>
            <p className="text-sm text-zinc-500 mb-4">El cliente pagará en un plazo acordado. Define la fecha límite.</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Fecha límite de pago *</label>
                <input
                  type="date"
                  value={creditoDialog.fechaLimite}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCreditoDialog((d) => d ? { ...d, fechaLimite: e.target.value } : d)}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Notas (opcional)</label>
                <input
                  type="text"
                  value={creditoDialog.notas}
                  onChange={(e) => setCreditoDialog((d) => d ? { ...d, notas: e.target.value } : d)}
                  placeholder="Condiciones del crédito…"
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreditoDialog(null)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition">
                Cancelar
              </button>
              <button
                onClick={aprobarCredito}
                disabled={aprobandoCredito}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {aprobandoCredito ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Aprobar crédito
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Barra de búsqueda + filtro de fecha */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, teléfono o N° pedido…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro fecha */}
        <div className="flex gap-1">
          {RANGOS_FECHA.map(({ label, value }) => (
            <button key={value} onClick={() => setFiltroFecha(value)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition',
                filtroFecha === value
                  ? 'bg-zinc-950 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros por estado */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition',
            !filtroEstado ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
          Todos ({pedidos.length})
        </button>
        {ESTADOS.map((e) => {
          const count = pedidos.filter((p) => p.estado === e).length
          if (!count) return null
          return (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition',
                filtroEstado === e ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
              {labelEstadoPedido(e)} ({count})
            </button>
          )
        })}
        {hayFiltros && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroFecha('') }}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1 transition">
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>

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
                    {/* ETA + vehículo asignado — solo para delivery */}
                    {pedido.modalidad === 'delivery' && (pedido.eta_minutos != null || pedido.entregas?.[0]?.vehiculos) && (
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

                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {actualizando === pedido.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : (
                      <select
                        value={pedido.estado}
                        onChange={(e) => cambiarEstado(pedido.id, e.target.value)}
                        className={cn(
                          'text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-300',
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
                        {pedido.items_pedido.map((item) => (
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
                          { pedido_incorrecto: 'Pedido incorrecto', cliente_ausente: 'Cliente no estaba', pago_rechazado: 'No pudo pagar', otro: 'Otro' }[pedido.incidencia_tipo] ?? pedido.incidencia_tipo
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

                    {/* Botones de comprobante */}
                    {ESTADOS_CON_COMPROBANTE.has(pedido.estado) && (() => {
                      const cp = estadoComprobante(pedido.id)
                      const boletaEmitida = boletasEmitidas[pedido.id]
                      return (
                        <div className="border-t border-zinc-200 pt-3 flex items-center gap-2 flex-wrap">
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium rounded-lg transition disabled:opacity-50"
                          >
                            {cp.reenviando
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : cp.enviado
                              ? <span className="text-green-600 flex items-center gap-1">✓ Enviado</span>
                              : <><Send className="w-3.5 h-3.5" /> Reenviar al cliente</>
                            }
                          </button>

                          {/* Botón boleta electrónica — solo si Nubefact está configurado */}
                          {nubefactConfigurado && (
                            boletaEmitida ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg font-medium">
                                  ✓ {boletaEmitida.numeroCompleto}
                                </span>
                                {boletaEmitida.pdfUrl && (
                                  <a
                                    href={boletaEmitida.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                  >
                                    PDF <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => setModalBoleta(pedido as unknown as PedidoDB)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg border border-green-200 transition"
                              >
                                🧾 Emitir boleta
                              </button>
                            )
                          )}

                          {/* Botón factura electrónica — solo si Nubefact configurado y ferretería tiene RUC */}
                          {nubefactConfigurado && tieneRuc && (() => {
                            const facturaEmitida = facturasEmitidas[pedido.id]
                            return facturaEmitida ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg font-medium">
                                  F ✓ {facturaEmitida.numeroCompleto}
                                </span>
                                {facturaEmitida.pdfUrl && (
                                  <a
                                    href={facturaEmitida.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
                                  >
                                    PDF <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => setModalFactura(pedido as unknown as PedidoDB)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition"
                              >
                                🧾 Emitir factura
                              </button>
                            )
                          })()}

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
          onClose={() => setModalBoleta(null)}
          onEmitida={(r) => handleBoletaEmitida(modalBoleta.id, r)}
        />
      )}

      {/* Modal emitir factura electrónica (F4) */}
      {modalFactura && (
        <ModalEmitirFactura
          pedido={modalFactura as PedidoDB}
          onClose={() => setModalFactura(null)}
          onEmitida={(r) => handleFacturaEmitida(modalFactura.id, r)}
        />
      )}
    </div>
  )
}
