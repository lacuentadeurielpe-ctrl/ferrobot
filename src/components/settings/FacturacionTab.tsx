'use client'

import { useState } from 'react'
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
  inicial: FacturacionData
}

const TIPO_LABEL: Record<TipoRuc, string> = {
  sin_ruc: '🧾 Sin RUC — Notas de venta',
  ruc10:   '👤 RUC 10 — Persona Natural',
  ruc20:   '🏢 RUC 20 — Empresa',
}

export default function FacturacionTab({ inicial }: Props) {
  const [data, setData] = useState<FacturacionData>(inicial)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Verificación RUC SUNAT
  const [rucVerificando, setRucVerificando] = useState(false)
  const [rucInfo,        setRucInfo]        = useState<RucInfo | null>(null)
  const [rucError,       setRucError]       = useState<string | null>(null)

  function set<K extends keyof FacturacionData>(key: K, value: FacturacionData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
    setError(null)
    if (key === 'ruc') { setRucInfo(null); setRucError(null) }
  }

  async function verificarRuc() {
    const rucLimpio = (data.ruc ?? '').replace(/\D/g, '')
    if (rucLimpio.length !== 11) { setRucError('RUC debe tener 11 dígitos'); return }
    setRucVerificando(true)
    setRucInfo(null)
    setRucError(null)
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
        if (!data.razon_social?.trim()) {
          setData((prev) => ({ ...prev, razon_social: d.razonSocial }))
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

    // Validaciones
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

          <div className="grid grid-cols-2 gap-4">
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
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition ${
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
                    ? `✓ ${rucInfo.razonSocial} — ACTIVO/HABIDO`
                    : `⚠ ${rucInfo.razonSocial} — ${rucInfo.estado} / ${rucInfo.condicion}`}
                </p>
              )}
              {rucError && <p className="text-xs text-red-500 mt-1">{rucError}</p>}
            </div>

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
                    <option value="rer">RER</option>
                    <option value="rmt">RMT</option>
                    <option value="rus">RUS (Nuevo RUS)</option>
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
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razón social <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={data.razon_social ?? ''}
                onChange={(e) => set('razon_social', e.target.value)}
                placeholder={data.tipo_ruc === 'ruc10' ? 'PÉREZ GARCÍA JUAN' : 'FERRETERÍA DON MARIO E.I.R.L.'}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre comercial</label>
              <input
                type="text"
                value={data.nombre_comercial ?? ''}
                onChange={(e) => set('nombre_comercial', e.target.value || null)}
                placeholder="Ej: Ferretería Don Mario (si difiere de la razón social)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
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
                Serie Facturas {data.tipo_ruc === 'ruc20' ? '' : <span className="text-gray-400 font-normal">(solo RUC20)</span>}
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

      {/* Nubefact — placeholder F3 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-600 text-lg">🔌</span>
          <p className="text-sm font-medium text-blue-800">Nubefact — Facturación electrónica</p>
          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">Próximamente</span>
        </div>
        <p className="text-xs text-blue-600">
          La conexión con Nubefact para emitir boletas y facturas electrónicas ante SUNAT estará disponible próximamente.
        </p>
      </div>

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
