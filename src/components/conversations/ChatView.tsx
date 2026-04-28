'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFecha, formatHora } from '@/lib/utils'
import { Send, RefreshCw, ArrowLeft, Bot, Mic } from 'lucide-react'

interface Mensaje {
  id: string
  role: string
  contenido: string
  tipo?: string | null
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

// ── Estilos de burbuja por rol ────────────────────────────────────────────────
function getBubbleStyle(role: string) {
  if (role === 'cliente')
    return {
      wrap:   'mr-12 items-start',
      bubble: 'bg-white border border-zinc-200 text-zinc-900 rounded-2xl rounded-tl-none shadow-sm',
      time:   'text-zinc-400',
    }
  if (role === 'dueno')
    return {
      wrap:   'ml-12 items-end',
      bubble: 'bg-zinc-900 text-white rounded-2xl rounded-tr-none',
      time:   'text-zinc-500',
    }
  // bot
  return {
    wrap:   'mr-12 items-start',
    bubble: 'bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-2xl rounded-tl-none',
    time:   'text-zinc-400',
  }
}

function getRoleLabel(role: string, primerNombre: string): string {
  if (role === 'cliente') return primerNombre
  if (role === 'bot')     return 'Bot'
  if (role === 'dueno')   return 'Tú'
  return role
}

// Cola de la burbuja (triángulo estilo WhatsApp)
function BubbleTail({ role }: { role: string }) {
  if (role === 'dueno') {
    return (
      <div className="absolute -right-[7px] top-0 w-0 h-0
        border-l-[8px] border-l-zinc-900
        border-b-[8px] border-b-transparent" />
    )
  }
  const color = role === 'bot' ? 'border-r-zinc-200' : 'border-r-white'
  return (
    <div className={cn(
      'absolute -left-[7px] top-0 w-0 h-0',
      'border-r-[8px]', color,
      'border-b-[8px] border-b-transparent'
    )} />
  )
}

export default function ChatView({ conversacion, mensajesIniciales, ferreteriaId }: ChatViewProps) {
  const router = useRouter()

  const [mensajes,   setMensajes]   = useState<Mensaje[]>(mensajesIniciales)
  const [botPausado, setBotPausado] = useState(conversacion.bot_pausado)
  const [texto,      setTexto]      = useState('')
  const [enviando,   setEnviando]   = useState(false)
  const [resumiendo, setResumiendo] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Scroll al fondo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`chat-${conversacion.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${conversacion.id}` },
        (payload) => {
          const nuevo = payload.new as Mensaje
          setMensajes((prev) => {
            if (prev.some((m) => m.id === nuevo.id)) return prev
            return [...prev, nuevo]
          })
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversaciones', filter: `id=eq.${conversacion.id}` },
        (payload) => {
          const updated = payload.new as { bot_pausado: boolean }
          setBotPausado(updated.bot_pausado)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversacion.id])

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  async function handleEnviar() {
    const contenido = texto.trim()
    if (!contenido || enviando) return

    setTexto('')
    setError(null)
    setEnviando(true)

    try {
      const res = await fetch(`/api/conversations/${conversacion.id}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ texto: contenido }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Error al enviar')
      }

      setBotPausado(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setTexto(contenido)
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  // ── Reactivar bot ───────────────────────────────────────────────────────────
  async function handleResumir() {
    setResumiendo(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${conversacion.id}/resume`, { method: 'POST' })
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

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  const nombreCliente = conversacion.clientes?.nombre ?? conversacion.clientes?.telefono ?? 'Cliente'
  const primerNombre  = nombreCliente.split(' ')[0]
  const telefono      = conversacion.clientes?.telefono ?? ''
  const iniciales     = nombreCliente.trim().split(' ').filter(Boolean)
    .slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')

  // Agrupación de mensajes consecutivos del mismo rol
  let lastDate  = ''
  let lastRole  = ''

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-zinc-100 bg-white flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">

          {/* Botón atrás — solo mobile */}
          <button
            onClick={() => router.push('/dashboard/conversations')}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg
                       hover:bg-zinc-100 transition text-zinc-500 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 select-none">
            <span className="text-xs font-bold text-zinc-600">{iniciales || '?'}</span>
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 leading-tight truncate">
              {nombreCliente}
            </p>
            {telefono && (
              <p className="text-[11px] text-zinc-400 tabular-nums">+{telefono}</p>
            )}
          </div>
        </div>

        {/* Estado del bot */}
        <div className="flex items-center gap-2 shrink-0">
          {botPausado ? (
            <>
              <span className="hidden sm:inline text-[11px] text-zinc-500 bg-zinc-100
                              px-2.5 py-1 rounded-full font-medium border border-zinc-200">
                Tú al control
              </span>
              <button
                onClick={handleResumir}
                disabled={resumiendo}
                className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-1.5 rounded-lg
                           flex items-center gap-1.5 transition disabled:opacity-50 font-medium"
              >
                <RefreshCw className={cn('w-3 h-3', resumiendo && 'animate-spin')} />
                <span className="hidden sm:inline">Activar bot</span>
                <span className="sm:hidden">Activar</span>
              </button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 bg-zinc-50
                            px-2.5 py-1 rounded-full border border-zinc-100 font-medium">
              <Bot className="w-3 h-3" />
              <span className="hidden sm:inline">Bot activo</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Mensajes ───────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ background: 'linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%)' }}
      >
        {mensajes.length === 0 && (
          <p className="text-center text-xs text-zinc-300 mt-16 select-none">
            Sin mensajes aún
          </p>
        )}

        {mensajes.map((msg, idx) => {
          const fechaStr  = formatFecha(msg.created_at)
          const showDate  = fechaStr !== lastDate
          const isFirst   = msg.role !== lastRole  // primer mensaje del grupo
          const isLast    = idx === mensajes.length - 1 || mensajes[idx + 1]?.role !== msg.role

          lastDate = fechaStr
          lastRole = msg.role

          const styles = getBubbleStyle(msg.role)
          const isDueno = msg.role === 'dueno'

          return (
            <div key={msg.id}>
              {/* Separador de fecha */}
              {showDate && (
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-zinc-200/60" />
                  <span className="text-[10px] text-zinc-400 font-medium bg-white
                                   px-2.5 py-1 rounded-full border border-zinc-200 select-none">
                    {fechaStr}
                  </span>
                  <div className="flex-1 h-px bg-zinc-200/60" />
                </div>
              )}

              {/* Burbuja */}
              <div className={cn(
                'flex flex-col mb-0.5',
                isLast && 'mb-3',
                styles.wrap
              )}>
                {/* Label del emisor — solo en el primer mensaje del grupo */}
                {isFirst && (
                  <span className={cn(
                    'text-[10px] font-semibold mb-1 px-1 select-none flex items-center gap-1',
                    isDueno ? 'self-end text-zinc-400' : 'text-zinc-400'
                  )}>
                    {msg.role === 'bot' && <Bot className="w-2.5 h-2.5" />}
                    {getRoleLabel(msg.role, primerNombre)}
                  </span>
                )}

                {/* Burbuja con cola */}
                <div className={cn('relative', isDueno ? 'self-end' : 'self-start')}>
                  {/* Cola — solo en primer mensaje del grupo */}
                  {isFirst && <BubbleTail role={msg.role} />}

                  <div className={cn(
                    'px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed',
                    'max-w-[min(400px,72vw)]',
                    styles.bubble
                  )}>
                    {/* Indicador de audio transcrito */}
                    {msg.tipo === 'audio' && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 mb-1.5 select-none">
                        <Mic className="w-3 h-3" />
                        Audio transcrito
                      </span>
                    )}
                    {msg.contenido}
                    {/* Hora inline al final del mensaje */}
                    <span className={cn(
                      'text-[10px] ml-2 float-right mt-1 tabular-nums select-none',
                      styles.time
                    )}>
                      {formatHora(msg.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          {error}
        </div>
      )}

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-zinc-100 bg-white shrink-0">
        {botPausado && (
          <p className="text-[11px] text-zinc-400 mb-2 select-none">
            El bot está pausado — tus mensajes llegan directamente al cliente
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); autoResize(e.target) }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje… (Enter para enviar)"
            rows={1}
            className="flex-1 resize-none bg-zinc-50 border border-zinc-200 rounded-2xl
                       px-4 py-2.5 text-sm text-zinc-900
                       focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900
                       transition placeholder:text-zinc-400 min-h-[44px] max-h-32 leading-relaxed"
          />
          <button
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
            className="w-11 h-11 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white
                       flex items-center justify-center transition
                       disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {enviando
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
        <p className="text-[10px] text-zinc-300 mt-1.5 select-none">
          Shift+Enter para nueva línea
        </p>
      </div>

    </div>
  )
}
