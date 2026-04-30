'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Phone, Clock, MapPin, CheckCircle, Truck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// Leaflet requiere el DOM — cargar solo en browser
const TrackingMap = dynamic(() => import('./TrackingMap'), { ssr: false })

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TrackingData {
  entregaId:    string
  estado:       string
  pedido: {
    numero_pedido:     string | null
    nombre_cliente:    string | null
    direccion_entrega: string | null
    total:             number | null
    estado:            string | null
    cliente_lat:       number | null
    cliente_lng:       number | null
  }
  repartidor: {
    nombre:   string | null
    telefono: string | null
    gps_lat:  number | null
    gps_lng:  number | null
    gps_at:   string | null
  }
  ferreteria: {
    nombre:   string | null
    telefono: string | null
  }
  eta_minutos:  number | null
  distancia_km: number | null
  eta_actual:   string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(min: number | null): string {
  if (!min || min <= 0) return 'En camino'
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`
}

function formatHora(isoString: string | null): string {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  })
}

function secsAtras(isoString: string | null): string {
  if (!isoString) return ''
  const diff = Math.round((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60)  return `Hace ${diff}s`
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}min`
  return `Hace ${Math.floor(diff / 3600)}h`
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function TrackingView({
  initial,
  entregaId,
}: {
  initial:   TrackingData
  entregaId: string
}) {
  const [data,        setData]        = useState(initial)
  const [refreshing,  setRefreshing]  = useState(false)
  const [ultimaActu,  setUltimaActu]  = useState(new Date())

  const fetchTracking = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/tracking/${entregaId}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setData(d)
        setUltimaActu(new Date())
      }
    } finally {
      setRefreshing(false)
    }
  }, [entregaId])

  // Polling cada 30 segundos
  useEffect(() => {
    if (data.estado === 'entregado' || data.estado === 'fallida') return
    const id = setInterval(fetchTracking, 30_000)
    return () => clearInterval(id)
  }, [data.estado, fetchTracking])

  const entregado = data.estado === 'entregado'
  const tieneGPS  = data.repartidor.gps_lat != null && data.repartidor.gps_lng != null
  const etaHora   = data.eta_actual ? formatHora(data.eta_actual) : null

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className={cn(
        'px-4 pt-6 pb-4 text-white',
        entregado ? 'bg-green-500' : 'bg-orange-500',
      )}>
        <div className="max-w-sm mx-auto">
          <p className="text-sm font-medium opacity-80 mb-0.5">{data.ferreteria.nombre ?? 'Ferretería'}</p>
          <h1 className="text-xl font-bold mb-1">
            {entregado ? '¡Pedido entregado! ✅' : 'Tu pedido está en camino 🚚'}
          </h1>
          <p className="text-sm opacity-80">Pedido {data.pedido.numero_pedido}</p>
        </div>
      </div>

      {/* ── ETA Badge ───────────────────────────────────────────────────────── */}
      {!entregado && (
        <div className="bg-white border-b border-zinc-100 px-4 py-3">
          <div className="max-w-sm mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-lg font-bold text-zinc-900">{formatEta(data.eta_minutos)}</p>
                {etaHora && <p className="text-xs text-zinc-400">Llega aprox. a las {etaHora}</p>}
              </div>
            </div>
            {data.distancia_km && (
              <div className="text-right">
                <p className="text-sm font-semibold text-zinc-700">{data.distancia_km} km</p>
                <p className="text-xs text-zinc-400">distancia restante</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mapa ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ minHeight: '300px', maxHeight: '420px' }}>
        {tieneGPS || data.pedido.cliente_lat ? (
          <TrackingMap
            repartidorLat={data.repartidor.gps_lat}
            repartidorLng={data.repartidor.gps_lng}
            clienteLat={data.pedido.cliente_lat}
            clienteLng={data.pedido.cliente_lng}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-100">
            <MapPin className="w-10 h-10 text-zinc-300 mb-2" />
            <p className="text-sm text-zinc-400">Mapa disponible cuando el repartidor inicie la ruta</p>
          </div>
        )}

        {/* Indicador GPS en vivo */}
        {tieneGPS && !entregado && (
          <div className="absolute top-3 left-3 bg-white rounded-full px-2.5 py-1 shadow-md flex items-center gap-1.5 text-xs font-medium text-zinc-700">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            En vivo · {secsAtras(data.repartidor.gps_at)}
          </div>
        )}

        {/* Botón actualizar */}
        <button
          onClick={fetchTracking}
          disabled={refreshing}
          className="absolute top-3 right-3 bg-white rounded-full p-2 shadow-md text-zinc-500 hover:text-zinc-800 transition disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* ── Info del pedido ──────────────────────────────────────────────────── */}
      <div className="px-4 py-4 max-w-sm mx-auto w-full space-y-3">

        {/* Dirección */}
        {data.pedido.direccion_entrega && (
          <div className="bg-white rounded-2xl border border-zinc-200 px-4 py-3 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400 font-medium mb-0.5">Dirección de entrega</p>
              <p className="text-sm text-zinc-800">{data.pedido.direccion_entrega}</p>
            </div>
          </div>
        )}

        {/* Repartidor */}
        <div className="bg-white rounded-2xl border border-zinc-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Truck className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium">Repartidor</p>
              <p className="text-sm font-semibold text-zinc-800">{data.repartidor.nombre ?? 'En camino'}</p>
            </div>
          </div>
          {data.repartidor.telefono && (
            <a
              href={`tel:${data.repartidor.telefono}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-medium hover:bg-green-100 transition"
            >
              <Phone className="w-3.5 h-3.5" />
              Llamar
            </a>
          )}
        </div>

        {/* Estado entregado */}
        {entregado && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">¡Entregado exitosamente!</p>
              <p className="text-sm text-green-600 mt-0.5">Gracias por tu compra en {data.ferreteria.nombre}</p>
            </div>
          </div>
        )}

        {/* Última actualización */}
        <p className="text-center text-xs text-zinc-400 pb-2">
          Actualizado a las {ultimaActu.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
          {!entregado && ' · Se actualiza cada 30 seg'}
        </p>
      </div>
    </div>
  )
}
