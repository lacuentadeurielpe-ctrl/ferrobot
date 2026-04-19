'use client'

import { useState, useEffect } from 'react'
import type { TipoRuc, RegimenTributario } from '@/types/database'
import type { RucInfo } from '@/lib/sunat/ruc'

interface FacturacionData {
  tipo_ruc: TipoRuc
  ruc: string | null
  razon_social: string | null
  nombre_comercial: string | null
  regimen_tributario: RegimenTributario | null
  serie_boletas: string
  serie_facturas: string
  igv_incluido_en_precios: boolean
  representante_legal_nombre: string | null
  representante_legal_dni: string | null
  representante_legal_cargo: string | null
}

interface Props {
  inicial:           FacturacionData
  nubefactConfig: {
    configurado: boolean
    modo:        string
  }
}

const TIPO_LABEL: Record<TipoRuc, string> = {
  sin_ruc: '🧾 Sin RUC — Notas de venta',
  ruc10:   '👤 RUC 10 — Persona Natural',
  ruc20:   '🏢 RUC 20 — Empresa',
}

// ── Asistente de régimen tributario ───────────────────────────────────────────

type Tramo = 'nrus' | 'rer' | 'rmt' | 'general'

function calcularRegimenSugerido(ingresoAnual: number, tipoRuc: TipoRuc): Tramo {
  if (tipoRuc === 'ruc10' && ingresoAnual <= 96_000)  return 'nrus'
  if (ingresoAnual <= 525_000)                        return 'rer'
  if (ingresoAnual <= 8_925_000)                      return 'rmt'
  return 'general'
}

const TRAMO_INFO: Record<Tramo, { label: string; descripcion: string; color: string }> = {
  nrus:    { label: 'Nuevo RUS',         descripcion: 'Cuota fija mensual. El más simple.', color: 'green'  },
  rer:     { label: 'RER',               descripcion: '1.5% de ingresos netos. Sin libros contables.',      color: 'blue'   },
  rmt:     { label: 'RMT',               descripcion: '10% hasta 15 UIT, 29.5% sobre el exceso.',          color: 'purple' },
  general: { label: 'Régimen General',   descripcion: '29.5% sobre utilidad. Para empresas grandes.',      color: 'gray'   },
}

const COLOR_MAP: Record<string, string> = {
  green:  'bg-green-50 border-green-300 text-green-800',
  blue:   'bg-blue-50  border-blue-300  text-blue-800',
  purple: 'bg-purple-50 border-purple-300 text-purple-800',
  gray:   'bg-gray-50  border-gray-300  text-gray-700',
}

