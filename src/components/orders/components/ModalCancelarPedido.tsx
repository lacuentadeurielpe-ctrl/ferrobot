import { cn } from '@/lib/utils'

interface ModalCancelarPedidoProps {
  cancelDialog: { pedidoId: string; motivo: string } | null
  setCancelDialog: React.Dispatch<React.SetStateAction<{ pedidoId: string; motivo: string } | null>>
  cambiarEstado: (pedidoId: string, estado: string, motivo?: string) => Promise<void>
}

export default function ModalCancelarPedido({
  cancelDialog,
  setCancelDialog,
  cambiarEstado
}: ModalCancelarPedidoProps) {
  if (!cancelDialog) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="font-semibold text-zinc-900 mb-1">Cancelar pedido</h3>
        <p className="text-sm text-zinc-500 mb-4">¿Por qué se cancela este pedido? (opcional)</p>
        <div className="flex gap-2 mb-4 flex-wrap">
          {['Cliente desistió', 'Sin stock', 'Error en el pedido', 'Otro'].map((m) => (
            <button
              key={m}
              onClick={() => setCancelDialog((d) => d ? { ...d, motivo: m } : d)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition',
                cancelDialog.motivo === m
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
              )}
            >{m}</button>
          ))}
        </div>
        <textarea
          value={cancelDialog.motivo}
          onChange={(e) => setCancelDialog((d) => d ? { ...d, motivo: e.target.value } : d)}
          placeholder="O escribe el motivo aquí…"
          rows={2}
          className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-300"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setCancelDialog(null)}
            className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition"
          >Volver</button>
          <button
            onClick={() => cambiarEstado(cancelDialog.pedidoId, 'cancelado', cancelDialog.motivo || undefined)}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition"
          >Confirmar cancelación</button>
        </div>
      </div>
    </div>
  )
}
