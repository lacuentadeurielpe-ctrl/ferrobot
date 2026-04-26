'use client'

import { useState } from 'react'
import { CheckCircle, Clock, XCircle, Gift, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { formatPEN, formatFecha } from '@/lib/utils'

export interface PagoItem {
  id: string
  metodo: string
  monto: number
  moneda: string
  numero_operacion: string | null
  nombre_pagador: string | null
  ultimos_digitos: string | null
  fecha_pago: string | null
  banco_origen: string | null
  estado: string
  url_captura: string | null
  confianza_extraccion: number | null
  notas: string | null
  registrado_at: string
  cliente: { id: string; nombre: string | null; telefono: string } | null
  pedido: { id: string; numero_pedido: string; total: number } | null
}

const ESTADO_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; color: string; bg: string }> = {
  confirmado_auto:    { label: 'Confirmado',    icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
  pendiente_revision: { label: 'Por revisar',   icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-50' },
  a_favor:            { label: 'Crédito a favor', icon: Gift,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  rechazado:          { label: 'Rechazado',     icon: XCircle,     color: 'text-red-500',    bg: 'bg-red-50' },
}

const METODO_LABEL: Record<string, string> = {
  yape: '💜 Yape',
  plin: '🟢 Plin',
  transferencia: '🏦 Transferencia',
  efectivo: '💵 Efectivo',
  otro: '💳 Otro',
}

const TABS = [
  { key: '',                   label: 'Todos' },
  { key: 'pendiente_revision', label: 'Por revisar' },
  { key: 'confirmado_auto',    label: 'Confirmados' },
  { key: 'a_favor',            label: 'Créditos' },
  { key: 'rechazado',          label: 'Rechazados' },
]

export default function PagosView({ pagos, esDueno }: { pagos: PagoItem[]; esDueno: boolean }) {
  const [tabActivo, setTabActivo] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [pagosState, setPagosState] = useState<PagoItem[]>(pagos)

  const filtrados = tabActivo
    ? pagosState.filter((p) => p.estado === tabActivo)
    : pagosState

  async function accion(pagoId: string, accion: 'aprobar' | 'rechazar', pedidoId?: string) {
    if (!confirm(accion === 'aprobar' ? '¿Confirmar este pago?' : '¿Rechazar este pago?')) return
    setProcesando(pagoId)
    try {
      const res = await fetch(`/api/pagos/${pagoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, pedido_id: pedidoId }),
      })
      if (res.ok) {
        const nuevoEstado = accion === 'aprobar' ? 'confirmado_auto' : 'rechazado'
        setPagosState((prev) => prev.map((p) => p.id === pagoId ? { ...p, estado: nuevoEstado } : p))
        setExpandido(null)
      }
    } finally {
      setProcesando(null)
    }
  }

  if (pagosState.length === 0) {
    return (
      <div className="text-center py-16">
        <CreditCard className="w-10 h-10 mx-auto mb-3 text-zinc-200" />
        <p className="text-sm text-zinc-500">Aún no hay pagos registrados</p>
        <p className="text-xs text-zinc-400 mt-1">Los comprobantes que envíen los clientes por WhatsApp aparecerán aquí</p>
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTabActivo(t.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tabActivo === t.key
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {t.label}
            {t.key && (
              <span className="ml-1.5 text-[10px] bg-zinc-100 text-zinc-500 rounded-full px-1.5 py-0.5 font-medium">
                {pagosState.filter((p) => p.estado === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.length === 0 && (
          <p className="text-center text-sm text-zinc-400 py-8">Sin pagos en esta categoría</p>
        )}
        {filtrados.map((pago) => {
          const est = ESTADO_CONFIG[pago.estado] ?? ESTADO_CONFIG.rechazado
          const EIcon = est.icon
          const abierto = expandido === pago.id

          return (
            <div key={pago.id} className="border border-zinc-200 rounded-2xl overflow-hidden">
              {/* Fila resumen */}
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-50 transition text-left"
                onClick={() => setExpandido(abierto ? null : pago.id)}
              >
                {/* Estado icon */}
                <div className={`w-8 h-8 rounded-full ${est.bg} flex items-center justify-center shrink-0`}>
                  <EIcon className={`w-4 h-4 ${est.color}`} />
                </div>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-zinc-900 tabular-nums">
                      {formatPEN(pago.monto)}
                    </span>
                    <span className="text-xs text-zinc-500">{METODO_LABEL[pago.metodo] ?? pago.metodo}</span>
                    {pago.pedido && (
                      <span className="text-xs bg-zinc-100 rounded-full px-1.5 py-0.5 text-zinc-600 font-medium">
                        {pago.pedido.numero_pedido}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">
                    {pago.cliente?.nombre ?? pago.cliente?.telefono ?? 'Cliente desconocido'}
                    {pago.nombre_pagador && ` · ${pago.nombre_pagador}`}
                    {' · '}
                    {formatFecha(pago.registrado_at)}
                  </div>
                </div>

                {/* Estado badge + chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${est.bg} ${est.color}`}>
                    {est.label}
                  </span>
                  {abierto ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </div>
              </button>

              {/* Detalle expandible */}
              {abierto && (
                <div className="border-t border-zinc-100 bg-zinc-50 p-4 space-y-3">
                  {/* Datos del pago */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {pago.numero_operacion && (
                      <div>
                        <span className="text-zinc-400">N° operación</span>
                        <p className="font-mono text-zinc-700">{pago.numero_operacion}</p>
                      </div>
                    )}
                    {pago.banco_origen && (
                      <div>
                        <span className="text-zinc-400">Banco</span>
                        <p className="text-zinc-700">{pago.banco_origen}</p>
                      </div>
                    )}
                    {pago.ultimos_digitos && (
                      <div>
                        <span className="text-zinc-400">Últimos dígitos</span>
                        <p className="font-mono text-zinc-700">…{pago.ultimos_digitos}</p>
                      </div>
                    )}
                    {pago.confianza_extraccion !== null && (
                      <div>
                        <span className="text-zinc-400">Confianza Vision</span>
                        <p className="text-zinc-700">{Math.round(pago.confianza_extraccion * 100)}%</p>
                      </div>
                    )}
                    {pago.pedido && (
                      <div>
                        <span className="text-zinc-400">Pedido vinculado</span>
                        <p className="text-zinc-700">{pago.pedido.numero_pedido} — {formatPEN(pago.pedido.total)}</p>
                      </div>
                    )}
                    {pago.notas && (
                      <div className="col-span-2">
                        <span className="text-zinc-400">Notas</span>
                        <p className="text-zinc-600">{pago.notas}</p>
                      </div>
                    )}
                  </div>

                  {/* Link captura */}
                  {pago.url_captura && (
                    <a
                      href={pago.url_captura}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver captura original
                    </a>
                  )}

                  {/* Acciones (solo dueño + estado pendiente) */}
                  {esDueno && pago.estado === 'pendiente_revision' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        disabled={!!procesando}
                        onClick={() => accion(pago.id, 'aprobar', pago.pedido?.id)}
                        className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition"
                      >
                        {procesando === pago.id ? 'Procesando…' : 'Aprobar pago'}
                      </button>
                      <button
                        disabled={!!procesando}
                        onClick={() => accion(pago.id, 'rechazar')}
                        className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl border border-red-200 disabled:opacity-50 transition"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Fix: import CreditCard for empty state
function CreditCard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  )
}
