'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Plus, X, Save, Loader2, Check, Trash2, Upload, ImageOff, QrCode } from 'lucide-react'

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const DIAS_LABEL: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mié',
  jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
}

interface Zona {
  id: string
  nombre: string
  tiempo_estimado_min: number
}

const COLORES_PRESET = [
  { label: 'Azul corporativo', value: '#1e40af' },
  { label: 'Naranja', value: '#ea580c' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Gris oscuro', value: '#374151' },
  { label: 'Morado', value: '#7c3aed' },
]

interface DatosYape {
  numero: string
  qr_url: string | null
}

interface DatosTransferencia {
  banco: string
  cuenta: string
  cci: string | null
  titular: string
}

interface Ferreteria {
  nombre: string
  direccion: string | null
  telefono_whatsapp: string
  horario_apertura: string
  horario_cierre: string
  dias_atencion: string[]
  formas_pago: string[]
  mensaje_bienvenida: string | null
  mensaje_fuera_horario: string | null
  timeout_intervencion_dueno: number
  logo_url: string | null
  color_comprobante: string
  mensaje_comprobante: string | null
  telefono_dueno: string | null
  resumen_diario_activo: boolean
  datos_yape: DatosYape | null
  datos_transferencia: DatosTransferencia | null
  metodos_pago_activos: string[] | null
}

const TODOS_METODOS = [
  { key: 'efectivo', label: 'Efectivo', desc: 'Pago en efectivo al momento de la entrega' },
  { key: 'yape', label: 'Yape', desc: 'Transferencia instantánea por Yape' },
  { key: 'transferencia', label: 'Transferencia bancaria', desc: 'Depósito o transferencia a cuenta bancaria' },
  { key: 'tarjeta', label: 'Tarjeta / POS', desc: 'Pago con tarjeta de crédito o débito' },
  { key: 'credito', label: 'Crédito', desc: 'Pago diferido con límite acordado' },
]

interface SettingsFormProps {
  ferreteria: Ferreteria
  zonas: Zona[]
  margenMinimo?: number
}

type Tab = 'negocio' | 'horario' | 'bot' | 'zonas' | 'comprobante' | 'pagos'

export default function SettingsForm({ ferreteria, zonas: zonasIniciales, margenMinimo = 10 }: SettingsFormProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('negocio')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    nombre: ferreteria.nombre,
    direccion: ferreteria.direccion ?? '',
    telefono_whatsapp: ferreteria.telefono_whatsapp,
    horario_apertura: ferreteria.horario_apertura,
    horario_cierre: ferreteria.horario_cierre,
    dias_atencion: ferreteria.dias_atencion,
    formas_pago: ferreteria.formas_pago,
    mensaje_bienvenida: ferreteria.mensaje_bienvenida ?? '',
    mensaje_fuera_horario: ferreteria.mensaje_fuera_horario ?? '',
    timeout_intervencion_dueno: ferreteria.timeout_intervencion_dueno,
    margen_minimo_porcentaje: margenMinimo,
    color_comprobante: ferreteria.color_comprobante || '#1e40af',
    mensaje_comprobante: ferreteria.mensaje_comprobante ?? '',
    telefono_dueno: ferreteria.telefono_dueno ?? '',
    resumen_diario_activo: ferreteria.resumen_diario_activo ?? false,
  })

  const [nuevaFormaPago, setNuevaFormaPago] = useState('')
  const [zonas, setZonas] = useState<Zona[]>(zonasIniciales)
  const [nuevaZona, setNuevaZona] = useState({ nombre: '', tiempo_estimado_min: 60 })
  const [agregandoZona, setAgregandoZona] = useState(false)
  const [zonaError, setZonaError] = useState<string | null>(null)

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(ferreteria.logo_url)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pagos state
  const [metodosActivos, setMetodosActivos] = useState<string[]>(
    ferreteria.metodos_pago_activos ?? ['efectivo', 'yape', 'transferencia', 'tarjeta', 'credito']
  )
  const [datosYape, setDatosYape] = useState<DatosYape>(
    ferreteria.datos_yape ?? { numero: '', qr_url: null }
  )
  const [datosTransferencia, setDatosTransferencia] = useState<DatosTransferencia>(
    ferreteria.datos_transferencia ?? { banco: '', cuenta: '', cci: null, titular: '' }
  )
  const [subiendoQR, setSubiendoQR] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const qrInputRef = useRef<HTMLInputElement>(null)

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

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nombre: form.nombre.trim(),
          direccion: form.direccion.trim() || null,
          mensaje_bienvenida: form.mensaje_bienvenida.trim() || null,
          mensaje_fuera_horario: form.mensaje_fuera_horario.trim() || null,
          timeout_intervencion_dueno: Number(form.timeout_intervencion_dueno),
          margen_minimo_porcentaje: Number(form.margen_minimo_porcentaje),
          mensaje_comprobante: form.mensaje_comprobante.trim() || null,
          telefono_dueno: form.telefono_dueno.trim() || null,
          // Pagos
          metodos_pago_activos: metodosActivos,
          datos_yape: metodosActivos.includes('yape') && datosYape.numero.trim()
            ? { numero: datosYape.numero.trim(), qr_url: datosYape.qr_url }
            : null,
          datos_transferencia: metodosActivos.includes('transferencia') && datosTransferencia.banco.trim()
            ? {
                banco: datosTransferencia.banco.trim(),
                cuenta: datosTransferencia.cuenta.trim(),
                cci: datosTransferencia.cci?.trim() || null,
                titular: datosTransferencia.titular.trim(),
              }
            : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Error al guardar')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  async function agregarZona() {
    const nombre = nuevaZona.nombre.trim()
    if (!nombre) { setZonaError('El nombre es obligatorio'); return }
    setAgregandoZona(true)
    setZonaError(null)

    try {
      const res = await fetch('/api/settings/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaZona),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const zona = await res.json()
      setZonas((prev) => [...prev, zona])
      setNuevaZona({ nombre: '', tiempo_estimado_min: 60 })
    } catch (e) {
      setZonaError(e instanceof Error ? e.message : 'Error')
    } finally {
      setAgregandoZona(false)
    }
  }

  async function eliminarZona(id: string) {
    try {
      await fetch(`/api/settings/zones/${id}`, { method: 'DELETE' })
      setZonas((prev) => prev.filter((z) => z.id !== id))
    } catch {
      // silencioso
    }
  }

  async function actualizarZona(id: string, campo: 'nombre' | 'tiempo_estimado_min', valor: string | number) {
    setZonas((prev) => prev.map((z) => z.id === id ? { ...z, [campo]: valor } : z))
    try {
      await fetch(`/api/settings/zones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
    } catch {
      // silencioso — el estado local ya se actualizó
    }
  }

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoLogo(true)
    setLogoError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      setLogoUrl(url)
      router.refresh()
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Error subiendo logo')
    } finally {
      setSubiendoLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function eliminarLogo() {
    setSubiendoLogo(true)
    setLogoError(null)
    try {
      await fetch('/api/settings/logo', { method: 'DELETE' })
      setLogoUrl(null)
      router.refresh()
    } catch {
      setLogoError('Error eliminando logo')
    } finally {
      setSubiendoLogo(false)
    }
  }

  async function subirQR(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoQR(true)
    setQrError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/yape-qr', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      setDatosYape((prev) => ({ ...prev, qr_url: url }))
    } catch (e) {
      setQrError(e instanceof Error ? e.message : 'Error subiendo QR')
    } finally {
      setSubiendoQR(false)
      if (qrInputRef.current) qrInputRef.current.value = ''
    }
  }

  async function eliminarQR() {
    setSubiendoQR(true)
    setQrError(null)
    try {
      await fetch('/api/settings/yape-qr', { method: 'DELETE' })
      setDatosYape((prev) => ({ ...prev, qr_url: null }))
    } catch {
      setQrError('Error eliminando QR')
    } finally {
      setSubiendoQR(false)
    }
  }

  function toggleMetodo(key: string) {
    if (key === 'efectivo') return // efectivo siempre activo
    setMetodosActivos((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'negocio', label: 'Negocio' },
    { key: 'horario', label: 'Horario' },
    { key: 'zonas', label: 'Zonas de delivery' },
    { key: 'bot', label: 'Mensajes del bot' },
    { key: 'comprobante', label: 'Comprobante' },
    { key: 'pagos', label: 'Pagos' },
  ]

  return (
    <div className="max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
              tab === key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: NEGOCIO ── */}
      {tab === 'negocio' && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la ferretería <span className="text-red-500">*</span>
            </label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              name="direccion"
              value={form.direccion}
              onChange={handleChange}
              placeholder="Jr. Los Ferreros 123, Lima"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de WhatsApp
            </label>
            <input
              name="telefono_whatsapp"
              value={form.telefono_whatsapp}
              onChange={handleChange}
              placeholder="51987654321"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
            />
            <p className="text-xs text-gray-400 mt-1">Con código de país, sin el +</p>
          </div>

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
                  <button
                    onClick={() => setForm((p) => ({ ...p, formas_pago: p.formas_pago.filter((x) => x !== pago) }))}
                    className="hover:text-orange-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Resumen diario */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Resumen diario por WhatsApp</p>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">
                Tu número personal (para recibir el resumen)
              </label>
              <input
                name="telefono_dueno"
                value={form.telefono_dueno}
                onChange={handleChange}
                placeholder="51987654321"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <p className="text-xs text-gray-400 mt-1">Con código de país, sin el +</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.resumen_diario_activo}
                onClick={() => setForm((p) => ({ ...p, resumen_diario_activo: !p.resumen_diario_activo }))}
                className={cn(
                  'relative w-10 h-6 rounded-full transition-colors flex-shrink-0',
                  form.resumen_diario_activo ? 'bg-orange-500' : 'bg-gray-200'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form.resumen_diario_activo ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
              <span className="text-sm text-gray-700">
                Recibir resumen cada día a las 8pm
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ── TAB: HORARIO ── */}
      {tab === 'horario' && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Días de atención</label>
            <div className="flex gap-2 flex-wrap">
              {DIAS.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  onClick={() => toggleDia(dia)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition',
                    form.dias_atencion.includes(dia)
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reactivar bot tras inactividad del dueño
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                name="timeout_intervencion_dueno"
                value={form.timeout_intervencion_dueno}
                onChange={handleChange}
                min={1}
                max={1440}
                className="w-24 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <span className="text-sm text-gray-600">minutos sin respuesta del dueño</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              El bot se reactiva automáticamente si el dueño no escribe durante este tiempo.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB: ZONAS DE DELIVERY ── */}
      {tab === 'zonas' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            El bot usará estas zonas al confirmar pedidos con delivery.
          </p>

          {zonas.length === 0 && (
            <p className="text-sm text-gray-400 italic">Sin zonas configuradas</p>
          )}

          <div className="space-y-2">
            {zonas.map((zona) => (
              <div key={zona.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <input
                  value={zona.nombre}
                  onChange={(e) => actualizarZona(zona.id, 'nombre', e.target.value)}
                  onBlur={(e) => actualizarZona(zona.id, 'nombre', e.target.value)}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    value={zona.tiempo_estimado_min}
                    onChange={(e) => actualizarZona(zona.id, 'tiempo_estimado_min', parseInt(e.target.value) || 60)}
                    min={1}
                    className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-gray-900 text-center bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
                <button
                  onClick={() => eliminarZona(zona.id)}
                  className="text-gray-400 hover:text-red-500 transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Agregar nueva zona */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Nueva zona</p>
            <div className="flex items-center gap-3">
              <input
                value={nuevaZona.nombre}
                onChange={(e) => setNuevaZona((p) => ({ ...p, nombre: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && agregarZona()}
                placeholder="Nombre del distrito o zona"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  value={nuevaZona.tiempo_estimado_min}
                  onChange={(e) => setNuevaZona((p) => ({ ...p, tiempo_estimado_min: parseInt(e.target.value) || 60 }))}
                  min={1}
                  className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
              <button
                onClick={agregarZona}
                disabled={agregandoZona}
                className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition disabled:opacity-50"
              >
                {agregandoZona ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
            {zonaError && <p className="text-xs text-red-500 mt-1">{zonaError}</p>}
          </div>
        </div>
      )}

      {/* ── TAB: MENSAJES DEL BOT ── */}
      {tab === 'bot' && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje de bienvenida
            </label>
            <textarea
              name="mensaje_bienvenida"
              value={form.mensaje_bienvenida}
              onChange={handleChange}
              rows={4}
              placeholder="Ej: ¡Hola! Soy el asistente de {nombre}. ¿En qué le puedo ayudar?"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
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
              rows={4}
              placeholder="Ej: Gracias por escribirnos. Estamos cerrados en este momento. Atendemos de Lun–Sáb 8am–6pm."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Margen mínimo de utilidad
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                name="margen_minimo_porcentaje"
                value={form.margen_minimo_porcentaje}
                onChange={handleChange}
                min={0}
                max={100}
                step={1}
                className="w-24 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <span className="text-sm text-gray-600">% de margen mínimo</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              El sistema te alertará cuando el precio de una cotización o producto esté por debajo de este margen.
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            Si dejas los mensajes vacíos, el bot usará mensajes predeterminados.
          </div>
        </div>
      )}

      {/* ── TAB: COMPROBANTE ── */}
      {tab === 'comprobante' && (
        <div className="space-y-7">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Logo de la ferretería</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <ImageOff className="w-7 h-7 text-gray-400" />
                }
              </div>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={subirLogo}
                />
                <button
                  type="button"
                  disabled={subiendoLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {subiendoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {subiendoLogo ? 'Subiendo…' : 'Subir imagen'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={subiendoLogo}
                    onClick={eliminarLogo}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Eliminar logo
                  </button>
                )}
                <p className="text-xs text-gray-400">PNG, JPG o WebP. Máx 2 MB.</p>
                {logoError && <p className="text-xs text-red-500">{logoError}</p>}
              </div>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Color principal del comprobante</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COLORES_PRESET.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setForm((p) => ({ ...p, color_comprobante: c.value }))}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition',
                    form.color_comprobante === c.value ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-300'
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color_comprobante}
                onChange={(e) => setForm((p) => ({ ...p, color_comprobante: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.color_comprobante}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setForm((p) => ({ ...p, color_comprobante: v }))
                }}
                maxLength={7}
                className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
              />
              <div
                className="flex-1 h-9 rounded-lg"
                style={{ backgroundColor: form.color_comprobante }}
              />
            </div>
          </div>

          {/* Mensaje pie */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje al pie del comprobante
            </label>
            <textarea
              name="mensaje_comprobante"
              value={form.mensaje_comprobante}
              onChange={handleChange}
              rows={3}
              placeholder="Ej: Gracias por su compra. Puede reclamar su garantía presentando este comprobante."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Aparece en la parte inferior de cada comprobante PDF.</p>
          </div>

          {/* Preview band */}
          <div className="rounded-xl overflow-hidden border border-gray-100">
            <div
              className="px-4 py-3 text-white text-sm font-semibold flex items-center gap-2"
              style={{ backgroundColor: form.color_comprobante }}
            >
              <span>COMPROBANTE DE PAGO</span>
              <span className="opacity-70 font-normal text-xs ml-auto">CP-000001</span>
            </div>
            <div className="bg-white px-4 py-3 text-xs text-gray-500">
              Vista previa del encabezado del PDF
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PAGOS ── */}
      {tab === 'pagos' && (
        <div className="space-y-6">
          {/* Métodos activos */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Métodos de pago aceptados</p>
            <div className="space-y-2">
              {TODOS_METODOS.map(({ key, label, desc }) => {
                const activo = metodosActivos.includes(key)
                const bloqueado = key === 'efectivo'
                return (
                  <label
                    key={key}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition',
                      activo ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white',
                      bloqueado && 'cursor-default opacity-70'
                    )}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activo}
                      disabled={bloqueado}
                      onClick={() => toggleMetodo(key)}
                      className={cn(
                        'relative w-9 h-5 rounded-full border-2 border-transparent transition-colors shrink-0',
                        activo ? 'bg-orange-500' : 'bg-gray-200'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        activo ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    {bloqueado && (
                      <span className="ml-auto text-xs text-gray-400 shrink-0">Siempre activo</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Yape */}
          {metodosActivos.includes('yape') && (
            <div className="border-t border-gray-100 pt-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Datos de Yape</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Número Yape</label>
                  <input
                    value={datosYape.numero}
                    onChange={(e) => setDatosYape((p) => ({ ...p, numero: e.target.value }))}
                    placeholder="51987654321"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">Con código de país, sin el +</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Código QR de Yape</label>
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                      {datosYape.qr_url
                        ? <img src={datosYape.qr_url} alt="QR Yape" className="w-full h-full object-contain p-1" />
                        : <QrCode className="w-7 h-7 text-gray-400" />
                      }
                    </div>
                    <div className="space-y-2">
                      <input
                        ref={qrInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={subirQR}
                      />
                      <button
                        type="button"
                        disabled={subiendoQR}
                        onClick={() => qrInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {subiendoQR ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {subiendoQR ? 'Subiendo…' : 'Subir QR'}
                      </button>
                      {datosYape.qr_url && (
                        <button
                          type="button"
                          disabled={subiendoQR}
                          onClick={eliminarQR}
                          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Eliminar QR
                        </button>
                      )}
                      <p className="text-xs text-gray-400">PNG o JPG. Máx 2 MB.</p>
                      {qrError && <p className="text-xs text-red-500">{qrError}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    El bot enviará el QR automáticamente cuando el cliente elija pagar por Yape.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Transferencia */}
          {metodosActivos.includes('transferencia') && (
            <div className="border-t border-gray-100 pt-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Datos bancarios</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Banco *</label>
                  <input
                    value={datosTransferencia.banco}
                    onChange={(e) => setDatosTransferencia((p) => ({ ...p, banco: e.target.value }))}
                    placeholder="BCP, Interbank, BBVA…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Titular *</label>
                  <input
                    value={datosTransferencia.titular}
                    onChange={(e) => setDatosTransferencia((p) => ({ ...p, titular: e.target.value }))}
                    placeholder="Nombre del titular"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Número de cuenta *</label>
                  <input
                    value={datosTransferencia.cuenta}
                    onChange={(e) => setDatosTransferencia((p) => ({ ...p, cuenta: e.target.value }))}
                    placeholder="000-00000000-0-00"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    CCI <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    value={datosTransferencia.cci ?? ''}
                    onChange={(e) => setDatosTransferencia((p) => ({ ...p, cci: e.target.value || null }))}
                    placeholder="00200000000000000000"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                El bot enviará estos datos automáticamente cuando el cliente elija pago por transferencia.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Acciones — no aplica para zonas (se guardan en tiempo real) */}
      {tab !== 'zonas' && (
        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved
              ? <Check className="w-4 h-4" />
              : <Save className="w-4 h-4" />
            }
            {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
