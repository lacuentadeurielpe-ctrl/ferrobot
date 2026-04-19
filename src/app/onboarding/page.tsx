'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Plus, X, CheckCircle } from 'lucide-react'
import type { TipoRuc, RegimenTributario } from '@/types/database'
import type { RucInfo } from '@/lib/sunat/ruc'

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié',
  jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

interface ZonaForm {
  nombre: string
  tiempo_estimado_min: number
}

interface TipoRucOption {
  value: TipoRuc
  label: string
  sublabel: string
  icon: string
}

const TIPO_RUC_OPTIONS: TipoRucOption[] = [
  {
    value: 'sin_ruc',
    label: 'Sin RUC',
    sublabel: 'Solo notas de venta internas (sin validez SUNAT)',
    icon: '🧾',
  },
  {
    value: 'ruc10',
    label: 'RUC 10 — Persona Natural',
    sublabel: 'Emite boletas electrónicas (RER, RMT, RUS)',
    icon: '👤',
  },
  {
    value: 'ruc20',
    label: 'RUC 20 — Empresa (EIRL / SAC / SRL)',
    sublabel: 'Emite boletas y facturas electrónicas',
    icon: '🏢',
  },
]

export default function OnboardingPage() {
  const router = useRouter()

  // paso 0 = selección RUC, 1 = datos negocio, 2 = zonas, 3 = mensajes
  const [paso, setPaso] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 0 — tipo RUC
  const [tipoRuc, setTipoRuc] = useState<TipoRuc>('sin_ruc')
  const [ruc, setRuc] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [regimen, setRegimen] = useState<RegimenTributario | ''>('')
  const [repLegalNombre, setRepLegalNombre] = useState('')
  const [repLegalDni, setRepLegalDni] = useState('')

  // Verificación RUC SUNAT
  const [rucVerificando, setRucVerificando]   = useState(false)
  const [rucVerificado,  setRucVerificado]    = useState<RucInfo | null>(null)
  const [rucError,       setRucError]         = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Consulta automática cuando RUC llega a 11 dígitos
  useEffect(() => {
    const rucLimpio = ruc.replace(/\D/g, '')
    if (rucLimpio.length !== 11) {
      setRucVerificado(null)
      setRucError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setRucVerificando(true)
      setRucVerificado(null)
      setRucError(null)
      try {
        const res = await fetch('/api/sunat/ruc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ruc: rucLimpio }),
        })
        const data = await res.json()
        if (!res.ok) {
          setRucError(data.error ?? 'RUC no encontrado')
        } else {
          setRucVerificado(data)
          // Autocompletar razón social si el campo está vacío
          if (!razonSocial.trim()) setRazonSocial(data.razonSocial)
          // Sugerir tipo RUC si aún es el default
          if (tipoRuc === 'sin_ruc') setTipoRuc(data.tipoRucSugerido)
        }
      } catch {
        setRucError('Error de conexión al verificar RUC')
      } finally {
        setRucVerificando(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruc])

  // Paso 1 — datos del negocio
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

  // Paso 2 — zonas de delivery
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

  function avanzarDesdePaso0() {
    setError(null)
    if (tipoRuc !== 'sin_ruc') {
      if (!ruc.trim() || ruc.trim().length !== 11) {
        setError('Ingresa un RUC válido de 11 dígitos.')
        return
      }
      if (!razonSocial.trim()) {
        setError('La razón social es obligatoria.')
        return
      }
      if (!regimen) {
        setError('Selecciona el régimen tributario.')
        return
      }
      if (tipoRuc === 'ruc20' && !repLegalNombre.trim()) {
        setError('El nombre del representante legal es obligatorio para empresas.')
        return
      }
    }
    setPaso(1)
  }

  async function handleSubmit() {
    setError(null)

    if (!form.nombre.trim()) { setError('El nombre de la ferretería es obligatorio.'); return }
    if (!form.telefono_whatsapp.trim()) { setError('El número de WhatsApp es obligatorio.'); return }
    if (form.dias_atencion.length === 0) { setError('Selecciona al menos un día de atención.'); return }

    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

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
        // Facturación
        tipo_ruc: tipoRuc,
        ruc: tipoRuc !== 'sin_ruc' ? ruc.trim() : null,
        razon_social: tipoRuc !== 'sin_ruc' ? razonSocial.trim() : null,
        regimen_tributario: regimen || null,
        representante_legal_nombre: tipoRuc === 'ruc20' ? repLegalNombre.trim() || null : null,
        representante_legal_dni: tipoRuc === 'ruc20' ? repLegalDni.trim() || null : null,
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

  // Indicador de pasos: 0-3 (4 pasos total)
  const TOTAL_PASOS = 4

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
          {Array.from({ length: TOTAL_PASOS }, (_, i) => i).map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition
                ${paso > n ? 'bg-green-500 text-white' : paso === n ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {paso > n ? <CheckCircle className="w-4 h-4" /> : n + 1}
              </div>
              {n < TOTAL_PASOS - 1 && (
                <div className={`w-10 h-0.5 ${paso > n ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {/* ── PASO 0: Tipo de RUC ── */}
          {paso === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">¿Cómo emites comprobantes?</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Esto determina qué tipo de documentos puede generar tu bot. Puedes cambiarlo después en Configuración.
                </p>
              </div>

              <div className="space-y-3">
                {TIPO_RUC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setTipoRuc(opt.value); setError(null) }}
                    className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border-2 transition-colors ${
                      tipoRuc === opt.value
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl mt-0.5">{opt.icon}</span>
                    <div>
                      <p className={`font-medium text-sm ${tipoRuc === opt.value ? 'text-orange-700' : 'text-gray-800'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.sublabel}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Campos adicionales según tipo RUC */}
              {tipoRuc !== 'sin_ruc' && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos tributarios</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        RUC <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          value={ruc}
                          onChange={(e) => {
                            setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))
                            setRucVerificado(null)
                            setRucError(null)
                          }}
                          placeholder="20123456789"
                          maxLength={11}
                          className={`w-full px-3 py-2 pr-8 rounded-lg border text-sm text-gray-900 focus:outline-none focus:ring-2 transition ${
                            rucVerificado
                              ? rucVerificado.activo
                                ? 'border-green-400 focus:ring-green-300'
                                : 'border-yellow-400 focus:ring-yellow-300'
                              : rucError
                              ? 'border-red-400 focus:ring-red-300'
                              : 'border-gray-200 focus:ring-orange-400'
                          }`}
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                          {rucVerificando && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                          {!rucVerificando && rucVerificado && rucVerificado.activo && (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          )}
                          {!rucVerificando && rucError && (
                            <span className="text-red-500 text-xs">✕</span>
                          )}
                        </div>
                      </div>
                      {rucVerificado && (
                        <p className={`text-xs mt-1 ${rucVerificado.activo ? 'text-green-600' : 'text-yellow-600'}`}>
                          {rucVerificado.activo
                            ? `✓ ${rucVerificado.tipoContribuyente} — ACTIVO/HABIDO`
                            : `⚠ ${rucVerificado.estado} / ${rucVerificado.condicion}`}
                        </p>
                      )}
                      {rucError && (
                        <p className="text-xs text-red-500 mt-1">{rucError}</p>
                      )}
                    </div>

                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Régimen <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={regimen}
                        onChange={(e) => setRegimen(e.target.value as RegimenTributario | '')}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                      >
                        <option value="">Seleccionar...</option>
                        {tipoRuc === 'ruc10' && (
                          <>
                            <option value="rer">RER</option>
                            <option value="rmt">RMT</option>
                            <option value="rus">RUS (Nuevo RUS)</option>
                          </>
                        )}
                        {tipoRuc === 'ruc20' && (
                          <>
                            <option value="rer">RER</option>
                            <option value="rmt">RMT</option>
                            <option value="general">Régimen General</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Razón social <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value)}
                        placeholder={tipoRuc === 'ruc10' ? 'Ej: PÉREZ GARCÍA JUAN' : 'Ej: FERRETERÍA DON MARIO E.I.R.L.'}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                      />
                    </div>

                    {/* Representante legal — solo RUC20 */}
                    {tipoRuc === 'ruc20' && (
                      <>
                        <div className="col-span-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Representante legal</p>
                        </div>
                        <div className="col-span-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre completo <span className="text-red-500">*</span>
                          </label>
                          <input
                            value={repLegalNombre}
                            onChange={(e) => setRepLegalNombre(e.target.value)}
                            placeholder="Ej: Juan Pérez García"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
                          <input
                            value={repLegalDni}
                            onChange={(e) => setRepLegalDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder="12345678"
                            maxLength={8}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                    💡 Necesitarás credenciales de Nubefact para emitir comprobantes electrónicos. Puedes configurarlas después en Configuración → Facturación.
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora de apertura</label>
                  <input
                    type="time"
                    name="horario_apertura"
                    value={form.horario_apertura}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora de cierre</label>
                  <input
                    type="time"
                    name="horario_cierre"
                    value={form.horario_cierre}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Formas de pago aceptadas</label>
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
                      placeholder="Ej: Cercado, Miraflores, Surco..."
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
                      <button onClick={() => quitarZona(idx)} className="text-gray-400 hover:text-red-500 transition">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de bienvenida</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje fuera de horario</label>
                <textarea
                  name="mensaje_fuera_horario"
                  value={form.mensaje_fuera_horario}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Ej: Gracias por escribirnos. En este momento estamos cerrados. Atendemos de lunes a sábado de 8am a 6pm."
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
              onClick={() => { setPaso((p) => p - 1); setError(null) }}
              disabled={paso === 0}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-0 transition"
            >
              Atrás
            </button>

            {paso < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (paso === 0) { avanzarDesdePaso0() }
                  else { setError(null); setPaso((p) => p + 1) }
                }}
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
