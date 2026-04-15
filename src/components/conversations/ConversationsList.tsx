'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, truncar } from '@/lib/utils'
import { Bot, MessageSquare, Search, X } from 'lucide-react'

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

export default function ConversationsList({ inicial, ferreteriaId }: ConversationsListProps) {
  const router = useRouter()
  const params = useParams()
  const conversacionActiva = params?.id as string | undefined

  const [conversaciones, setConversaciones] = useState(inicial)
  const [busqueda, setBusqueda] = useState('')

  const conversacionesFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return conversaciones
    return conversaciones.filter((conv) => {
      const nombre = conv.clientes?.nombre?.toLowerCase() ?? ''
      const tel = conv.clientes?.telefono ?? ''
      return nombre.includes(q) || tel.includes(q)
    })
  }, [conversaciones, busqueda])

  // Suscripción Realtime a nuevos mensajes y cambios en conversaciones
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`conversaciones-${ferreteriaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversaciones',
          filter: `ferreteria_id=eq.${ferreteriaId}`,
        },
        () => {
          // Recargar la lista cuando cambia una conversación
          router.refresh()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ferreteriaId, router])

  function getNombreCliente(conv: ConversacionItem) {
    return conv.clientes?.nombre ?? conv.clientes?.telefono ?? 'Cliente'
  }

  function getTimeAgo(fecha: string) {
    const diff = Date.now() - new Date(fecha).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'ahora'
    if (min < 60) return `${min}m`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-gray-100 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 px-1">Conversaciones</h2>
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 transition"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {conversacionesFiltradas.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {busqueda ? 'Sin resultados' : 'Sin conversaciones aún'}
          </div>
        ) : (
          conversacionesFiltradas.map((conv) => (
            <button
              key={conv.id}
              onClick={() => router.push(`/dashboard/conversations/${conv.id}`)}
              className={cn(
                'w-full text-left px-4 py-3 hover:bg-gray-50 transition',
                conversacionActiva === conv.id && 'bg-orange-50 border-r-2 border-orange-500'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Indicador de estado del bot */}
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0 mt-1',
                    conv.bot_pausado ? 'bg-orange-400' : 'bg-green-400'
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {getNombreCliente(conv)}
                    </p>
                    {conv.ultimo_mensaje && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {conv.rol_ultimo === 'dueno' ? '(Tú) ' : ''}
                        {truncar(conv.ultimo_mensaje, 40)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-gray-400">{getTimeAgo(conv.ultima_actividad)}</span>
                  {conv.bot_pausado && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                      Tú
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
