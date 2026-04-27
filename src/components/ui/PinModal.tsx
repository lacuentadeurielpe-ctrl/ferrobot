'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PinModalProps {
  open: boolean
  onClose: () => void
  /** ID del miembro cuyo PIN se verifica */
  miembroId: string
  /** Callback cuando el PIN es correcto */
  onSuccess: () => void
  /** Texto que describe la acción sensible a confirmar */
  accion?: string
}

/**
 * Modal de 4 dígitos PIN — verifica contra /api/empleados/[id]/pin (PUT).
 * Se usa para confirmar acciones sensibles (cancelar pedido, cambiar permisos, etc.)
 */
export default function PinModal({ open, onClose, miembroId, onSuccess, accion }: PinModalProps) {
  const [digits, setDigits]   = useState(['', '', '', ''])
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', ''])
      setError(null)
      setTimeout(() => refs[0].current?.focus(), 80)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const next = [...digits]
    next[index] = value
    setDigits(next)
    setError(null)
    if (value && index < 3) {
      refs[index + 1].current?.focus()
    }
    // Auto-submit cuando el 4to dígito se ingresa
    if (index === 3 && value) {
      const pin = [...next.slice(0, 3), value].join('')
      if (pin.length === 4) submitPin(pin)
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus()
    }
    if (e.key === 'Enter') {
      const pin = digits.join('')
      if (pin.length === 4) submitPin(pin)
    }
  }

  async function submitPin(pin: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/empleados/${miembroId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const json = await res.json()
      if (json.valido) {
        onSuccess()
        onClose()
      } else if (json.sin_pin) {
        setError('No tienes un PIN configurado. Pide al dueño que lo establezca.')
      } else {
        setError('PIN incorrecto. Inténtalo de nuevo.')
        setDigits(['', '', '', ''])
        setTimeout(() => refs[0].current?.focus(), 80)
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-950 leading-tight">Confirmar con PIN</p>
              {accion && (
                <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">{accion}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dígitos */}
        <div className="px-5 pb-5">
          <div className="flex justify-center gap-3 mb-4">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={refs[i]}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                className={cn(
                  'w-12 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition',
                  'bg-zinc-50 text-zinc-950',
                  error
                    ? 'border-red-300 bg-red-50'
                    : d
                      ? 'border-zinc-900 bg-white'
                      : 'border-zinc-200 focus:border-zinc-400',
                  loading && 'opacity-50 cursor-not-allowed'
                )}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center mb-3">{error}</p>
          )}

          <button
            onClick={() => { const pin = digits.join(''); if (pin.length === 4) submitPin(pin) }}
            disabled={digits.join('').length !== 4 || loading}
            className="w-full py-2.5 rounded-xl bg-zinc-950 text-white text-sm font-semibold
                       hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
