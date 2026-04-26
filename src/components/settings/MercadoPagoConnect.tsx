'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  estado:        'conectado' | 'expirado' | 'error' | 'desconectado'
  mpEmail:       string | null
  mpUserId:      string | null
  conectadoAt:   string | null
  mpConfigurado: boolean
  // Feedback desde el callback OAuth (pasado como props desde el server component)
  mpOk:    boolean
  mpError: string | null
}

const ERRORES: Record<string, string> = {
  cancelado:            'Cancelaste la conexión con Mercado Pago.',
  parametros_invalidos: 'Respuesta inválida de Mercado Pago.',
  state_invalido:       'La solicitud expiró. Intenta de nuevo.',
  token_exchange:       'Error al obtener los tokens de Mercado Pago. Intenta de nuevo.',
}

export default function MercadoPagoConnect({
  estado,
  mpEmail,
  mpUserId,
  conectadoAt,
  mpConfigurado,
  mpOk,
  mpError,
}: Props) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)

  const estadoBadge = {
    conectado:    { label: 'Conectado',     cls: 'bg-green-100 text-green-700' },
    expirado:     { label: 'Token expirado', cls: 'bg-yellow-100 text-yellow-700' },
    error:        { label: 'Error',          cls: 'bg-red-100 text-red-700' },
    desconectado: { label: 'No conectado',   cls: 'bg-zinc-100 text-zinc-500' },
  }[estado]

  async function desconectar() {
    if (!confirm('¿Seguro que quieres desconectar tu cuenta de Mercado Pago?')) return
    setLoading(true)
    const res = await fetch('/api/mercadopago/disconnect', { method: 'POST' })
    if (res.ok) router.refresh()
    else alert('Error al desconectar. Intenta de nuevo.')
    setLoading(false)
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#009EE3] flex items-center justify-center shrink-0">
          {/* MP icon simplificado */}
          <span className="text-white font-bold text-xs">MP</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 text-sm">Mercado Pago</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoBadge.cls}`}>
              {estadoBadge.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Recibe pagos directamente en tu cuenta de Mercado Pago
          </p>
        </div>
      </div>

      {/* Feedback del callback */}
      {mpOk && (
        <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          ✅ ¡Cuenta de Mercado Pago conectada correctamente!
        </div>
      )}
      {mpError && ERRORES[mpError] && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          ⚠️ {ERRORES[mpError]}
        </div>
      )}

      {/* Sin conexión / expirado / error */}
      {(estado === 'desconectado' || estado === 'error' || estado === 'expirado') && (
        <div>
          {estado === 'expirado' && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3">
              Tu conexión expiró. Vuelve a conectar tu cuenta para seguir recibiendo pagos.
            </p>
          )}
          {estado === 'error' && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
              Hubo un error con la conexión. Reconecta tu cuenta.
            </p>
          )}

          {!mpConfigurado ? (
            <p className="text-xs text-zinc-400 bg-zinc-50 rounded-xl px-3 py-2">
              Mercado Pago no está habilitado en este servidor. Contacta al administrador.
            </p>
          ) : (
            <a
              href="/api/mercadopago/oauth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#009EE3] hover:bg-[#0082CC] text-white text-sm font-medium rounded-xl transition-colors"
            >
              Conectar con Mercado Pago
            </a>
          )}
        </div>
      )}

      {/* Conectado */}
      {estado === 'conectado' && (
        <div>
          <div className="space-y-1.5 mb-4">
            {mpEmail && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400 text-xs w-20 shrink-0">Cuenta</span>
                <span className="font-medium text-zinc-800">{mpEmail}</span>
              </div>
            )}
            {mpUserId && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400 text-xs w-20 shrink-0">ID MP</span>
                <span className="font-mono text-xs text-zinc-500">{mpUserId}</span>
              </div>
            )}
            {conectadoAt && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400 text-xs w-20 shrink-0">Conectado</span>
                <span className="text-xs text-zinc-500">
                  {new Date(conectadoAt).toLocaleDateString('es-PE', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <a href="/api/mercadopago/oauth" className="text-xs text-[#009EE3] hover:underline">
              Reconectar
            </a>
            <span className="text-zinc-200">|</span>
            <button
              onClick={desconectar}
              disabled={loading}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Desconectando...' : 'Desconectar cuenta'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
