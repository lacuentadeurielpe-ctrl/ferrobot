'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatPEN, formatFecha, truncar } from '@/lib/utils'
import { ChevronDown, FileText, Check, X, Loader2, Pencil } from 'lucide-react'

interface ItemCotizacion {
  id: string
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
  precio_original: number
  subtotal: number
  no_disponible: boolean
  nota_disponibilidad: string | null
  productos?: { precio_compra: number } | null
}

interface Cotizacion {
  id: string
  estado: string
  total: number
  requiere_aprobacion: boolean
  notas_dueno: string | null
  created_at: string
  clientes: { nombre: string | null; telefono: string } | null
  items_cotizacion: ItemCotizacion[]
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pend. aprobación',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  confirmada: 'Confirmada',
  rechazada: 'Rechazada',
}

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  pendiente_aprobacion: 'bg-yellow-100 text-yellow-800',
  aprobada: 'bg-blue-100 text-blue-800',
  enviada: 'bg-orange-100 text-orange-800',
  confirmada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
}

interface Props { cotizaciones: Cotizacion[]; margenMinimo?: number }

export default function CotizacionesTable({ cotizaciones: inicial, margenMinimo = 10 }: Props) {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(inicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  // Estado de edición de precios por item: { itemId: precio_editado }
  const [preciosEditados, setPreciosEditados] = useState<Record<string, string>>({})
  const [aprobando, setAprobando] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({})
  const [confirmandoRechazo, setConfirmandoRechazo] = useState<string | null>(null)

  const filtradas = filtro ? cotizaciones.filter((c) => c.estado === filtro) : cotizaciones

  function calcularTotalEditado(cot: Cotizacion): number {
    return cot.items_cotizacion
      .filter((i) => !i.no_disponible)
      .reduce((sum, i) => {
        const precioEdit = preciosEditados[i.id]
        const precio = precioEdit !== undefined ? parseFloat(precioEdit) || i.precio_unitario : i.precio_unitario
        return sum + precio * i.cantidad
      }, 0)
  }

  async function guardarPreciosYAprobar(cot: Cotizacion) {
    setAprobando(cot.id)
    try {
      // Guardar precios editados si hay
      const itemsConCambios = cot.items_cotizacion
        .filter((i) => !i.no_disponible && preciosEditados[i.id] !== undefined)
        .map((i) => ({
          id: i.id,
          precio_unitario: parseFloat(preciosEditados[i.id]) || i.precio_unitario,
        }))

      if (itemsConCambios.length > 0) {
        await fetch(`/api/cotizaciones/${cot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsConCambios }),
        })
      }

      // Aprobar y enviar al cliente
      const res = await fetch(`/api/cotizaciones/${cot.id}/aprobar`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)

      setCotizaciones((prev) =>
        prev.map((c) => c.id === cot.id ? { ...c, estado: 'enviada' } : c)
      )
      setExpandido(null)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al aprobar')
    } finally {
      setAprobando(null)
    }
  }

  async function rechazarCotizacion(cot: Cotizacion) {
    setRechazando(cot.id)
    try {
      const res = await fetch(`/api/cotizaciones/${cot.id}/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoRechazo[cot.id] ?? '' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setCotizaciones((prev) =>
        prev.map((c) => c.id === cot.id ? { ...c, estado: 'rechazada' } : c)
      )
      setConfirmandoRechazo(null)
      setExpandido(null)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al rechazar')
    } finally {
      setRechazando(null)
    }
  }

  if (cotizaciones.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No hay cotizaciones aún</p>
        <p className="text-xs mt-1">Aparecerán aquí cuando el bot genere cotizaciones</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltro('')}
          className={cn('px-3 py-1 rounded-full text-xs font-medium transition',
            !filtro ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          Todas ({cotizaciones.length})
        </button>
        {Object.keys(ESTADO_LABEL).map((e) => {
          const count = cotizaciones.filter((c) => c.estado === e).length
          if (!count) return null
          return (
            <button key={e} onClick={() => setFiltro(e)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition',
                filtro === e ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {ESTADO_LABEL[e]} ({count})
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        {filtradas.map((cot) => {
          const isOpen = expandido === cot.id
          const isPending = cot.estado === 'pendiente_aprobacion'
          const nombreCliente = cot.clientes?.nombre ?? cot.clientes?.telefono ?? 'Cliente'
          const itemsDisp = cot.items_cotizacion.filter((i) => !i.no_disponible)
          const resumen = itemsDisp.slice(0, 2).map((i) => `${i.cantidad}× ${truncar(i.nombre_producto, 20)}`).join(', ')
          const masItems = itemsDisp.length > 2 ? ` +${itemsDisp.length - 2} más` : ''
          const totalEditado = isPending && isOpen ? calcularTotalEditado(cot) : cot.total

          return (
            <div key={cot.id}
              className={cn('bg-white rounded-xl border overflow-hidden',
                isPending ? 'border-yellow-300 shadow-sm shadow-yellow-50' : 'border-gray-200')}>

              {/* Cabecera */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpandido(isOpen ? null : cot.id)}
              >
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform shrink-0', isOpen && 'rotate-180')} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{nombreCliente}</p>
                    {isPending && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                        ⏳ Requiere aprobación
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{resumen}{masItems}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatPEN(totalEditado)}</p>
                  <p className="text-xs text-gray-400">{formatFecha(cot.created_at)}</p>
                </div>

                <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full shrink-0',
                  ESTADO_COLOR[cot.estado] ?? 'bg-gray-100 text-gray-600')}>
                  {ESTADO_LABEL[cot.estado] ?? cot.estado}
                </span>
              </div>

              {/* Detalle expandido */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                  {/* Tabla de items */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-200">
                        <th className="text-left pb-1.5 font-medium">Producto</th>
                        <th className="text-right pb-1.5 font-medium">Cant.</th>
                        <th className="text-right pb-1.5 font-medium">
                          {isPending ? (
                            <span className="flex items-center justify-end gap-1">
                              <Pencil className="w-3 h-3" /> Precio ajustado
                            </span>
                          ) : 'P. Unit.'}
                        </th>
                        <th className="text-right pb-1.5 font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cot.items_cotizacion.map((item) => {
                        const precioEdit = preciosEditados[item.id]
                        const precioActual = precioEdit !== undefined
                          ? parseFloat(precioEdit) || item.precio_unitario
                          : item.precio_unitario
                        const subtotalActual = precioActual * item.cantidad

                        return (
                          <tr key={item.id} className={item.no_disponible ? 'opacity-50' : ''}>
                            <td className="py-2 text-gray-800">
                              <div>{item.nombre_producto}</div>
                              {item.no_disponible && (
                                <div className="text-xs text-red-500 mt-0.5">
                                  {item.nota_disponibilidad ?? 'No disponible'}
                                </div>
                              )}
                              {!item.no_disponible && item.precio_original !== item.precio_unitario && !isPending && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  Precio original: {formatPEN(item.precio_original)}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-right text-gray-600">{item.cantidad}</td>
                            <td className="py-2 text-right">
                              {item.no_disponible ? (
                                <span className="text-gray-400">—</span>
                              ) : isPending ? (
                                (() => {
                                  const costoUnitario = item.productos?.precio_compra ?? 0
                                  const margen = precioActual > 0 && costoUnitario > 0
                                    ? ((precioActual - costoUnitario) / precioActual) * 100
                                    : null
                                  const margenBajo = margen !== null && margenMinimo > 0 && margen < margenMinimo
                                  return (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-400">S/</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={precioEdit ?? item.precio_unitario.toFixed(2)}
                                          onChange={(e) => setPreciosEditados((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                          onClick={(e) => e.stopPropagation()}
                                          className={cn(
                                            'w-20 text-right border rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2',
                                            margenBajo
                                              ? 'border-red-400 focus:ring-red-300'
                                              : 'border-gray-300 focus:ring-orange-400'
                                          )}
                                        />
                                        {precioEdit !== undefined && parseFloat(precioEdit) !== item.precio_original && (
                                          <span className="text-xs text-gray-400 line-through ml-1">
                                            {formatPEN(item.precio_original)}
                                          </span>
                                        )}
                                      </div>
                                      {margenBajo && (
                                        <span className="text-xs text-red-600 font-medium">
                                          ⚠️ Margen {margen!.toFixed(0)}% &lt; {margenMinimo}%
                                        </span>
                                      )}
                                    </div>
                                  )
                                })()
                              ) : (
                                <span className="text-gray-600">{formatPEN(item.precio_unitario)}</span>
                              )}
                            </td>
                            <td className="py-2 text-right font-medium text-gray-800">
                              {item.no_disponible ? '—' : formatPEN(isPending ? subtotalActual : item.subtotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="pt-2 text-right font-semibold text-gray-700">Total</td>
                        <td className="pt-2 text-right font-bold text-gray-900">
                          {formatPEN(isPending ? calcularTotalEditado(cot) : cot.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Acciones de aprobación */}
                  {isPending && (
                    <div className="border-t border-yellow-200 pt-3 space-y-3">
                      <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-3 py-2">
                        ✏️ Puedes ajustar los precios directamente en la tabla. Al aprobar, se enviará la cotización con los precios actualizados al cliente por WhatsApp.
                      </p>

                      {confirmandoRechazo === cot.id ? (
                        <div className="space-y-2">
                          <textarea
                            placeholder="Motivo del rechazo (opcional — se enviará al cliente)"
                            value={motivoRechazo[cot.id] ?? ''}
                            onChange={(e) => setMotivoRechazo((p) => ({ ...p, [cot.id]: e.target.value }))}
                            rows={2}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => rechazarCotizacion(cot)}
                              disabled={rechazando === cot.id}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                            >
                              {rechazando === cot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Confirmar rechazo
                            </button>
                            <button
                              onClick={() => setConfirmandoRechazo(null)}
                              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => guardarPreciosYAprobar(cot)}
                            disabled={aprobando === cot.id}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                          >
                            {aprobando === cot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Aprobar y enviar al cliente
                          </button>
                          <button
                            onClick={() => setConfirmandoRechazo(cot.id)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition"
                          >
                            <X className="w-3.5 h-3.5" />
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
