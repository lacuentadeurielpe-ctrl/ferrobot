'use client'

import { useState } from 'react'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import { formatPEN } from '@/lib/utils'
import type { Pedido as PedidoDB } from '@/types/database'

export default function ModalNotaCredito({ 
  pedido, 
  comprobanteOriginal,
  onCerrar, 
  onEmitida 
}: {
  pedido: PedidoDB
  comprobanteOriginal: { id: string, numeroCompleto: string, tipo: string }
  onCerrar: () => void
  onEmitida: (resultado: { numeroCompleto: string; pdfUrl?: string }) => void
}) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [motivoCodigo, setMotivoCodigo] = useState('01') // 01 = Anulación, 07 = Devolución
  const [motivoDescripcion, setMotivoDescripcion] = useState('Anulación de la operación')

  const MOTIVOS = [
    { codigo: '01', desc: 'Anulación de la operación' },
    { codigo: '07', desc: 'Devolución por ítem defectuoso' },
    { codigo: '02', desc: 'Anulación por error en el RUC' },
    { codigo: '06', desc: 'Devolución total' }
  ]

  async function emitir() {
    if (!motivoDescripcion.trim()) return setError('Debes ingresar una descripción.')
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/comprobantes/nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comprobanteReferenciaId: comprobanteOriginal.id,
          motivoCodigo,
          motivoDescripcion,
        })
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.tokenInvalido) throw new Error('Token de Nubefact inválido. Revisa la configuración de Facturación en Settings.')
        throw new Error(data.error || 'Error desconocido al emitir NC')
      }

      onEmitida({ numeroCompleto: data.numeroCompleto, pdfUrl: data.pdfUrl })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-lg font-semibold text-zinc-900">Emitir Nota de Crédito</h2>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600 transition" disabled={cargando}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm space-y-2">
            <p className="flex justify-between">
              <span className="text-zinc-500">Documento original:</span>
              <span className="font-semibold text-zinc-900">{comprobanteOriginal.numeroCompleto} ({comprobanteOriginal.tipo})</span>
            </p>
            <p className="flex justify-between">
              <span className="text-zinc-500">Monto total a devolver:</span>
              <span className="font-semibold text-zinc-900 tabular-nums">{formatPEN(pedido.total ?? 0)}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Motivo Sunat</label>
            <select
              value={motivoCodigo}
              onChange={(e) => {
                setMotivoCodigo(e.target.value)
                setMotivoDescripcion(e.target.options[e.target.selectedIndex].text)
              }}
              disabled={cargando}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900"
            >
              {MOTIVOS.map(m => (
                <option key={m.codigo} value={m.codigo}>{m.desc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción detallada</label>
            <input
              type="text"
              value={motivoDescripcion}
              onChange={e => setMotivoDescripcion(e.target.value)}
              disabled={cargando}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900"
              placeholder="Escribe el motivo..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50/50">
          <button
            onClick={onCerrar}
            disabled={cargando}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={emitir}
            disabled={cargando}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition shadow-sm"
          >
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Procesar Devolución
          </button>
        </div>
      </div>
    </div>
  )
}
