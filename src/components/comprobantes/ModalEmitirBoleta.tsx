'use client'

import { useState } from 'react'
import type { Pedido } from '@/types/database'

interface Props {
  pedido:      Pedido
  onClose:     () => void
  onEmitida:   (resultado: { numeroCompleto: string; pdfUrl?: string }) => void
}

export default function ModalEmitirBoleta({ pedido, onClose, onEmitida }: Props) {
  const [nombre,   setNombre]   = useState(pedido.nombre_cliente ?? '')
  const [dni,      setDni]      = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Cálculo estimado de IGV (18%) para mostrar en la confirmación
  const subtotalEstimado = pedido.total / 1.18
  const igvEstimado      = pedido.total - subtotalEstimado

  async function emitir() {
    if (!nombre.trim()) { setError('El nombre del cliente es requerido'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/comprobantes/emitir', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pedido_id:      pedido.id,
          cliente_nombre: nombre.trim(),
          cliente_dni:    dni.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.tokenInvalido) {
          setError('Token Nubefact inválido. Ve a Configuración → Facturación para reconfigurarlo.')
        } else if (d.error?.toLowerCase().includes('serie')) {
          setError(
            `${d.error} → Ve a Configuración → Facturación y corrige la "Serie Boletas Electrónicas" para que coincida con la serie registrada en tu cuenta Nubefact.`
          )
        } else {
          setError(d.error ?? 'Error al emitir la boleta')
        }
      } else {
        onEmitida({ numeroCompleto: d.numeroCompleto, pdfUrl: d.pdfUrl })
      }
    } catch {
      setError('Error de red al emitir la boleta')
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
            <h2 className="text-base font-bold text-gray-900">Emitir boleta electrónica</h2>
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

          {/* Nombre cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="JUAN PÉREZ GARCÍA"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* DNI (opcional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DNI del cliente
              <span className="text-gray-400 font-normal ml-1">(opcional en boletas)</span>
            </label>
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="12345678"
              maxLength={8}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              Si no ingresas DNI se emite como "Clientes varios"
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Advertencia modo producción */}
          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            ⚠ Esta acción emite un comprobante real ante SUNAT. Una vez emitido no puede modificarse, solo anularse.
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
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
          >
            {loading ? 'Emitiendo...' : 'Emitir boleta'}
          </button>
        </div>
      </div>
    </div>
  )
}
