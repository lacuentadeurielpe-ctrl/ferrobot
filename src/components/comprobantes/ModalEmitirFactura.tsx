'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Pedido } from '@/types/database'

interface Props {
  pedido:    Pedido
  onClose:   () => void
  onEmitida: (resultado: { numeroCompleto: string; pdfUrl?: string }) => void
}

export default function ModalEmitirFactura({ pedido, onClose, onEmitida }: Props) {
  const [ruc,          setRuc]          = useState('')
  const [razonSocial,  setRazonSocial]  = useState('')
  const [verificando,  setVerificando]  = useState(false)
  const [rucError,     setRucError]     = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Cálculo estimado de IGV (18%) para mostrar en la confirmación
  const subtotalEstimado = pedido.total / 1.18
  const igvEstimado      = pedido.total - subtotalEstimado

  async function verificarRuc() {
    const rucLimpio = ruc.replace(/\D/g, '')
    if (rucLimpio.length !== 11) {
      setRucError('El RUC debe tener exactamente 11 dígitos')
      return
    }
    setVerificando(true)
    setRucError(null)
    try {
      const res = await fetch('/api/sunat/ruc', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ruc: rucLimpio }),
      })
      const d = await res.json()
      // La API devuelve RucInfo con campo camelCase: razonSocial
      const nombre = d.razonSocial ?? d.razon_social ?? ''
      if (res.ok && nombre) {
        setRazonSocial(nombre)
        setRucError(null)
      } else if (d.sinToken) {
        setRucError('Verificación SUNAT no configurada — escribe la razón social manualmente.')
      } else {
        setRucError('RUC no encontrado en SUNAT. Puedes ingresar la razón social manualmente.')
      }
    } catch {
      setRucError('No se pudo consultar SUNAT. Puedes ingresar la razón social manualmente.')
    } finally {
      setVerificando(false)
    }
  }

  async function emitir() {
    const rucLimpio = ruc.replace(/\D/g, '')
    if (rucLimpio.length !== 11) {
      setError('El RUC debe tener exactamente 11 dígitos')
      return
    }
    if (!razonSocial.trim()) {
      setError('La razón social es requerida')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/comprobantes/emitir', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pedido_id:      pedido.id,
          tipo:           'factura',
          cliente_nombre: razonSocial.trim(),
          cliente_ruc:    rucLimpio,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.tokenInvalido) {
          setError('Token Nubefact inválido. Ve a Configuración → Facturación para reconfigurarlo.')
        } else if (d.error?.toLowerCase().includes('serie')) {
          setError(
            `${d.error} → Ve a Configuración → Facturación y corrige la "Serie Facturas Electrónicas" para que coincida con la serie registrada en tu cuenta Nubefact.`
          )
        } else {
          setError(d.error ?? 'Error al emitir la factura')
        }
      } else {
        onEmitida({ numeroCompleto: d.numeroCompleto, pdfUrl: d.pdfUrl })
      }
    } catch {
      setError('Error de red al emitir la factura')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Emitir factura electrónica</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pedido {pedido.numero_pedido}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Resumen del monto */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal (sin IGV)</span>
              <span>S/ {subtotalEstimado.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>IGV 18%</span>
              <span>S/ {igvEstimado.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
              <span>Total</span>
              <span>S/ {pedido.total.toFixed(2)}</span>
            </div>
          </div>

          {/* RUC del cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RUC del cliente <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ruc}
                onChange={(e) => {
                  setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))
                  setRucError(null)
                }}
                placeholder="20123456789"
                maxLength={11}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                type="button"
                onClick={verificarRuc}
                disabled={verificando || ruc.replace(/\D/g, '').length !== 11}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 text-sm font-medium rounded-lg border border-indigo-200 transition"
              >
                {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Verificar
              </button>
            </div>
            {rucError && (
              <p className="text-xs text-amber-600 mt-1">{rucError}</p>
            )}
          </div>

          {/* Razón social */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Razón social <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="EMPRESA SAC"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              Se autocompleta al verificar el RUC, o puedes escribirlo manualmente.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Advertencia */}
          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            ⚠ Esta acción emite una FACTURA real ante SUNAT. Una vez emitida no puede modificarse, solo anularse.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={emitir}
            disabled={loading}
            className="flex-1 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
          >
            {loading ? 'Emitiendo...' : 'Emitir factura'}
          </button>
        </div>
      </div>
    </div>
  )
}
