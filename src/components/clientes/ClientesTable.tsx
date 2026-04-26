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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 mx-auto mb-3 text-zinc-200" />
          <p className="text-sm text-zinc-400">{busqueda ? 'Sin resultados' : 'No hay clientes aún'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-[10px] uppercase tracking-wider">Cliente</th>
                <th className="text-center px-3 py-3 font-semibold text-zinc-400 text-[10px] uppercase tracking-wider">Pedidos</th>
                {!esVendedor && (
                  <th className="text-right px-4 py-3 font-semibold text-zinc-400 text-[10px] uppercase tracking-wider">Total comprado</th>
                )}
                <th className="text-right px-4 py-3 font-semibold text-zinc-400 text-[10px] uppercase tracking-wider">Último pedido</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50 transition">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-zinc-900">{c.nombre || '—'}</p>
                    <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">+{c.telefono}</p>
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <span className="text-sm font-bold text-zinc-700">{c.totalPedidos}</span>
                    {c.totalPedidos > c.pedidosCompletados && (
                      <span className="text-[10px] text-zinc-400 block">
                        ({c.totalPedidos - c.pedidosCompletados} cancel.)
                      </span>
                    )}
                  </td>
                  {!esVendedor && (
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm font-bold text-zinc-900 tabular-nums">
                        {c.totalGastado > 0 ? formatPEN(c.totalGastado) : <span className="text-zinc-300 font-normal">—</span>}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xs text-zinc-400">
                      {c.ultimoPedido ? formatFecha(c.ultimoPedido) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <Link
                      href={`/dashboard/clientes/${c.id}`}
                      className="text-zinc-300 hover:text-zinc-700 transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {busqueda && (
            <p className="text-xs text-zinc-400 text-center py-3 border-t border-zinc-50">
              {filtrados.length} de {clientes.length} clientes
            </p>
          )}
        </div>
      )}
    </div>
  )
}
