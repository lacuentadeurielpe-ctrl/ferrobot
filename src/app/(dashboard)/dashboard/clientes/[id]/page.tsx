// Historial completo de un cliente
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { redirect, notFound } from 'next/navigation'
import { formatPEN, formatFecha, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import { ArrowLeft, Phone, MessageSquare, ShoppingCart, FileText } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteDetallePage({ params }: Props) {
  const { id } = await params
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Datos del cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, created_at')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!cliente) notFound()

  // Pedidos del cliente
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, estado, total, modalidad, created_at, items_pedido(nombre_producto, cantidad)')
    .eq('cliente_id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  // Cotizaciones del cliente
  const { data: cotizaciones } = await supabase
    .from('cotizaciones')
    .select('id, numero_cotizacion, estado, total, created_at')
    .eq('cliente_id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })
    .limit(20)

  const pedidosLista = pedidos ?? []
  const cotizacionesLista = cotizaciones ?? []

  const totalGastado = pedidosLista
    .filter(p => p.estado !== 'cancelado')
    .reduce((s, p) => s + (p.total ?? 0), 0)

  const esDueno = session.rol === 'dueno'
  const whatsappUrl = `https://wa.me/${cliente.telefono?.replace(/\D/g, '')}`

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/clientes" className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">{cliente.nombre || 'Sin nombre'}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {cliente.telefono}
            </span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">Cliente desde {formatFecha(cliente.created_at)}</span>
          </div>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          WhatsApp
        </a>
      </div>

      {/* Métricas resumen */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{pedidosLista.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pedidos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{cotizacionesLista.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Cotizaciones</p>
        </div>
        {esDueno && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-orange-600">{formatPEN(totalGastado)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total comprado</p>
          </div>
        )}
      </div>

      {/* Pedidos */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Pedidos</h2>
        </div>
        {pedidosLista.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Sin pedidos</p>
        ) : (
          <div className="space-y-2">
            {pedidosLista.map((pedido) => (
              <div key={pedido.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-gray-400">{pedido.numero_pedido}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatFecha(pedido.created_at)}</p>
                    {(pedido.items_pedido as any[])?.slice(0, 3).map((item: any, i: number) => (
                      <p key={i} className="text-xs text-gray-600 mt-0.5">
                        {item.cantidad}× {item.nombre_producto}
                      </p>
                    ))}
                    {(pedido.items_pedido as any[])?.length > 3 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        +{(pedido.items_pedido as any[]).length - 3} más
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorEstadoPedido(pedido.estado)}`}>
                      {labelEstadoPedido(pedido.estado)}
                    </span>
                    {esDueno && (
                      <p className="text-sm font-bold text-gray-900 mt-1">{formatPEN(pedido.total)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cotizaciones */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Cotizaciones recientes</h2>
        </div>
        {cotizacionesLista.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Sin cotizaciones</p>
        ) : (
          <div className="space-y-2">
            {cotizacionesLista.map((cot) => (
              <div key={cot.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-400">{cot.numero_cotizacion}</p>
                  <p className="text-xs text-gray-500">{formatFecha(cot.created_at)}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    cot.estado === 'aprobada' ? 'bg-green-50 text-green-700' :
                    cot.estado === 'rechazada' ? 'bg-red-50 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {cot.estado === 'aprobada' ? 'Aprobada' : cot.estado === 'rechazada' ? 'Rechazada' : 'Pendiente'}
                  </span>
                  {esDueno && cot.total && (
                    <p className="text-sm font-semibold text-gray-700 mt-1">{formatPEN(cot.total)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
