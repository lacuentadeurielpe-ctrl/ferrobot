'use client'

import { useState } from 'react'
import { Bot, Save, Check, Loader2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PerfilBotData {
  tipo_negocio?:        string
  descripcion_negocio?: string
  tono_bot?:            string
  nombre_bot?:          string
}

interface Props {
  inicial: PerfilBotData
}

const TONOS = [
  { value: 'amigable_peruano', label: 'Amigable peruano', desc: 'Coloquial, cálido — "al toque", "ya pues", "con gusto"' },
  { value: 'formal',           label: 'Formal',           desc: 'Profesional y respetuoso — bueno para empresas' },
  { value: 'casual',           label: 'Casual',           desc: 'Desenfadado y cercano — bueno para tiendas jóvenes' },
]

export default function PerfilBotSection({ inicial }: Props) {
  const [form, setForm] = useState<PerfilBotData>({
    tipo_negocio:        inicial.tipo_negocio        ?? '',
    descripcion_negocio: inicial.descripcion_negocio ?? '',
    tono_bot:            inicial.tono_bot            ?? 'amigable_peruano',
    nombre_bot:          inicial.nombre_bot          ?? '',
  })

  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  function setField(campo: keyof PerfilBotData, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setGuardado(false)
    setError(null)
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const perfil_bot: PerfilBotData = {}
      if (form.tipo_negocio?.trim())        perfil_bot.tipo_negocio        = form.tipo_negocio.trim()
      if (form.descripcion_negocio?.trim()) perfil_bot.descripcion_negocio = form.descripcion_negocio.trim()
      if (form.tono_bot)                    perfil_bot.tono_bot            = form.tono_bot
      if (form.nombre_bot?.trim())          perfil_bot.nombre_bot          = form.nombre_bot.trim()

      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ perfil_bot }),
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
        <Bot className="w-5 h-5 text-zinc-600" />
        <h2 className="font-semibold text-zinc-900">Perfil del bot</h2>
      </div>

      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-xl px-4 py-3 flex gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
        <span>
          Personaliza cómo se presenta y comunica el bot. Esto le da contexto sobre tu negocio para
          responder mejor. Si no configuras nada, el bot usa respuestas genéricas igualmente funcionales.
        </span>
      </div>

      {/* Tipo de negocio */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1.5">
          Tipo de negocio
        </label>
        <input
          type="text"
          placeholder="ferretería, farmacia, bodega, librería, restaurante…"
          value={form.tipo_negocio}
          onChange={(e) => setField('tipo_negocio', e.target.value)}
          maxLength={60}
          className="w-full text-sm px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition"
        />
        <p className="text-xs text-zinc-400 mt-1">
          El bot se presentará como asistente de este tipo de negocio.
        </p>
      </div>

      {/* Nombre del bot */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1.5">
          Nombre del asistente <span className="text-zinc-400 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          placeholder="Ferrobot, BodegaBot, FarmaciaBot…"
          value={form.nombre_bot}
          onChange={(e) => setField('nombre_bot', e.target.value)}
          maxLength={40}
          className="w-full text-sm px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition"
        />
        <p className="text-xs text-zinc-400 mt-1">
          Si lo dejas vacío, el bot no se da un nombre propio.
        </p>
      </div>

      {/* Descripción del negocio / expertise */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1.5">
          Descripción y expertise del bot
        </label>
        <textarea
          rows={4}
          placeholder={
            'Ejemplo para ferretería:\n"Tienda de materiales de construcción en Lima Norte. Somos especialistas en fierro, cemento y acabados. Conocemos los productos para vivienda y obras medianas."'
          }
          value={form.descripcion_negocio}
          onChange={(e) => setField('descripcion_negocio', e.target.value)}
          maxLength={600}
          className="w-full text-sm px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition resize-none"
        />
        <p className="text-xs text-zinc-400 mt-1">
          Cuéntale al bot qué vende tu negocio y qué expertise debe demostrar. Esto mejora las recomendaciones.
          <span className="ml-1 text-zinc-300">{(form.descripcion_negocio ?? '').length}/600</span>
        </p>
      </div>

      {/* Tono */}
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-2">
          Tono de comunicación
        </label>
        <div className="space-y-2">
          {TONOS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setField('tono_bot', t.value)}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition',
                form.tono_bot === t.value
                  ? 'border-zinc-900 bg-zinc-950 text-white'
                  : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
                form.tono_bot === t.value ? 'border-white' : 'border-zinc-300'
              )}>
                {form.tono_bot === t.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold">{t.label}</p>
                <p className={cn('text-xs mt-0.5', form.tono_bot === t.value ? 'text-zinc-400' : 'text-zinc-400')}>
                  {t.desc}
                </p>
              </div>
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
