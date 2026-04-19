'use client'

import { useState, useCallback } from 'react'
import { AlertTriangle, FileText, BookOpen, BarChart3, ChevronLeft, ChevronRight, Download } from 'lucide-react'

interface Stats {
  comprobantes_mes:     number
  igv_mes:              number
  ventas_mes:           number
  tenants_con_nubefact: number
  tenants_sin_nubefact: number
  libros_generados_mes: number
  libros_cerrados_mes:  number
}

interface Comprobante {
  id:               string
  ferreteria_id:    string
  ferreteria_nombre: string
  tipo:             string
  serie:            string
  numero:           number
  numero_completo:  string
  cliente_nombre:   string
  cliente_ruc_dni:  string
  subtotal:         number
  igv:              number
  total:            number
  estado:           string
  created_at:       string
}

interface LibroRow {
  ferreteria_id:    string
  ferreteria_nombre: string
  ferreteria_ruc:   string
  tiene_nubefact:   boolean
  libro: {
    id:              string
    estado:          string
    total_registros: number
    total_ventas:    number
    total_igv:       number
    total_boletas:   number
    total_facturas:  number
  } | null
}

const SECRET = process.env.NEXT_PUBLIC_SUPERADMIN_SECRET ?? ''

function formatPEN(n: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n)
}

