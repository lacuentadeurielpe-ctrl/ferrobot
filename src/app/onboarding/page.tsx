'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Plus, X, CheckCircle } from 'lucide-react'

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié',
  jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

interface ZonaForm {
  nombre: string
  tiempo_estimado_min: number
}

export default function OnboardingPage() {
  const router = useRouter()

  const [paso, setPaso] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Datos del negocio
  const [form, setForm] = useState({
    nombre: '',
    direccion: '',
    telefono_whatsapp: '',
    horario_apertura: '08:00',
    horario_cierre: '18:00',
    dias_atencion: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as string[],
    formas_pago: [] as string[],
    mensaje_bienvenida: '',
    mensaje_fuera_horario: '',
  })

  // Zonas de delivery
  const [zonas, setZonas] = useState<ZonaForm[]>([{ nombre: '', tiempo_estimado_min: 60 }])
  const [nuevaFormaPago, setNuevaFormaPago] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function toggleDia(dia: string) {
    setForm((prev) => ({
      ...prev,
      dias_atencion: prev.dias_atencion.includes(dia)
        ? prev.dias_atencion.filter((d) => d !== dia)
        : [...prev.dias_atencion, dia],
    }))
  }

  function agregarFormaPago() {
    const pago = nuevaFormaPago.trim()
    if (!pago || form.formas_pago.includes(pago)) return
    setForm((prev) => ({ ...prev, formas_pago: [...prev.formas_pago, pago] }))
    setNuevaFormaPago('')
  }

  function quitarFormaPago(pago: string) {
    setForm((prev) => ({ ...prev, formas_pago: prev.formas_pago.filter((p) => p !== pago) }))
  }

  function agregarZona() {
    setZonas((prev) => [...prev, { nombre: '', tiempo_estimado_min: 60 }])
  }

  function actualizarZona(idx: number, campo: keyof ZonaForm, valor: string | number) {
    setZonas((prev) => prev.map((z, i) => (i === idx ? { ...z, [campo]: valor } : z)))
  }

  function quitarZona(idx: number) {
    setZonas((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    setError(null)

    // Validaciones básicas
    if (!form.nombre.trim()) { setError('El nombre de la ferretería es obligatorio.'); return }
    if (!form.telefono_whatsapp.trim()) { setError('El número de WhatsApp es obligatorio.'); return }
    if (form.dias_atencion.length === 0) { setError('Selecciona al menos un día de atención.'); return }

    setLoading(true)

    // Cliente creado dentro del handler para evitar instanciación durante prerender
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Crear la ferretería
    const { data: ferreteria, error: errFerreteria } = await supabase
      .from('ferreterias')
      .insert({
        owner_id: user.id,
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim() || null,
        telefono_whatsapp: form.telefono_whatsapp.trim(),
        horario_apertura: form.horario_apertura,
        horario_cierre: form.horario_cierre,
        dias_atencion: form.dias_atencion,
        formas_pago: form.formas_pago,
        mensaje_bienvenida: form.mensaje_bienvenida.trim() || null,
        mensaje_fuera_horario: form.mensaje_fuera_horario.trim() || null,
        onboarding_completo: true,
      })
      .select()
      .single()

    if (errFerreteria) {
      if (errFerreteria.message.includes('telefono_whatsapp')) {
        setError('Ese número de WhatsApp ya está registrado en el sistema.')
      } else {
        setError('Error al guardar la información. Inténtalo de nuevo.')
      }
      setLoading(false)
      return
    }

    // Crear las zonas de delivery que tengan nombre
    const zonasValidas = zonas.filter((z) => z.nombre.trim())
    if (zonasValidas.length > 0) {
      await supabase.from('zonas_delivery').insert(
        zonasValidas.map((z) => ({
          ferreteria_id: ferreteria.id,
          nombre: z.nombre.trim(),
          tiempo_estimado_min: z.tiempo_estimado_min,
        }))
      )
    }

    router.push('/dashboard')
    router.refresh()
  }

  // ── RENDER ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Encabezado */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configura tu ferretería</h1>
          <p className="text-sm text-gray-500 mt-1">
            Completa los datos para empezar a usar el bot de WhatsApp
          </p>
        </div>

        {/* Indicador de pasos */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition
                ${paso > n ? 'bg-green-500 text-white' : paso === n ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {paso > n ? <CheckCircle className="w-4 h-4" /> : n}
              </div>
              {n < 3 && <div className={`w-12 h-0.5 ${paso > n ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {/* ── PASO 1: Datos del negocio ── */}
          {paso === 1 && (
            <div className="space-y-5">
              <h2 className="font-semibold text-gray-900">Datos del negocio</h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la ferretería <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Ej: Ferretería Don Mario"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    name="direccion"
                    value={form.direccion}
                    onChange={handleChange}
                    placeholder="Ej: Jr. Los Ferreros 123, Lima"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="telefono_whatsapp"
                    value={form.telefono_whatsapp}
                    onChange={handleChange}
                    placeholder="Ej: 51987654321 (con código de país)"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Debe coincidir con el número configurado en YCloud
                  </p>
                </div>
              </div>

              {/* Días de atención */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Días de atención <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DIAS.map((dia) => (
                    <button
                      key={dia}
                      type="button"
                      onClick={() => toggleDia(dia)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
                        ${form.dias_atencion.includes(dia)
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {DIAS_LABEL[dia]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horario */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora de apertura
                  </label>
                  <input
                    type="time"
                    name="horario_apertura"
                    value={form.horario_apertura}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora de cierre
                  </label>
                  <input
                    type="time"
                    name="horario_cierre"
                    value={form.horario_cierre}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
              </div>

              {/* Formas de pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Formas de pago aceptadas
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={nuevaFormaPago}
                    onChange={(e) => setNuevaFormaPago(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarFormaPago())}
                    placeholder="Ej: Yape, Efectivo, Transferencia..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                  <button
                    type="button"
                    onClick={agregarFormaPago}
                    className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.formas_pago.map((pago) => (
                    <span key={pago} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full">
                      {pago}
                      <button onClick={() => quitarFormaPago(pago)} className="hover:text-orange-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 2: Zonas de delivery ── */}
          {paso === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">Zonas de delivery</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Define las zonas donde haces entregas y el tiempo estimado. Puedes saltarte esto si no haces delivery.
                </p>
              </div>

              <div className="space-y-3">
                {zonas.map((zona, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input
                      value={zona.nombre}
                      onChange={(e) => actualizarZona(idx, 'nombre', e.target.value)}
                      placeholder={`Ej: Cercado, Miraflores, Surco...`}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        value={zona.tiempo_estimado_min}
                        onChange={(e) => actualizarZona(idx, 'tiempo_estimado_min', parseInt(e.target.value) || 60)}
                        min={1}
                        className="w-20 px-2 py-2 rounded-lg border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                      />
                      <span className="text-xs text-gray-500">min</span>
                    </div>
                    {zonas.length > 1 && (
                      <button
                        onClick={() => quitarZona(idx)}
                        className="text-gray-400 hover:text-red-500 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={agregarZona}
                className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 font-medium transition"
              >
                <Plus className="w-4 h-4" />
                Agregar zona
              </button>
            </div>
          )}

          {/* ── PASO 3: Mensajes del bot ── */}
          {paso === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">Mensajes del bot</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Personaliza cómo saludará el bot a tus clientes. Puedes editarlos después.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensaje de bienvenida
                </label>
                <textarea
                  name="mensaje_bienvenida"
                  value={form.mensaje_bienvenida}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Ej: ¡Hola! Soy el asistente de Ferretería Don Mario. ¿En qué le puedo ayudar hoy?"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensaje fuera de horario
                </label>
                <textarea
                  name="mensaje_fuera_horario"
                  value={form.mensaje_fuera_horario}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Ej: Gracias por escribirnos. En este momento estamos cerrados. Atendemos de lunes a sábado de 8am a 6pm. Le responderemos en cuanto abramos."
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
                />
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-xs text-orange-700">
                Si dejas estos campos en blanco, el bot usará mensajes predeterminados que puedes cambiar en Configuración.
              </div>
            </div>
          )}

          {/* Error global */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Botones de navegación */}
          <div className="flex justify-between mt-8">
            <button
              type="button"
              onClick={() => setPaso((p) => p - 1)}
              disabled={paso === 1}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-0 transition"
            >
              Atrás
            </button>

            {paso < 3 ? (
              <button
                type="button"
                onClick={() => setPaso((p) => p + 1)}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg text-sm transition"
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Guardando...' : 'Empezar a usar FerreBot'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
