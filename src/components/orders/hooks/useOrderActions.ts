import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function useOrderActions(
  setPedidos: React.Dispatch<React.SetStateAction<any[]>>,
  setCancelDialog?: React.Dispatch<React.SetStateAction<any>>,
  setCreditoDialog?: React.Dispatch<React.SetStateAction<any>>
) {
  const router = useRouter()
  const [actualizando, setActualizando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [asignando, setAsignando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [aprobandoCredito, setAprobandoCredito] = useState(false)

  async function cambiarEstado(pedidoId: string, nuevoEstado: string, motivoCancelacion?: string) {
    if (nuevoEstado === 'cancelado' && motivoCancelacion === undefined && setCancelDialog) {
      setCancelDialog({ pedidoId, motivo: '' })
      return
    }

    setActualizando(pedidoId)
    try {
      const res = await fetch(`/api/orders/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          ...(motivoCancelacion ? { motivo_cancelacion: motivoCancelacion } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al actualizar el estado')
      }
      const actualizado = await res.json()
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId
          ? { ...p, estado: actualizado.estado, motivo_cancelacion: motivoCancelacion ?? p.motivo_cancelacion }
          : p))
      )
      router.refresh()
      toast.success('Estado actualizado correctamente')
    } catch {
      toast.error('Error al actualizar el estado')
    } finally {
      setActualizando(null)
      if (setCancelDialog) setCancelDialog(null)
    }
  }

  async function actualizarPago(pedidoId: string, body: { metodo_pago?: string; estado_pago?: string }) {
    setPagando(pedidoId)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al actualizar el pago')
      }
      const data = await res.json()
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedidoId
            ? {
                ...p,
                metodo_pago: data.metodo_pago ?? p.metodo_pago,
                estado_pago: data.estado_pago ?? p.estado_pago,
                pago_confirmado_por: data.pago_confirmado_por ?? p.pago_confirmado_por,
                pago_confirmado_at: data.pago_confirmado_at ?? p.pago_confirmado_at,
              }
            : p
        )
      )
      toast.success('Pago actualizado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el pago')
    } finally {
      setPagando(null)
    }
  }

  async function aprobarCredito(creditoDialog: any) {
    if (!creditoDialog) return
    if (!creditoDialog.fechaLimite) {
      toast.error('Selecciona la fecha límite del crédito')
      return
    }

    setAprobandoCredito(true)
    try {
      const res = await fetch('/api/creditos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: creditoDialog.pedidoId,
          fecha_limite: creditoDialog.fechaLimite,
          notas: creditoDialog.notas || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al aprobar crédito')
      }
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === creditoDialog.pedidoId
            ? { ...p, estado_pago: 'credito_activo' }
            : p
        )
      )
      if (setCreditoDialog) setCreditoDialog(null)
      toast.success('Crédito aprobado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al aprobar crédito')
    } finally {
      setAprobandoCredito(false)
    }
  }

  async function asignarRepartidor(pedidoId: string, repartidorId: string) {
    setAsignando(pedidoId)
    try {
      const res = await fetch(`/api/repartidores/${repartidorId}/asignar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPedidos((prev) => prev.map((p) => p.id === pedidoId
        ? { ...p, repartidor_id: repartidorId === 'ninguno' ? null : repartidorId }
        : p))
      toast.success('Repartidor asignado')
    } catch {
      toast.error('Error al asignar repartidor')
    } finally {
      setAsignando(null)
    }
  }

  async function eliminarPedido(pedidoId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este pedido? Se restaurará el stock si corresponde.')) return
    setEliminando(pedidoId)
    try {
      const res = await fetch(`/api/orders/${pedidoId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al eliminar el pedido')
      }
      setPedidos((prev) => prev.filter((p) => p.id !== pedidoId))
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar el pedido')
    } finally {
      setEliminando(null)
    }
  }

  return {
    actualizando,
    pagando,
    asignando,
    eliminando,
    aprobandoCredito,
    cambiarEstado,
    actualizarPago,
    aprobarCredito,
    asignarRepartidor,
    eliminarPedido,
  }
}
