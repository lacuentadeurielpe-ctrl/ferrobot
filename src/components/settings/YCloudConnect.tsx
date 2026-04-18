'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  configurado:      boolean
  numeroWhatsapp:   string | null
  estadoConexion:   string | null
  ultimoMensajeAt:  string | null
  ultimoError:      string | null
}

type Vista = 'estado' | 'editar'

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  activo:       { label: 'Activo',       cls: 'bg-green-100 text-green-700' },
  pendiente:    { label: 'Pendiente',    cls: 'bg-yellow-100 text-yellow-700' },
  error:        { label: 'Error',        cls: 'bg-red-100 text-red-700' },
  desconectado: { label: 'Desconectado', cls: 'bg-gray-100 text-gray-500' },
}

export default function YCloudConnect({
  configurado,
  numeroWhatsapp,
  estadoConexion,
  ultimoMensajeAt,
  ultimoError,
}: Props) {
  const router = useRouter()
  const [vista, setVista] = useState<Vista>(configurado ? 'estado' : 'editar')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)

  // Campos del formulario
  const [apiKey,         setApiKey]         = useState('')
  const [webhookSecret,  setWebhookSecret]  = useState('')
  const [numero,         setNumero]         = useState(numeroWhatsapp ?? '')
  const [mostrarApiKey,  setMostrarApiKey]  = useState(false)
  const [mostrarSecret,  setMostrarSecret]  = useState(false)

  const badge = ESTADO_BADGE[estadoConexion ?? 'desconectado'] ?? ESTADO_BADGE.desconectado

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!apiKey.trim() && !configurado) {
      setError('La API Key de YCloud es requerida.')
      return
    }
    if (!numero.trim()) {
      setError('El número de WhatsApp es requerido.')
      return
    }

    setLoading(true)
    try {
      const body: Record<string, string> = { numero_whatsapp: numero.trim() }
      // Si el usuario dejó api_key vacía y ya está configurado, no la enviamos
      // (no se sobrescribe el token existente)
      if (apiKey.trim()) body.api_key = apiKey.trim()
      if (webhookSecret.trim()) body.webhook_secret = webhookSecret.trim()

      // Si api_key no viene y no está configurado → error
      if (!body.api_key && !configurado) {
        setError('La API Key de YCloud es requerida.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/settings/ycloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Error guardando configuración.')
      } else {
        setSuccess(true)
        setApiKey('')
        setWebhookSecret('')
        router.refresh()
        setVista('estado')
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function desconectar() {
    if (!confirm('¿Seguro que quieres desconectar WhatsApp? El bot dejará de funcionar.')) return
    setLoading(true)
    const res = await fetch('/api/settings/ycloud', { method: 'DELETE' })
    if (res.ok) router.refresh()
    else alert('Error al desconectar. Intenta de nuevo.')
    setLoading(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
          {/* WhatsApp icon */}
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">WhatsApp (YCloud)</h3>
            {configurado && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Conecta tu cuenta de YCloud para que el bot reciba y envíe mensajes
          </p>
        </div>
        {configurado && vista === 'estado' && (
          <button
            onClick={() => { setVista('editar'); setError(null); setSuccess(false) }}
            className="text-xs text-orange-500 hover:text-orange-700 font-medium"
          >
            Editar
          </button>
        )}
      </div>

      {/* Vista: estado actual */}
      {vista === 'estado' && configurado && (
        <div>
          {ultimoError && estadoConexion === 'error' && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ Último error: {ultimoError}
            </div>
          )}
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs w-28 shrink-0">Número WhatsApp</span>
              <span className="text-sm font-medium text-gray-800">+{numeroWhatsapp}</span>
            </div>
            {ultimoMensajeAt && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs w-28 shrink-0">Último mensaje</span>
                <span className="text-xs text-gray-500">
                  {new Date(ultimoMensajeAt).toLocaleString('es-PE', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs w-28 shrink-0">API Key</span>
              <span className="text-xs font-mono text-gray-400">••••••••••••</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setVista('editar'); setError(null); setSuccess(false) }}
              className="text-xs text-[#009EE3] hover:underline"
            >
              Actualizar credenciales
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={desconectar}
              disabled={loading}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {loading ? 'Desconectando...' : 'Desconectar'}
            </button>
          </div>
        </div>
      )}

      {/* Vista: formulario */}
      {vista === 'editar' && (
        <form onSubmit={guardar} className="space-y-4">
          {success && (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              ✅ Configuración guardada correctamente.
            </div>
          )}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          {/* Número WhatsApp */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Número de WhatsApp del negocio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="51987654321 (sin + ni espacios)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Incluye el código de país (Perú: 51 + 9 dígitos). Sin el símbolo +.
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              API Key de YCloud{' '}
              {!configurado && <span className="text-red-500">*</span>}
              {configurado && <span className="text-gray-400">(dejar vacío para mantener la actual)</span>}
            </label>
            <div className="relative">
              <input
                type={mostrarApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configurado ? '••••••••••••' : 'Pega aquí tu API Key de YCloud'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="button"
                onClick={() => setMostrarApiKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {mostrarApiKey ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Encuéntrala en{' '}
              <a href="https://app.ycloud.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[#009EE3] hover:underline">
                app.ycloud.com → API Keys
              </a>
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Webhook Secret{' '}
              <span className="text-gray-400">(opcional — dejar vacío para mantener el actual)</span>
            </label>
            <div className="relative">
              <input
                type={mostrarSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={configurado ? '••••••••••••' : 'Webhook secret de YCloud (recomendado)'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="button"
                onClick={() => setMostrarSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {mostrarSecret ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Configúralo en{' '}
              <a href="https://app.ycloud.com/webhooks" target="_blank" rel="noopener noreferrer" className="text-[#009EE3] hover:underline">
                app.ycloud.com → Webhooks
              </a>
              . La URL del webhook es:{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/ycloud
              </code>
            </p>
          </div>

          {/* Botones */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando...' : 'Guardar configuración'}
            </button>
            {configurado && (
              <button
                type="button"
                onClick={() => { setVista('estado'); setError(null) }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
