import { Search, X } from 'lucide-react'
import { cn, labelEstadoPedido } from '@/lib/utils'

const ESTADOS = ['programado', 'pendiente', 'confirmado', 'en_preparacion', 'listo_para_recojo', 'enviado', 'entregado', 'cancelado', 'devuelto']

const RANGOS_FECHA = [
  { label: 'Todos', value: '' },
  { label: 'Hoy', value: 'hoy' },
  { label: 'Esta semana', value: 'semana' },
  { label: 'Este mes', value: 'mes' },
]

interface OrderFiltersProps {
  busqueda: string
  setBusqueda: (v: string) => void
  filtroEstado: string
  setFiltroEstado: (v: string) => void
  filtroFecha: string
  setFiltroFecha: (v: string) => void
  pedidosCount: number
  pedidos: any[]
}

export default function OrderFilters({
  busqueda, setBusqueda,
  filtroEstado, setFiltroEstado,
  filtroFecha, setFiltroFecha,
  pedidosCount,
  pedidos
}: OrderFiltersProps) {
  const hayFiltros = busqueda || filtroEstado || filtroFecha

  return (
    <>
      {/* Barra de búsqueda + filtro de fecha */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, teléfono o N° pedido…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro fecha */}
        <div className="flex gap-1">
          {RANGOS_FECHA.map(({ label, value }) => (
            <button key={value} onClick={() => setFiltroFecha(value)}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium transition',
                filtroFecha === value
                  ? 'bg-zinc-950 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros por estado */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition',
            !filtroEstado ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
          Todos ({pedidosCount})
        </button>
        {ESTADOS.map((e) => {
          const count = pedidos.filter((p) => p.estado === e).length
          if (!count) return null
          return (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition',
                filtroEstado === e ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>
              {labelEstadoPedido(e)} ({count})
            </button>
          )
        })}
        {hayFiltros && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroFecha('') }}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1 transition">
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>
    </>
  )
}
