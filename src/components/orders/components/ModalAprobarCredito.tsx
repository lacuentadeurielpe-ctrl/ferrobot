import { Loader2, CheckCircle2 } from 'lucide-react'

interface ModalAprobarCreditoProps {
  creditoDialog: { pedidoId: string; fechaLimite: string; notas: string } | null
  setCreditoDialog: React.Dispatch<React.SetStateAction<{ pedidoId: string; fechaLimite: string; notas: string } | null>>
  aprobarCredito: (dialog: any) => Promise<void>
  aprobandoCredito: boolean
}

export default function ModalAprobarCredito({
  creditoDialog,
  setCreditoDialog,
  aprobarCredito,
  aprobandoCredito
}: ModalAprobarCreditoProps) {
  if (!creditoDialog) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="font-semibold text-zinc-900 mb-1">Aprobar crédito</h3>
        <p className="text-sm text-zinc-500 mb-4">El cliente pagará en un plazo acordado. Define la fecha límite.</p>
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1 block">Fecha límite de pago *</label>
            <input
              type="date"
              value={creditoDialog.fechaLimite}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setCreditoDialog((d) => d ? { ...d, fechaLimite: e.target.value } : d)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1 block">Notas (opcional)</label>
            <input
              type="text"
              value={creditoDialog.notas}
              onChange={(e) => setCreditoDialog((d) => d ? { ...d, notas: e.target.value } : d)}
              placeholder="Condiciones del crédito…"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setCreditoDialog(null)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition">
            Cancelar
          </button>
          <button
            onClick={() => aprobarCredito(creditoDialog)}
            disabled={aprobandoCredito}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {aprobandoCredito ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Aprobar crédito
          </button>
        </div>
      </div>
    </div>
  )
}
