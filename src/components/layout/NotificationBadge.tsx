'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface NotificationBadgeProps {
  ferreteriaId: string
  tipo: 'pedidos' | 'conversaciones' | 'cotizaciones'
  initialCount: number
}

export default function NotificationBadge({ ferreteriaId, tipo, initialCount }: NotificationBadgeProps) {
  const [count, setCount] = useState(initialCount)
  // Unique channel name per mount to avoid Supabase "already subscribed" error in StrictMode
  const channelName = useRef(`badge-${tipo}-${ferreteriaId}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const supabase = createClient()

    async function refresh() {
      if (tipo === 'pedidos') {
        const { count: n } = await supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .eq('ferreteria_id', ferreteriaId)
          .eq('estado', 'pendiente')
        setCount(n ?? 0)
      } else if (tipo === 'cotizaciones') {
        const { count: n } = await supabase
          .from('cotizaciones')
          .select('*', { count: 'exact', head: true })
          .eq('ferreteria_id', ferreteriaId)
          .eq('estado', 'pendiente_aprobacion')
        setCount(n ?? 0)
      } else {
        const { count: n } = await supabase
          .from('conversaciones')
          .select('*', { count: 'exact', head: true })
          .eq('ferreteria_id', ferreteriaId)
          .eq('bot_pausado', true)
        setCount(n ?? 0)
      }
    }

    const table = tipo === 'pedidos' ? 'pedidos' : tipo === 'cotizaciones' ? 'cotizaciones' : 'conversaciones'

    const channel = supabase
      .channel(channelName.current)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `ferreteria_id=eq.${ferreteriaId}`,
        },
        () => refresh()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ferreteriaId, tipo])

  if (count === 0) return null

  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none shrink-0">
      {count > 9 ? '9+' : count}
    </span>
  )
}