function periodoActual() {
  const ahora = new Date()
  return `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────
// KPI Tab
// ────────────────────────────────────────────────────────────
function TabKPIs({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Comprobantes del mes" value={stats.comprobantes_mes.toLocaleString()} />
        <KPICard label="IGV facturado" value={formatPEN(stats.igv_mes)} accent />
        <KPICard label="Total ventas" value={formatPEN(stats.ventas_mes)} />
        <KPICard label="Libros generados" value={stats.libros_generados_mes.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tenants con Nubefact</p>
          <p className="text-3xl font-bold text-green-400">{stats.tenants_con_nubefact}</p>
          <p className="text-xs text-gray-500 mt-1">Facturación electrónica activa</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tenants sin Nubefact</p>
          <p className="text-3xl font-bold text-yellow-400">{stats.tenants_sin_nubefact}</p>
          <p className="text-xs text-gray-500 mt-1">Sin facturación electrónica</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Libros cerrados</p>
          <p className="text-3xl font-bold text-white">{stats.libros_cerrados_mes}</p>
          <p className="text-xs text-gray-500 mt-1">de {stats.libros_generados_mes} generados este mes</p>
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-indigo-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Comprobantes Tab
// ────────────────────────────────────────────────────────────
function TabComprobantes() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Filters
  const [filterFerreteria, setFilterFerreteria] = useState('')
  const [filterTipo,       setFilterTipo]       = useState('')
  const [filterEstado,     setFilterEstado]      = useState('')
  const [filterPeriodo,    setFilterPeriodo]     = useState(periodoActual())

  const PER_PAGE = 50

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams()
    params.set('page', String(p))
    if (filterFerreteria.trim()) params.set('ferreteria_id', filterFerreteria.trim())
    if (filterTipo)    params.set('tipo', filterTipo)
    if (filterEstado)  params.set('estado', filterEstado)
    if (filterPeriodo) params.set('periodo', filterPeriodo)
    return params.toString()
  }, [filterFerreteria, filterTipo, filterEstado, filterPeriodo])

  async function cargar(p = 1) {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/tributario/comprobantes?${buildParams(p)}`, {
        headers: { 'x-superadmin-secret': SECRET },
      })
      if (res.ok) {
        const json = await res.json()
        setComprobantes(json.data ?? [])
        setTotal(json.total ?? 0)
        setPage(p)
        setLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }

  function exportarCSV() {
    const params = new URLSearchParams()
    if (filterFerreteria.trim()) params.set('ferreteria_id', filterFerreteria.trim())
    if (filterTipo)    params.set('tipo', filterTipo)
    if (filterEstado)  params.set('estado', filterEstado)
    if (filterPeriodo) params.set('periodo', filterPeriodo)
    params.set('x-superadmin-secret', SECRET)

    // Open in new tab — browser will download the file
    const url = `/api/superadmin/tributario/exportar?${params.toString()}`
    window.open(url, '_blank')
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  const ESTADO_BADGE: Record<string, string> = {
    emitido:   'border border-green-500 text-green-400 bg-green-500/10',
    anulado:   'border border-red-500 text-red-400 bg-red-500/10',
    pendiente: 'border border-yellow-500 text-yellow-400 bg-yellow-500/10',
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Periodo (AAAAMM)</label>
            <input
              type="text"
              value={filterPeriodo}
              onChange={(e) => setFilterPeriodo(e.target.value)}
              placeholder="202504"
              maxLength={6}
              className="bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-1.5 text-sm w-28 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Tipo</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="boleta">Boleta</option>
              <option value="factura">Factura</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="emitido">Emitido</option>
              <option value="anulado">Anulado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => cargar(1)}
              disabled={loading}
              className="bg-white text-gray-900 font-medium rounded-lg px-4 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Cargando...' : 'Filtrar'}
            </button>
            <button
              onClick={exportarCSV}
              className="flex items-center gap-1.5 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg px-3 py-1.5 text-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {!loaded ? (
          <div className="py-16 text-center text-gray-500 text-sm">
            Aplica filtros y presiona Filtrar para cargar comprobantes
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Ferretería</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Serie-Nro</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">RUC/DNI</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {comprobantes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-gray-500">
                        No hay comprobantes para los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    comprobantes.map((c) => (
                      <tr key={c.id} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-3 text-white text-xs max-w-[140px] truncate">{c.ferreteria_nombre}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-gray-300 capitalize text-xs">{c.tipo}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.numero_completo}</td>
                        <td className="px-4 py-3 text-gray-300 text-xs max-w-[120px] truncate">{c.cliente_nombre}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.cliente_ruc_dni}</td>
                        <td className="px-4 py-3 text-right font-mono text-white text-xs">
                          {formatPEN(Number(c.total ?? 0))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[c.estado] ?? 'text-gray-400 border border-gray-600'}`}>
                            {c.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {Math.min((page - 1) * PER_PAGE + 1, total)}–{Math.min(page * PER_PAGE, total)} de {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => cargar(page - 1)}
                    disabled={page <= 1 || loading}
                    className="flex items-center gap-1 border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-40 rounded-lg px-3 py-1.5 text-xs transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>
                  <button
                    onClick={() => cargar(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-40 rounded-lg px-3 py-1.5 text-xs transition-colors"
                  >
                    Siguiente
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Libros Tab
// ────────────────────────────────────────────────────────────
function TabLibros() {
  const ahora = new Date()
  const [selectedYear,  setSelectedYear]  = useState(ahora.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(ahora.getMonth() + 1)
  const [libros, setLibros] = useState<LibroRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  async function cargar() {
    setLoading(true)
    const periodo = `${selectedYear}${String(selectedMonth).padStart(2, '0')}`
    try {
      const res = await fetch(`/api/superadmin/tributario/libros?periodo=${periodo}`, {
        headers: { 'x-superadmin-secret': SECRET },
      })
      if (res.ok) {
        const json = await res.json()
        setLibros(json)
        setLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ]

  const years = Array.from({ length: 5 }, (_, i) => ahora.getFullYear() - i)

  const ESTADO_BADGE: Record<string, string> = {
    cerrado:    'border border-green-500 text-green-400 bg-green-500/10',
    generado:   'border border-indigo-500 text-indigo-400 bg-indigo-500/10',
    pendiente:  'border border-yellow-500 text-yellow-400 bg-yellow-500/10',
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button
            onClick={cargar}
            disabled={loading}
            className="bg-white text-gray-900 font-medium rounded-lg px-4 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cargando...' : 'Cargar'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {!loaded ? (
          <div className="py-16 text-center text-gray-500 text-sm">
            Selecciona periodo y presiona Cargar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-300 text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Ferretería</th>
                  <th className="px-4 py-3 font-medium">RUC</th>
                  <th className="px-4 py-3 font-medium">Nubefact</th>
                  <th className="px-4 py-3 font-medium text-right">Registros</th>
                  <th className="px-4 py-3 font-medium text-right">Total ventas</th>
                  <th className="px-4 py-3 font-medium">Estado libro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {libros.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-500">
                      No hay ferreterías registradas
                    </td>
                  </tr>
                ) : (
                  libros.map((row) => {
                    const alertaNubefact = row.tiene_nubefact && !row.libro
                    return (
                      <tr
                        key={row.ferreteria_id}
                        className={`transition-colors ${
                          alertaNubefact
                            ? 'bg-red-950/20 hover:bg-red-950/30'
                            : 'bg-gray-900 hover:bg-gray-800'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {alertaNubefact && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            )}
                            <span className="text-white text-xs">{row.ferreteria_nombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{row.ferreteria_ruc}</td>
                        <td className="px-4 py-3">
                          {row.tiene_nubefact ? (
                            <span className="text-xs border border-green-500 text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                              Activo
                            </span>
                          ) : (
                            <span className="text-xs border border-gray-600 text-gray-500 px-2 py-0.5 rounded-full">
                              Sin configurar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300 text-xs">
                          {row.libro ? row.libro.total_registros?.toLocaleString() ?? '—' : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-white">
                          {row.libro ? formatPEN(Number(row.libro.total_ventas ?? 0)) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.libro ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[row.libro.estado] ?? 'text-gray-400 border border-gray-600'}`}>
                              {row.libro.estado}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Sin libro</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────
type Tab = 'kpis' | 'comprobantes' | 'libros'

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'kpis',         label: 'KPIs',         Icon: BarChart3  },
  { id: 'comprobantes', label: 'Comprobantes',  Icon: FileText   },
  { id: 'libros',       label: 'Libros',        Icon: BookOpen   },
]

export default function TributarioPanel({ stats }: { stats: Stats }) {
  const [activeTab, setActiveTab] = useState<Tab>('kpis')

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'kpis'         && <TabKPIs stats={stats} />}
      {activeTab === 'comprobantes' && <TabComprobantes />}
      {activeTab === 'libros'       && <TabLibros />}
    </div>
  )
}
