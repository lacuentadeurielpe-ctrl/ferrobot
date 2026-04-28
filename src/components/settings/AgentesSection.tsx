'use client'

import { useState } from 'react'
import { Cpu, Save, Check, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentesActivos {
  ventas?:       boolean
  comprobantes?: boolean
  upsell?:       boolean
  crm?:          boolean
}

interface Props {
  inicial: AgentesActivos
}

const AGENTES = [
  {
    key:   'ventas' as const,
    label: 'Ventas',
    desc:  'Cotizaciones, pedidos, modificaciones y ventana de gracia post-confirmación',
    tools: 'guardar_cotizacion · crear_pedido · modificar_pedido · agregar_a_pedido_reciente',
    advertencia: 'Sin este agente el bot solo puede consultar productos y responder preguntas.',
  },
  {
    key:   'comprobantes' as const,
    label: 'Comprobantes',
    desc:  'Genera y envía boletas, facturas, notas de venta y proformas por WhatsApp',
    tools: 'solicitar_comprobante',
    advertencia: null,
  },
  {
    key:   'upsell' as const,
    label: 'Upsell',
    desc:  'Sugiere productos complementarios cuando el cliente cotiza (máx. 2 por turno)',
    tools: 'sugerir_complementario',
    advertencia: null,
  },
  {
    key:   'crm' as const,
    label: 'Memoria CRM',
    desc:  'Recuerda preferencias, zona habitual y datos que el cliente menciona explícitamente',
    tools: 'guardar_dato_cliente · historial_cliente',
    advertencia: null,
  },
]

export default function AgentesSection({ inicial }: Props) {
  // Semántica opt-out: campo ausente = true
  const [form, setForm] = useState<Required<AgentesActivos>>({
    ventas:       inicial.ventas       !== false,
    comprobantes: inicial.comprobantes !== false,
    upsell:       inicial.upsell       !== false,
    crm:          inicial.crm          !== false,
  })

  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  function toggle(campo: keyof AgentesActivos) {
    setForm((prev) => ({ ...prev, [campo]: !prev[campo] }))
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
        body:    JSON.stringify({ agentes_activos: form }),
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

  const activosCount = Object.values(form).filter(Boolean).length

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Cpu className="w-5 h-5 text-zinc-600" />
        <h2 className="font-semibold text-zinc-900">Agentes del bot</h2>
      </div>

      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-xl px-4 py-3 flex gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
        <span>
          Activa o desactiva grupos de funcionalidades. Los agentes desactivados simplemente no están
          disponibles para el bot — no afectan el resto del sistema. Las tools de consulta básica
          (buscar productos, horario, stock) siempre están activas.
        </span>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        {AGENTES.map((agente) => {
          const activo = form[agente.key]
          return (
            <div
              key={agente.key}
              className={cn(
                'rounded-xl border p-4 transition',
                activo ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50 opacity-70'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-zinc-900">{agente.label}</p>
                    {activo ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                        Activo
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-400 border border-zinc-200">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{agente.desc}</p>
                  <p className="text-[10px] text-zinc-300 mt-1 font-mono">{agente.tools}</p>
                  {!activo && agente.advertencia && (
                    <p className="text-[11px] text-amber-600 mt-1.5">{agente.advertencia}</p>
                  )}
                </div>

                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={activo}
                  onClick={() => toggle(agente.key)}
                  className={cn(
                    'shrink-0 relative w-10 h-5.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
                    activo ? 'bg-zinc-900' : 'bg-zinc-200'
                  )}
                  style={{ height: '1.375rem' }}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                      activo ? 'translate-x-[1.375rem]' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {activosCount === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          Sin agentes activos el bot solo responderá consultas básicas con lenguaje libre.
        </p>
      )}

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
