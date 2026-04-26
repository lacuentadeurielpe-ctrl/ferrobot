'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, truncar } from '@/lib/utils'
import { MessageSquare, Search, X } from 'lucide-react'

interface ConversacionItem {
  id: string
  estado: string
  bot_pausado: boolean
  ultima_actividad: string
  clientes: { nombre: string | null; telefono: string } | null
  ultimo_mensaje?: string
  rol_ultimo?: string
}

interface ConversationsListProps {
  inicial: ConversacionItem[]
  ferreteriaId: string
}

type Filtro = 'todos' | 'pausado' | 'bot'

function getInitials(nombre: string | null, telefono: string): string {
  if (nombre) {
    const words = nombre.trim().split(' ').filter(Boolean)
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return words[0]?.[0]?.toUpperCase() ?? '?'
  }
  return telefono.slice(-2)
}

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos',   label: 'Todos' },
  { id: 'pausado', label: 'Tú al control' },
  { id: 'bot',     label: 'Bot activo' },
]

export default function ConversationsList({ inicial, ferreteriaId }: ConversationsListProps) {
  const router               = useRouter()
  const params               = useParams()
  const conversacionActiva   = params?.id as string | undefined

  const [conversaciones, setConversaciones] = useState(inicial)
  const [busqueda, setBusqueda]             = useState('')
  const [filtro,   setFiltro]               = useState<Filtro>('todos')

  // ── Filtrado local ──────────────────────────────────────────────────────────
  const conversacionesFiltradas = useMemo(() => {
    let lista = conversaciones
    const q   = busqueda.toLowerCase().trim()

    if (q) {
      lista = lista.filter((conv) => {
        const nombre = conv.clientes?.nombre?.toLowerCase() ?? ''
        const tel    = conv.clientes?.telefono ?? ''
        return nombre.includes(q) || tel.includes(q)
      })
    }

    if (filtro === 'pausado') lista = lista.filter(c =>  c.bot_pausado)
    if (filtro === 'bot')     lista = lista.filter(c => !c.bot_pausado)

    return lista
  }, [conversaciones, busqueda, filtro])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`conversaciones-${ferreteriaId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'conversaciones', filter: `ferreteria_id=eq.${ferreteriaId}` },
        () => { router.refresh() }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes' },
        () => { router.refresh() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ferreteriaId, router])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getNombreCliente(conv: ConversacionItem) {
    return conv.clientes?.nombre ?? conv.clientes?.telefono ?? 'Cliente'
  }

  function getTimeAgo(fecha: string) {
    const diff = Date.now() - new Date(fecha).getTime()
    const min  = Math.floor(diff / 60_000)
    if (min < 1)  return 'ahora'
    if (min < 60) return `${min}m`
    const h = Math.floor(min / 60)
    if (h < 24)   return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-950 mb-3">Conversaciones</h2>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900
                       transition placeholder:text-zinc-400"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex gap-1.5 mt-2.5">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition',
                filtro === f.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {conversacionesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <MessageSquare className="w-8 h-8 text-zinc-200 mb-3" />
            <p className="text-sm text-zinc-400">
              {busqueda
                ? 'Sin resultados para esa búsqueda'
                : filtro !== 'todos'
                  ? 'Sin conversaciones en este filtro'
                  : 'Sin conversaciones aún'}
            </p>
          </div>
        ) : (
          conversacionesFiltradas.map((conv) => {
            const nombre   = getNombreCliente(conv)
            const initials = getInitials(conv.clientes?.nombre ?? null, conv.clientes?.telefono ?? '')
            const isActive = conversacionActiva === conv.id

            return (
              <button
                key={conv.id}
                onClick={() => router.push(`/dashboard/conversations/${conv.id}`)}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors border-b border-zinc-50 last:border-0',
                  isActive ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                )}
              >
                <div className="flex items-center gap-3">

                  {/* Avatar con iniciales */}
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold select-none',
                    isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                  )}>
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        'text-sm truncate',
                        isActive ? 'font-semibold text-zinc-950' : 'font-medium text-zinc-900'
                      )}>
                        {nombre}
                      </p>
                      <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">
                        {getTimeAgo(conv.ultima_actividad)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-zinc-400 truncate">
                        {conv.rol_ultimo === 'dueno' && (
                          <span className="text-zinc-500">Tú: </span>
                        )}
                        {conv.ultimo_mensaje
                          ? truncar(conv.ultimo_mensaje, 36)
                          : <span className="italic">Sin mensajes</span>
                        }
                      </p>
                      {conv.bot_pausado && (
                        <span className="shrink-0 text-[10px] font-medium bg-zinc-100 text-zinc-500
                                        px-1.5 py-0.5 rounded-full border border-zinc-200">
                          Tú
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
