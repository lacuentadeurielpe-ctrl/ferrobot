'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFecha, formatHora } from '@/lib/utils'
import { Bot, User, Send, RefreshCw, Phone, AlertCircle } from 'lucide-react'

interface Mensaje {
  id: string
  role: string
  contenido: string
  created_at: string
}

interface Conversacion {
  id: string
  estado: string
  bot_pausado: boolean
  clientes: { nombre: string | null; telefono: string } | null
  [key: string]: unknown
}

interface ChatViewProps {
  conversacion: Conversacion
  mensajesIniciales: Mensaje[]
  ferreteriaId: string
}

export default function ChatView({ conversacion, mensajesIniciales, ferreteriaId }: ChatViewProps) {
  const router = useRouter()
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales)
  const [botPausado, setBotPausado] = useState(conversacion.bot_pausado)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resumiendo, setResumiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll al fondo al montar o agregar mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Realtime — escuchar nuevos mensajes de esta conversación
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`chat-${conversacion.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          setMensajes((prev) => {
            // Evitar duplicados
            if (prev.some((m) => m.id === nuevo.id)) return prev
            return [...prev, nuevo]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversaciones',
          filter: `id=eq.${conversacion.id}`,
        },
        (payload) => {
          const updated = payload.new as { bot_pausado: boolean }
          setBotPausado(updated.bot_pausado)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversacion.id])

  async function handleEnviar() {
    const contenido = texto.trim()
    if (!contenido || enviando) return

    setTexto('')
    setError(null)
    setEnviando(true)

    try {
      const res = await fetch(`/api/conversations/${conversacion.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: contenido }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Error al enviar')
      }

      setBotPausado(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setTexto(contenido) // Restaurar texto
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  async function handleResumir() {
    setResumiendo(true)
    setError(null)

    try {
      const res = await fetch(`/api/conversations/${conversacion.id}/resume`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Error al reactivar el bot')
      setBotPausado(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setResumiendo(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  const nombreCliente = conversacion.clientes?.nombre ?? conversacion.clientes?.telefono ?? 'Cliente'
  const telefono = conversacion.clientes?.telefono ?? ''

  function getRoleLabel(role: string) {
    if (role === 'cliente') return 'Cliente'
    if (role === 'bot') return 'Bot'
    if (role === 'dueno') return 'Tú'
    return role
  }

  function getRoleStyle(role: string) {
    if (role === 'cliente') return 'bg-white border border-gray-200 text-gray-800 self-start'
    if (role === 'dueno') return 'bg-orange-500 text-white self-end'
    return 'bg-gray-100 text-gray-700 self-start'
  }

  // Agrupar mensajes por fecha
  let lastDate = ''

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{nombreCliente}</p>
            {telefono && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {telefono}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {botPausado ? (
            <>
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Bot pausado
              </span>
              <button
                onClick={handleResumir}
                disabled={resumiendo}
                className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3 h-3', resumiendo && 'animate-spin')} />
                Reactivar bot
              </button>
            </>
          ) : (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium flex items-center gap-1">
              <Bot className="w-3 h-3" />
              Bot activo
            </span>
          )}
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {mensajes.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-8">Sin mensajes aún</p>
        )}

        {mensajes.map((msg) => {
          const fecha = new Date(msg.created_at)
          const fechaStr = formatFecha(msg.created_at)
          const showDate = fechaStr !== lastDate
          lastDate = fechaStr

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">{fechaStr}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              <div className={cn('flex flex-col max-w-[75%]', msg.role === 'dueno' ? 'ml-auto items-end' : 'mr-auto items-start')}>
                <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                  {getRoleLabel(msg.role)} · {formatHora(msg.created_at)}
                </span>
                <div className={cn('px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words', getRoleStyle(msg.role))}>
                  {msg.contenido}
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
        {botPausado && (
          <p className="text-xs text-orange-600 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Estás en control — el bot no responderá hasta que lo reactives
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          />
          <button
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
            className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
