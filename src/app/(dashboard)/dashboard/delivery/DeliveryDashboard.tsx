'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Truck, MapPin, Clock, Package, CheckCircle, Loader2,
  Route, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn, formatPEN } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VehiculoInfo { id: string; nombre: string; tipo: string }
interface RepartidorInfo { id: string; nombre: string }
interface PedidoInfo {
  id: string
  numero_pedido: string
  nombre_cliente: string
  direccion_entrega: string | null
  total: number
  estado: string
  eta_minutos: number | null
}

interface EntregaDashboard {
  id: string
  estado: string
  orden_en_ruta: number | null
  eta_actual: string | null
  distancia_km: number | null
  duracion_estimada_min: number | null
  duracion_real_min: number | null
  salio_at: string | null
  llego_at: string | null
  pedidos: PedidoInfo | null
  vehiculos: VehiculoInfo | null
  repartidores: RepartidorInfo | null
}

interface GrupoRepartidor {
  repartidor: RepartidorInfo
  entregas: EntregaDashboard[]
  vehiculo: VehiculoInfo | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_ENTREGA: Record<string, { label: string; color: string; dot: string }> = {
  pendiente: { label: 'Pendiente',      color: 'bg-zinc-100 text-zinc-600',    dot: 'bg-zinc-400'   },
  carga:     { label: 'Cargando',       color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-400'  },
  en_ruta:   { label: 'En ruta',        color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
  entregado: { label: 'Entregado ✓',    color: 'bg-green-50 text-green-700',   dot: 'bg-green-400'  },
  fallida:   { label: 'Fallida',        color: 'bg-red-50 text-red-600',       dot: 'bg-red-400'    },
}

function formatEta(min: number | null): string {
  if (!min) return '—'
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`
}

function groupByRepartidor(entregas: EntregaDashboard[]): GrupoRepartidor[] {
  const map = new Map<string, GrupoRepartidor>()
  for (const e of entregas) {
    if (!e.repartidores) continue
    const rid = e.repartidores.id
    if (!map.has(rid)) {
      map.set(rid, {
        repartidor: e.repartidores,
        entregas: [],
        vehiculo: e.vehiculos,
      })
    }
    map.get(rid)!.entregas.push(e)
  }
  // Ordenar entregas de cada grupo por orden_en_ruta
  for (const g of map.values()) {
    g.entregas.sort((a, b) => (a.orden_en_ruta ?? 999) - (b.orden_en_ruta ?? 999))
  }
  return Array.from(map.values())
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DeliveryDashboard({
  initialEntregas,
}: {
  initialEntregas: EntregaDashboard[]
}) {
  const [entregas, setEntregas]       = useState(initialEntregas)
  const [optimizando, setOptimizando] = useState<string | null>(null)
  const [expandidos, setExpandidos]   = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing]   = useState(false)
  const [, startTransition]           = useTransition()
  const router                        = useRouter()

  const grupos        = groupByRepartidor(entregas)
  const sinAsignar    = entregas.filter((e) => !e.repartidores)
  const totalActivas  = entregas.filter((e) => ['pendiente', 'carga', 'en_ruta'].includes(e.estado)).length
  const totalEnRuta   = entregas.filter((e) => e.estado === 'en_ruta').length
  const totalEntregas = entregas.filter((e) => e.estado === 'entregado').length

  // ── Acciones ──────────────────────────────────────────────────────────────

  async function optimizarRuta(repartidorId: string) {
    setOptimizando(repartidorId)
    try {
      const res = await fetch('/api/entregas/optimizar-ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repartidor_id: repartidorId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Error al optimizar la ruta')
        return
      }
      // Actualizar estado local con los nuevos órdenes
      if (data.paradas?.length) {
        const ordenMap = new Map<string, number>(
          data.paradas.map((p: { entregaId: string; orden: number; etaAcumuladaMin: number }) => [p.entregaId, p.orden])
        )
        const etaMap = new Map<string, number>(
          data.paradas.map((p: { pedidoId: string; etaAcumuladaMin: number }) => [p.pedidoId, p.etaAcumuladaMin])
        )
        setEntregas((prev) =>
          prev.map((e) => {
            const nuevoOrden = ordenMap.get(e.id)
            if (nuevoOrden == null) return e
            const pedidoId = e.pedidos?.id
            const nuevoEta = pedidoId ? etaMap.get(pedidoId) : undefined
            return {
              ...e,
              orden_en_ruta: nuevoOrden,
              duracion_estimada_min: nuevoEta ?? e.duracion_estimada_min,
              pedidos: e.pedidos && nuevoEta
                ? { ...e.pedidos, eta_minutos: nuevoEta }
                : e.pedidos,
            }
          })
        )
      }
    } catch {
      alert('Error de red al optimizar ruta')
    } finally {
      setOptimizando(null)
    }
  }

  function refrescar() {
    setRefreshing(true)
    startTransition(() => {
      router.refresh()
      // router.refresh() triggers SSC re-fetch; give it a moment then clear spinner
      setTimeout(() => setRefreshing(false), 1500)
    })
  }

  function toggleExpand(repartidorId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(repartidorId)) next.delete(repartidorId)
      else next.add(repartidorId)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200 p-4">
          <p className="text-xs text-zinc-400 font-medium mb-1">Activas ahora</p>
          <p className="text-3xl font-bold text-zinc-900">{totalActivas}</p>
          <p className="text-xs text-zinc-400 mt-1">entregas en curso</p>
        </div>
        <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4">
          <p className="text-xs text-orange-600 font-medium mb-1">En ruta</p>
          <p className="text-3xl font-bold text-orange-700">{totalEnRuta}</p>
          <p className="text-xs text-orange-500 mt-1">yendo al cliente</p>
        </div>
        <div className="bg-green-50 rounded-2xl border border-green-100 p-4">
          <p className="text-xs text-green-600 font-medium mb-1">Entregadas hoy</p>
          <p className="text-3xl font-bold text-green-700">{totalEntregas}</p>
          <p className="text-xs text-green-500 mt-1">completadas</p>
        </div>
      </div>

      {/* Acciones globales */}
      <div className="flex justify-end">
        <button
          onClick={refrescar}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Sin asignar */}
      {sinAsignar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              {sinAsignar.length} entrega{sinAsignar.length > 1 ? 's' : ''} sin repartidor asignado
            </p>
          </div>
          <div className="space-y-2">
            {sinAsignar.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{e.pedidos?.nombre_cliente ?? '—'}</p>
                  <p className="text-xs text-zinc-400">{e.pedidos?.numero_pedido} · {e.pedidos?.direccion_entrega ?? 'Sin dirección'}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_ENTREGA[e.estado]?.color ?? 'bg-zinc-100 text-zinc-600')}>
                  {ESTADO_ENTREGA[e.estado]?.label ?? e.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grupos por repartidor */}
      {grupos.length === 0 && sinAsignar.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-zinc-200">
          <Package className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Sin entregas activas</p>
          <p className="text-sm text-zinc-400 mt-1">Aquí verás las rutas de tus repartidores en tiempo real</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const isExpanded = expandidos.has(g.repartidor.id)
            const pendientes = g.entregas.filter((e) => ['pendiente', 'carga', 'en_ruta'].includes(e.estado))
            const completadas = g.entregas.filter((e) => ['entregado', 'fallida'].includes(e.estado))
            const isOptimizando = optimizando === g.repartidor.id

            return (
              <div key={g.repartidor.id} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                {/* Cabecera del repartidor */}
                <div className="px-5 py-4 border-b border-zinc-100">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-zinc-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900 text-sm">{g.repartidor.nombre}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {g.vehiculo && (
                            <span className="text-xs text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full font-medium">
                              {g.vehiculo.nombre}
                            </span>
                          )}
                          <span className="text-xs text-zinc-400">
                            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {completadas.length} hoy
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Optimizar solo si hay ≥2 pendientes */}
                      {pendientes.length >= 2 && (
                        <button
                          onClick={() => optimizarRuta(g.repartidor.id)}
                          disabled={isOptimizando}
                          title="Reordenar paradas por distancia óptima (nearest-neighbor)"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 transition disabled:opacity-50"
                        >
                          {isOptimizando
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Route className="w-3.5 h-3.5" />
                          }
                          Optimizar ruta
                        </button>
                      )}
                      <button
                        onClick={() => toggleExpand(g.repartidor.id)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de paradas */}
                <div className="divide-y divide-zinc-50">
                  {g.entregas
                    .filter((e) => isExpanded || ['pendiente', 'carga', 'en_ruta'].includes(e.estado))
                    .map((e, i) => {
                      const info    = ESTADO_ENTREGA[e.estado] ?? ESTADO_ENTREGA['pendiente']
                      const pedido  = e.pedidos
                      const etaMin  = pedido?.eta_minutos ?? null

                      return (
                        <div key={e.id} className="px-5 py-3.5 flex items-start gap-3">
                          {/* Número de parada */}
                          <div className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                            e.estado === 'entregado' ? 'bg-green-100 text-green-700' :
                            e.estado === 'fallida'   ? 'bg-red-100 text-red-600' :
                            e.estado === 'en_ruta'   ? 'bg-orange-100 text-orange-700' :
                            'bg-zinc-100 text-zinc-600'
                          )}>
                            {e.estado === 'entregado'
                              ? <CheckCircle className="w-3.5 h-3.5" />
                              : (e.orden_en_ruta ?? i + 1)
                            }
                          </div>

                          {/* Info del pedido */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-zinc-900 truncate">
                                {pedido?.nombre_cliente ?? '—'}
                              </p>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', info.color)}>
                                {info.label}
                              </span>
                            </div>
                            {pedido?.direccion_entrega && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                                <p className="text-xs text-zinc-400 truncate">{pedido.direccion_entrega}</p>
                              </div>
                            )}
                            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                              <span className="text-xs font-mono text-zinc-400">{pedido?.numero_pedido}</span>
                              {pedido?.total != null && (
                                <span className="text-xs font-medium text-zinc-700">{formatPEN(pedido.total)}</span>
                              )}
                              {etaMin != null && e.estado !== 'entregado' && (
                                <span className="flex items-center gap-0.5 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full font-medium">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatEta(etaMin)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>

                {/* Mostrar/ocultar completadas */}
                {completadas.length > 0 && (
                  <button
                    onClick={() => toggleExpand(g.repartidor.id)}
                    className="w-full px-5 py-2.5 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition border-t border-zinc-100 text-center"
                  >
                    {isExpanded
                      ? `Ocultar ${completadas.length} completada${completadas.length > 1 ? 's' : ''}`
                      : `Ver ${completadas.length} completada${completadas.length > 1 ? 's' : ''}`
                    }
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
