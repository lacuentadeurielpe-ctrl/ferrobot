'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn, formatPEN } from '@/lib/utils'
import {
  Phone, ExternalLink, ShoppingCart, Bot, UserRound,
  MessageCircle, RefreshCw, ChevronRight, Clock,
} from 'lucide-react'

interface Pedido {
  id: string
  numero_pedido: string
  estado: string
  total: number
  created_at: string
  modalidad: string
}

interface ContextPanelProps {
  conversacion: {
    id: string
    bot_pausado: boolean
    created_at: string
  }
  cliente: { nombre: string | null; telefono: string } | null
  clienteId: string | null
  pedidos: Pedido[]
  totalMensajes: number
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente:      'Pendiente',
  confirmado:     'Confirmado',
  en_preparacion: 'Preparando',
  enviado:        'Enviado',
  entregado:      'Entregado',
  cancelado:      'Cancelado',
}

const ESTADO_DOT: Record<string, string> = {
  pendiente:      'bg-amber-400',
  confirmado:     'bg-blue-400',
  en_preparacion: 'bg-violet-400',
  enviado:        'bg-cyan-400',
  entregado:      'bg-emerald-400',
  cancelado:      'bg-zinc-300',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 30)  return `hace ${d} días`
  const m = Math.floor(d / 30)
  if (m < 12)  return `hace ${m} mes${m > 1 ? 'es' : ''}`
  return `hace ${Math.floor(m / 12)} año${Math.floor(m / 12) > 1 ? 's' : ''}`
}

export default function ContextPanel({
  conversacion,
  cliente,
  clienteId,
  pedidos,
  totalMensajes,
}: ContextPanelProps) {
  const router = useRouter()
  const [botPausado, setBotPausado] = useState(conversacion.bot_pausado)
  const [toggling, setToggling]     = useState(false)

  const nombreCliente = cliente?.nombre ?? cliente?.telefono ?? 'Cliente'
  const iniciales     = nombreCliente.trim().split(' ').filter(Boolean)
    .slice(0, 2).map(w => w[0].toUpperCase()).join('')

  async function handleToggleBot() {
    setToggling(true)
    try {
      if (botPausado) {
        const res = await fetch(`/api/conversations/${conversacion.id}/resume`, { method: 'POST' })
        if (res.ok) { setBotPausado(false); router.refresh() }
      } else {
        // Pausar enviando un mensaje de dueño vacío no es lo correcto;
        // usamos la API de resume al revés — pausamos actualizando directamente.
        // Por ahora simplemente marcar localmente (el dueño puede tomar control
        // enviando un mensaje desde el chat, lo que pausa automáticamente).
        setBotPausado(true)
      }
    } finally {
      setToggling(false)
    }
  }

  return (
    <aside className="hidden xl:flex w-72 shrink-0 border-l border-zinc-100 bg-white flex-col overflow-y-auto">

      {/* ── Control del bot ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 select-none">
          Bot
        </p>

        <div className={cn(
          'flex items-center justify-between px-3.5 py-3 rounded-2xl border transition',
          botPausado
            ? 'bg-zinc-50 border-zinc-200'
            : 'bg-zinc-950 border-zinc-900'
        )}>
          <div className="flex items-center gap-2.5">
            <Bot className={cn('w-4 h-4 shrink-0', botPausado ? 'text-zinc-400' : 'text-white')} />
            <div>
              <p className={cn('text-xs font-semibold leading-tight', botPausado ? 'text-zinc-700' : 'text-white')}>
                {botPausado ? 'Tú al control' : 'Bot activo'}
              </p>
              <p className={cn('text-[10px] leading-tight mt-0.5', botPausado ? 'text-zinc-400' : 'text-zinc-400')}>
                {botPausado ? 'El bot no responde' : 'Responde automáticamente'}
              </p>
            </div>
          </div>

          {botPausado && (
            <button
              onClick={handleToggleBot}
              disabled={toggling}
              className="flex items-center gap-1.5 text-[11px] font-semibold bg-zinc-900 text-white
                         px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', toggling && 'animate-spin')} />
              Activar
            </button>
          )}
        </div>
      </div>

      {/* ── Cliente ───────────────────────────────────────────────────���─── */}
      <div className="px-5 pt-4 pb-4 border-b border-zinc-100">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 select-none">
          Cliente
        </p>

        {/* Avatar + nombre */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 select-none border border-zinc-200">
            <span className="text-sm font-bold text-zinc-600">{iniciales || '?'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-950 truncate leading-tight">{nombreCliente}</p>
            {cliente?.telefono && (
              <p className="text-xs text-zinc-400 tabular-nums mt-0.5">+{cliente.telefono}</p>
            )}
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="space-y-0.5">
          {cliente?.telefono && (
            <a
              href={`tel:+${cliente.telefono}`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium
                         text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition"
            >
              <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              Llamar al cliente
            </a>
          )}
          {clienteId && (
            <Link
              href={`/dashboard/clientes/${clienteId}`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium
                         text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition"
            >
              <UserRound className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              Ver perfil completo
              <ExternalLink className="w-3 h-3 ml-auto text-zinc-300" />
            </Link>
          )}
        </div>
      </div>

      {/* ── Pedidos recientes ────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-4 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
            Pedidos
          </p>
          {clienteId && (
            <Link
              href={`/dashboard/ventas?tab=pedidos`}
              className="text-[10px] font-medium text-zinc-400 hover:text-zinc-700 transition flex items-center gap-1"
            >
              Ver todos
              <ChevronRight className="w-2.5 h-2.5" />
            </Link>
          )}
        </div>

        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center py-4 gap-1.5">
            <ShoppingCart className="w-6 h-6 text-zinc-200" />
            <p className="text-xs text-zinc-300 text-center">Sin pedidos aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/ventas?tab=pedidos`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition group"
              >
                <span className={cn('w-2 h-2 rounded-full shrink-0', ESTADO_DOT[p.estado] ?? 'bg-zinc-300')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 truncate">{p.numero_pedido}</p>
                  <p className="text-[11px] text-zinc-400">
                    {ESTADO_LABEL[p.estado] ?? p.estado} · {timeAgo(p.created_at)}
                  </p>
                </div>
                <p className="text-xs font-semibold text-zinc-700 tabular-nums shrink-0">
                  {formatPEN(p.total)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats de la conversación ────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-4">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 select-none">
          Esta conversación
        </p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs text-zinc-500">
            <MessageCircle className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            <span>{totalMensajes} mensaje{totalMensajes !== 1 ? 's' : ''} en total</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-zinc-500">
            <Clock className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            <span>Desde {timeAgo(conversacion.created_at)}</span>
          </div>
        </div>
      </div>

    </aside>
  )
}
