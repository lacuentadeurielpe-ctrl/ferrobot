'use client'

import { useState } from 'react'
import { TrendingUp, Save, Check, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConversionData {
  cierre_cotizacion_activo: boolean
  umbral_upsell_soles:      number
}

interface Props {
  inicial: ConversionData
}

export default function ConversionSection({ inicial }: Props) {
  const [form, setForm] = useState<ConversionData>({
    cierre_cotizacion_activo: inicial.cierre_cotizacion_activo,
    umbral_upsell_soles:      inicial.umbral_upsell_soles,
  })

  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  function setField<K extends keyof ConversionData>(campo: K, valor: ConversionData[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setGuardado(false)
    setError(null)
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cierre_cotizacion_activo: form.cierre_cotizacion_activo,
          umbral_upsell_soles:      Math.max(0, Math.round(form.umbral_upsell_soles)),
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Error al guardar')
        return
      }
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-zinc-600" />
        <h2 className="font-semibold text-zinc-900">Conversión y ventas</h2>
      </div>

      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-xl px-4 py-3 flex gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
        <span>
          Ajusta cómo el bot convierte consultas en pedidos. El bot siempre usa respuesta precisa
          o consultiva según el contexto — esto controla el comportamiento de cierre y las
          sugerencias de upsell.
        </span>
      </div>

      {/* Cierre natural */}
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 mb-0.5">Cierre natural post-cotización</p>
            <p className="text-xs text-zinc-500">
              Después de cada cotización, el bot agrega una pregunta corta para activar la decisión
              del cliente: <em>"¿Lo armamos como pedido?"</em>, <em>"¿Te lo reservo?"</em>, etc.
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Solo se pregunta una vez por cotización — nunca repite si el cliente ya respondió.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.cierre_cotizacion_activo}
            onClick={() => setField('cierre_cotizacion_activo', !form.cierre_cotizacion_activo)}
            className={cn(
              'shrink-0 relative w-10 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
              form.cierre_cotizacion_activo ? 'bg-zinc-900' : 'bg-zinc-200'
            )}
            style={{ height: '1.375rem' }}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                form.cierre_cotizacion_activo ? 'translate-x-[1.375rem]' : 'translate-x-0'
              )}
            />
          </button>
        </div>
        {form.cierre_cotizacion_activo && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['"¿Lo armamos?"', '"¿Te lo reservo?"', '"¿Seguimos?"', '"¿Procedo ya?"'].map((e) => (
              <span key={e} className="text-[10px] font-mono bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-full text-zinc-500">
                {e}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Umbral de upsell */}
      <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900 mb-0.5">Umbral para sugerencias de upsell</p>
          <p className="text-xs text-zinc-500">
            El bot solo sugiere productos complementarios cuando el total de la cotización supera este monto.
            Evita que el bot haga upsell en compras pequeñas donde resulta molesto.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500 shrink-0">S/</span>
          <input
            type="number"
            min={0}
            max={99999}
            step={10}
            value={form.umbral_upsell_soles}
            onChange={(e) => setField('umbral_upsell_soles', Math.max(0, parseInt(e.target.value) || 0))}
            className="w-28 text-sm px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition text-right"
          />
          <span className="text-xs text-zinc-400">
            {form.umbral_upsell_soles === 0
              ? 'Siempre activo (sin mínimo)'
              : `Solo en cotizaciones ≥ S/${form.umbral_upsell_soles.toLocaleString()}`}
          </span>
        </div>

        {/* Guía de referencia */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[{ label: 'Sin mínimo', val: 0 }, { label: 'S/50', val: 50 }, { label: 'S/100', val: 100 }, { label: 'S/200', val: 200 }].map((op) => (
            <button
              key={op.val}
              type="button"
              onClick={() => setField('umbral_upsell_soles', op.val)}
              className={cn(
                'text-xs px-3 py-1 rounded-full border transition',
                form.umbral_upsell_soles === op.val
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Guardar */}
      <div className="flex justify-end">
        <button
          onClick={guardar}
          disabled={guardando}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition',
            guardado
              ? 'bg-emerald-500 text-white'
              : 'bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {guardando ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>
          ) : guardado ? (
            <><Check className="w-3.5 h-3.5" /> Guardado</>
          ) : (
            <><Save className="w-3.5 h-3.5" /> Guardar cambios</>
          )}
        </button>
      </div>
    </div>
  )
}
