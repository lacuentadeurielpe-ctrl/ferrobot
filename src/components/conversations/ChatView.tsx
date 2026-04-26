'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFecha, formatHora } from '@/lib/utils'
import { Send, RefreshCw, ArrowLeft } from 'lucide-react'

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

// ── Estilos de burbuja por rol ─────────────────────────────────────────────────
function getBubbleStyle(role: string): string {
  if (role === 'cliente')
    return 'bg-zinc-100 text-zinc-900 self-start rounded-2xl rounded-tl-sm'
  if (role === 'dueno')
    return 'bg-zinc-900 text-white self-end rounded-2xl rounded-tr-sm'
  // bot
  return 'bg-white border border-zinc-200 text-zinc-700 self-start rounded-2xl rounded-tl-sm'
}

function getRoleLabel(role: string, primerNombre: string): string {
  if (role === 'cliente') return primerNombre
  if (role === 'bot')     return '🤖 Bot'
  if (role === 'dueno')   return 'Tú'
  return role
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

  // Auto-resize del textarea
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  const nombreCliente = conversacion.clientes?.nombre ?? conversacion.clientes?.telefono ?? 'Cliente'
  const primerNombre  = nombreCliente.split(' ')[0]
  const telefono      = conversacion.clientes?.telefono ?? ''

  let lastDate = ''

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
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 select-none">
            <span className="text-xs font-semibold text-zinc-600">
              {nombreCliente[0]?.toUpperCase() ?? '?'}
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 leading-tight truncate">
              {nombreCliente}
            </p>
            {telefono && (
              <p className="text-xs text-zinc-400 tabular-nums">{telefono}</p>
            )}
          </div>
        </div>

        {/* Estado del bot */}
        <div className="flex items-center gap-2 shrink-0">
          {botPausado ? (
            <>
              <span className="hidden sm:inline text-xs text-zinc-500 bg-zinc-100
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
            <span className="text-xs text-zinc-400 bg-zinc-50 px-2.5 py-1 rounded-full
                            border border-zinc-100 font-medium">
              🤖 Bot activo
            </span>
          )}
        </div>
      </div>

      {/* ── Mensajes ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1">

        {mensajes.length === 0 && (
          <p className="text-center text-xs text-zinc-300 mt-12 select-none">
            Sin mensajes aún
          </p>
        )}

        {mensajes.map((msg) => {
          const fechaStr = formatFecha(msg.created_at)
          const showDate = fechaStr !== lastDate
          lastDate = fechaStr

          return (
            <div key={msg.id}>
              {/* Separador de fecha */}
              {showDate && (
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-zinc-100" />
                  <span className="text-[11px] text-zinc-400 font-medium select-none">
                    {fechaStr}
                  </span>
                  <div className="flex-1 h-px bg-zinc-100" />
                </div>
              )}

              {/* Burbuja */}
              <div className={cn(
                'flex flex-col max-w-[72%] mb-1',
                msg.role === 'dueno' ? 'ml-auto items-end' : 'mr-auto items-start'
              )}>
                <span className="text-[10px] text-zinc-400 mb-1 px-1 select-none">
                  {getRoleLabel(msg.role, primerNombre)} · {formatHora(msg.created_at)}
                </span>
                <div className={cn(
                  'px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed',
                  getBubbleStyle(msg.role)
                )}>
                  {msg.contenido}
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
          {error}
        </div>
      )}

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-zinc-100 bg-white shrink-0">
        {botPausado && (
          <p className="text-xs text-zinc-400 mb-2 select-none">
            El bot no responderá hasta que lo reactives
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); autoResize(e.target) }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 resize-none bg-zinc-50 border border-zinc-200 rounded-xl
                       px-3.5 py-2.5 text-sm text-zinc-900
                       focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900
                       transition placeholder:text-zinc-400 min-h-[44px] max-h-32 leading-relaxed"
          />
          <button
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
            className="w-11 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white
                       flex items-center justify-center transition
                       disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  )
}
