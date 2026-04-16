'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatPEN, formatFecha } from '@/lib/utils'
import { Search, X, Users, ChevronRight } from 'lucide-react'

interface ClienteResumen {
  id: string
  nombre: string | null
  telefono: string
  created_at: string
  totalPedidos: number
  pedidosCompletados: number
  totalGastado: number
  ultimoPedido: string | null
}

export default function ClientesTable({
  clientes,
  esVendedor,
}: {
  clientes: ClienteResumen[]
  esVendedor: boolean
}) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return clientes
    return clientes.filter((c) =>
      (c.nombre ?? '').toLowerCase().includes(q) ||
      c.telefono.includes(q)
    )
  }, [clientes, busqueda])

  return (
    <div>
      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 transition"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{busqueda ? 'Sin resultados' : 'No hay clientes aún'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Cliente</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Pedidos</th>
                {!esVendedor && (
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs">Total comprado</th>
                )}
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs">Último pedido</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.nombre || '—'}</p>
                    <p className="text-xs text-gray-400">{c.telefono}</p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-semibold text-gray-700">{c.totalPedidos}</span>
                    {c.totalPedidos > c.pedidosCompletados && (
                      <span className="text-xs text-gray-400 block">
                        ({c.totalPedidos - c.pedidosCompletados} cancel.)
                      </span>
                    )}
                  </td>
                  {!esVendedor && (
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        {c.totalGastado > 0 ? formatPEN(c.totalGastado) : '—'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-gray-400">
                      {c.ultimoPedido ? formatFecha(c.ultimoPedido) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/clientes/${c.id}`}
                      className="text-gray-400 hover:text-orange-500 transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {busqueda && (
            <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50">
              {filtrados.length} de {clientes.length} clientes
            </p>
          )}
        </div>
      )}
    </div>
  )
}