function AsistenteRegimen({
  tipoRuc,
  onSeleccionar,
}: {
  tipoRuc: TipoRuc
  onSeleccionar: (r: RegimenTributario) => void
}) {
  const [abierto,  setAbierto]  = useState(false)
  const [ingreso,  setIngreso]  = useState<number | null>(null)
  const [sugerido, setSugerido] = useState<Tramo | null>(null)

  const TRAMOS = [
    { label: 'Menos de S/ 96 mil / año',       value: 50_000    },
    { label: 'Entre S/ 96 mil y S/ 525 mil',   value: 300_000   },
    { label: 'Entre S/ 525 mil y S/ 8.9 mill', value: 2_000_000 },
    { label: 'Más de S/ 8.9 millones',          value: 10_000_000 },
  ]

  function elegir(valor: number) {
    setIngreso(valor)
    const t = calcularRegimenSugerido(valor, tipoRuc)
    setSugerido(t)
  }

  function aplicar(tramo: Tramo) {
    const map: Partial<Record<Tramo, RegimenTributario>> = {
      nrus:    'rus',
      rer:     'rer',
      rmt:     'rmt',
      general: 'general',
    }
    const r = map[tramo]
    if (r) onSeleccionar(r)
    setAbierto(false)
    setIngreso(null)
    setSugerido(null)
  }

  // Nuevo RUS solo disponible para RUC 10
  const mostrarNrus = tipoRuc === 'ruc10'

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-blue-600 hover:underline mt-1 block"
      >
        🤔 ¿No sabes tu régimen? → Calcúlalo aquí
      </button>
    )
  }

  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-800">¿Cuánto facturas al año aproximadamente?</p>
        <button
          type="button"
          onClick={() => { setAbierto(false); setSugerido(null); setIngreso(null) }}
          className="text-blue-400 hover:text-blue-600 text-xs"
        >✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TRAMOS
          .filter((t) => mostrarNrus || t.value > 50_000)
          .map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => elegir(t.value)}
              className={`text-xs px-2 py-1.5 rounded border transition text-left ${
                ingreso === t.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-700 border-blue-300 hover:border-blue-500'
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {sugerido && (
        <div className={`rounded-lg border p-3 ${COLOR_MAP[TRAMO_INFO[sugerido].color]}`}>
          <p className="text-xs font-bold">{TRAMO_INFO[sugerido].label}</p>
          <p className="text-xs mt-0.5 opacity-80">{TRAMO_INFO[sugerido].descripcion}</p>
          {sugerido === 'nrus' && !mostrarNrus && (
            <p className="text-xs mt-1 text-orange-700">⚠ Nuevo RUS solo aplica a personas naturales (RUC 10)</p>
          )}
          <button
            type="button"
            onClick={() => aplicar(sugerido)}
            className="mt-2 text-xs px-3 py-1 bg-white rounded border font-medium hover:bg-gray-50 transition"
          >
            Usar {TRAMO_INFO[sugerido].label}
          </button>
          <p className="text-xs mt-1.5 opacity-60">Tip: puedes confirmarlo en tu último PDT o recibo de pago a SUNAT.</p>
        </div>
      )}
    </div>
  )
}

// ── Sección Nubefact ──────────────────────────────────────────────────────────

function SeccionNubefact({ initialConfig }: { initialConfig: { configurado: boolean; modo: string } }) {
  const [token,      setToken]      = useState('')
  const [modo,       setModo]       = useState(initialConfig.modo ?? 'prueba')
  const [configurado, setConfigurado] = useState(initialConfig.configurado)
  const [testeando,  setTesteando]  = useState(false)
  const [guardando,  setGuardando]  = useState(false)
  const [testOk,     setTestOk]     = useState<boolean | null>(null)
  const [testError,  setTestError]  = useState<string | null>(null)
  const [saveOk,     setSaveOk]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [mostrarToken, setMostrarToken] = useState(false)

  // Reset feedback cuando cambia token/modo
  useEffect(() => {
    setTestOk(null)
    setTestError(null)
    setSaveOk(false)
    setSaveError(null)
  }, [token, modo])

  async function probarConexion() {
    setTesteando(true)
    setTestOk(null)
    setTestError(null)
    try {
      const res = await fetch('/api/settings/nubefact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: token.trim() || undefined }),
      })
      const d = await res.json()
      if (d.ok) {
        setTestOk(true)
      } else {
        setTestOk(false)
        setTestError(d.error ?? 'Error de conexión')
      }
    } catch {
      setTestOk(false)
      setTestError('Error de red')
    } finally {
      setTesteando(false)
    }
  }

  async function guardar() {
    setGuardando(true)
    setSaveOk(false)
    setSaveError(null)
    try {
      const body: Record<string, string> = { modo }
      if (token.trim()) body.token = token.trim()

      const res = await fetch('/api/settings/nubefact', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok) {
        setSaveOk(true)
        setConfigurado(true)
        setToken('')  // limpiar campo tras guardar
      } else {
        setSaveError(d.error ?? 'Error al guardar')
      }
    } catch {
      setSaveError('Error de red')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔌</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">Nubefact — Facturación electrónica</p>
            <p className="text-xs text-gray-500">Emite boletas y facturas electrónicas ante SUNAT</p>
          </div>
        </div>
        {configurado ? (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Conectado</span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin configurar</span>
        )}
      </div>

      {/* Modo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Modo de operación</label>
        <div className="flex gap-2">
          {(['prueba', 'produccion'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg border-2 transition ${
                modo === m
                  ? m === 'produccion'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {m === 'prueba' ? '🧪 Prueba (sin costo)' : '🏭 Producción (documentos reales)'}
            </button>
          ))}
        </div>
        {modo === 'produccion' && (
          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
            <span>⚠</span>
            <span>En producción las boletas son documentos tributarios reales ante SUNAT.</span>
          </p>
        )}
      </div>

      {/* Token */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Token API de Nubefact
          <a
            href="https://app.nubefact.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-blue-500 hover:underline font-normal"
          >
            → Obtener token
          </a>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={mostrarToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={configurado ? '••••••••  (deja vacío para no cambiar)' : 'Pega tu token de Nubefact aquí'}
              className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => setMostrarToken(!mostrarToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              {mostrarToken ? '🙈' : '👁'}
            </button>
          </div>
          <button
            type="button"
            onClick={probarConexion}
            disabled={testeando || (!token.trim() && !configurado)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition whitespace-nowrap"
          >
            {testeando ? '...' : 'Probar'}
          </button>
        </div>

        {/* Feedback test */}
        {testOk === true && (
          <p className="text-xs text-green-600 mt-1">✓ Conexión con Nubefact exitosa</p>
        )}
        {testOk === false && testError && (
          <p className="text-xs text-red-500 mt-1">✗ {testError}</p>
        )}

        <p className="text-xs text-gray-400 mt-1">
          En Nubefact: Empresa → API → copiar el token del modo correspondiente.
        </p>
      </div>

      {/* Botón guardar */}
      <div className="flex items-center justify-between pt-1">
        <div>
          {saveOk && <p className="text-xs text-green-600">✓ Configuración guardada</p>}
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
        >
          {guardando ? 'Guardando...' : 'Guardar Nubefact'}
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function FacturacionTab({ inicial, nubefactConfig }: Props) {
  const [data, setData] = useState<FacturacionData>(inicial)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Verificación RUC SUNAT
  const [rucVerificando, setRucVerificando] = useState(false)
  const [rucInfo,        setRucInfo]        = useState<RucInfo | null>(null)
  const [rucError,       setRucError]       = useState<string | null>(null)

  // Traquea si la razón social fue autocompletada desde SUNAT en esta sesión
  const [rsAutocompletada, setRsAutocompletada] = useState(false)

  function set<K extends keyof FacturacionData>(key: K, value: FacturacionData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
    setError(null)
    if (key === 'ruc') { setRucInfo(null); setRucError(null); setRsAutocompletada(false) }
    if (key === 'razon_social') setRsAutocompletada(false)
  }

  async function verificarRuc() {
    const rucLimpio = (data.ruc ?? '').replace(/\D/g, '')
    if (rucLimpio.length !== 11) { setRucError('RUC debe tener 11 dígitos'); return }
    setRucVerificando(true)
    setRucInfo(null)
    setRucError(null)
    setRsAutocompletada(false)
    try {
      const res = await fetch('/api/sunat/ruc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruc: rucLimpio }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.sinToken) {
          setRucError('⚙️ Verificación SUNAT no configurada. Registra gratis en apis.net.pe y agrega APIS_NET_PE_TOKEN en Vercel.')
        } else {
          setRucError(d.error ?? 'RUC no encontrado en SUNAT')
        }
      } else {
        setRucInfo(d)
        // Autocompletar razón social si está vacía
        if (!data.razon_social?.trim()) {
          setData((prev) => ({ ...prev, razon_social: d.razonSocial }))
          setRsAutocompletada(true)
        }
      }
    } catch {
      setRucError('Error de conexión al verificar RUC')
    } finally {
      setRucVerificando(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (data.tipo_ruc !== 'sin_ruc') {
      if (!data.ruc || data.ruc.length !== 11) {
        setError('Ingresa un RUC válido de 11 dígitos.')
        return
      }
      if (!data.razon_social?.trim()) {
        setError('La razón social es obligatoria.')
        return
      }
      if (!data.regimen_tributario) {
        setError('Selecciona el régimen tributario.')
        return
      }
    }
    if (!data.serie_boletas.trim()) {
      setError('La serie de boletas es obligatoria.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/settings/facturacion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error guardando')
      } else {
        setSuccess('Configuración guardada correctamente.')
      }
    } catch {
      setError('Error de red.')
    } finally {
      setLoading(false)
    }
  }

  const esSinRuc = data.tipo_ruc === 'sin_ruc'
  const esRuc20  = data.tipo_ruc === 'ruc20'

  return (
    <form onSubmit={guardar} className="space-y-6">

      {/* Tipo RUC */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de contribuyente</label>
        <div className="space-y-2">
          {(['sin_ruc', 'ruc10', 'ruc20'] as TipoRuc[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => set('tipo_ruc', tipo)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
                data.tipo_ruc === tipo
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`text-sm font-medium ${data.tipo_ruc === tipo ? 'text-orange-700' : 'text-gray-700'}`}>
                {TIPO_LABEL[tipo]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Datos tributarios */}
      {!esSinRuc && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos tributarios</p>

          {/* RUC + Régimen */}
          <div className="grid grid-cols-2 gap-4">
            {/* RUC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUC <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.ruc ?? ''}
                  onChange={(e) => set('ruc', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="20123456789"
                  maxLength={11}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 transition ${
                    rucInfo
                      ? rucInfo.activo
                        ? 'border-green-400 focus:ring-green-300'
                        : 'border-yellow-400 focus:ring-yellow-300'
                      : rucError
                      ? 'border-red-400 focus:ring-red-300'
                      : 'border-gray-200 focus:ring-orange-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={verificarRuc}
                  disabled={rucVerificando || (data.ruc ?? '').replace(/\D/g, '').length !== 11}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition whitespace-nowrap"
                >
                  {rucVerificando ? '...' : 'Verificar'}
                </button>
              </div>
              {rucInfo && (
                <p className={`text-xs mt-1 ${rucInfo.activo ? 'text-green-600' : 'text-yellow-600'}`}>
                  {rucInfo.activo
                    ? `✓ ACTIVO / HABIDO en SUNAT`
                    : `⚠ ${rucInfo.estado} / ${rucInfo.condicion}`}
                </p>
              )}
              {rucError && <p className="text-xs text-red-500 mt-1">{rucError}</p>}
            </div>

            {/* Régimen */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Régimen <span className="text-red-500">*</span>
              </label>
              <select
                value={data.regimen_tributario ?? ''}
                onChange={(e) => set('regimen_tributario', (e.target.value as RegimenTributario) || null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">Seleccionar...</option>
                {data.tipo_ruc === 'ruc10' && (
                  <>
                    <option value="rus">Nuevo RUS</option>
                    <option value="rer">RER</option>
                    <option value="rmt">RMT</option>
                  </>
                )}
                {data.tipo_ruc === 'ruc20' && (
                  <>
                    <option value="rer">RER</option>
                    <option value="rmt">RMT</option>
                    <option value="general">Régimen General</option>
                  </>
                )}
              </select>
              {/* Asistente de régimen — aparece cuando no hay uno seleccionado */}
              {!data.regimen_tributario && (
                <AsistenteRegimen
                  tipoRuc={data.tipo_ruc}
                  onSeleccionar={(r) => set('regimen_tributario', r)}
                />
              )}
            </div>

            {/* Razón social */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razón social <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.razon_social ?? ''}
                onChange={(e) => set('razon_social', e.target.value)}
                placeholder={data.tipo_ruc === 'ruc10' ? 'PÉREZ GARCÍA JUAN' : 'FERRETERÍA DON MARIO E.I.R.L.'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {rsAutocompletada && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <span>✓</span>
                  <span>Completado automáticamente desde SUNAT</span>
                </p>
              )}
              {rucInfo && !rsAutocompletada && data.razon_social !== rucInfo.razonSocial && (
                <button
                  type="button"
                  onClick={() => {
                    setData((prev) => ({ ...prev, razon_social: rucInfo.razonSocial }))
                    setRsAutocompletada(true)
                  }}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  ↩ Usar razón social SUNAT: {rucInfo.razonSocial}
                </button>
              )}
            </div>

            {/* Nombre comercial */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre comercial
                <span className="text-gray-400 font-normal ml-1 text-xs">(el nombre con el que te conocen los clientes)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.nombre_comercial ?? ''}
                  onChange={(e) => set('nombre_comercial', e.target.value || null)}
                  placeholder="Ej: Ferretería Don Mario"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                {/* Botón de copia solo si razón social está llena y nombre comercial está vacío */}
                {data.razon_social?.trim() && !data.nombre_comercial?.trim() && (
                  <button
                    type="button"
                    onClick={() => set('nombre_comercial', data.razon_social)}
                    title="Copiar razón social"
                    className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg border border-gray-200 transition whitespace-nowrap"
                  >
                    Igual que razón social
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Opcional. Si tu tienda tiene nombre propio distinto a tu razón social (SUNAT no lo registra).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Representante legal — solo RUC20 */}
      {esRuc20 && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Representante legal</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.representante_legal_nombre ?? ''}
                onChange={(e) => set('representante_legal_nombre', e.target.value || null)}
                placeholder="Juan Pérez García"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
              <input
                type="text"
                value={data.representante_legal_dni ?? ''}
                onChange={(e) => set('representante_legal_dni', e.target.value.replace(/\D/g, '').slice(0, 8) || null)}
                placeholder="12345678"
                maxLength={8}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input
                type="text"
                value={data.representante_legal_cargo ?? 'Gerente General'}
                onChange={(e) => set('representante_legal_cargo', e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Series y configuración IGV */}
      <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Series de comprobantes</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serie Notas de Venta</label>
            <input
              type="text"
              value={data.serie_boletas}
              onChange={(e) => set('serie_boletas', e.target.value.toUpperCase().slice(0, 4))}
              placeholder="B001"
              maxLength={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <p className="text-xs text-gray-400 mt-1">Ej: NV001 → NV-NV001-000001</p>
          </div>

          {!esSinRuc && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Serie Facturas {data.tipo_ruc !== 'ruc20' && <span className="text-gray-400 font-normal">(solo RUC20)</span>}
              </label>
              <input
                type="text"
                value={data.serie_facturas}
                onChange={(e) => set('serie_facturas', e.target.value.toUpperCase().slice(0, 4))}
                placeholder="F001"
                maxLength={4}
                disabled={data.tipo_ruc !== 'ruc20'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-gray-100"
              />
            </div>
          )}
        </div>

        {/* IGV */}
        <div className="flex items-start gap-3 pt-2">
          <input
            type="checkbox"
            id="igv_incluido"
            checked={data.igv_incluido_en_precios}
            onChange={(e) => set('igv_incluido_en_precios', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          <label htmlFor="igv_incluido" className="text-sm text-gray-700 cursor-pointer">
            <span className="font-medium">Los precios de mis productos ya incluyen IGV (18%)</span>
            <p className="text-xs text-gray-400 mt-0.5">
              Si activas esto, el sistema no agregará IGV adicional al calcular comprobantes.
            </p>
          </label>
        </div>
      </div>

      {/* Nubefact — F3 */}
      <SeccionNubefact initialConfig={nubefactConfig} />

      {/* Feedback */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
        >
          {loading ? 'Guardando...' : 'Guardar facturación'}
        </button>
      </div>
    </form>
  )
}
