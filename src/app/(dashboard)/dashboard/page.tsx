// Dashboard principal — métricas con selector de periodo hoy/semana/mes
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { formatPEN, formatFecha, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import { ShoppingCart, MessageSquare, Package, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import ActivityChart from '@/components/dashboard/ActivityChart'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function getInicioFin(periodo: string): { inicio: Date; fin: Date; label: string } {
  const fin = new Date()
  fin.setHours(23, 59, 59, 999)

  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)

  if (periodo === 'semana') {
    const dia = inicio.getDay()
    const diff = dia === 0 ? -6 : 1 - dia
    inicio.setDate(inicio.getDate() + diff)
    return { inicio, fin, label: 'esta semana' }
  }
  if (periodo === 'mes') {
    inicio.setDate(1)
    return { inicio, fin, label: 'este mes' }
  }
  return { inicio, fin, label: 'hoy' }
}

interface Props {
  searchParams: Promise<{ p?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const { p } = await searchParams
  const periodo = (p === 'semana' || p === 'mes') ? p : 'hoy'
  const { inicio, fin, label } = getInicioFin(periodo)
  const inicioISO = inicio.toISOString()
  const esVendedor = session.rol === 'vendedor'

  const supabase = await createClient()

  // Inicio para el gráfico (siempre 7 días hacia atrás desde hoy)
  const hace7dias = new Date()
  hace7dias.setDate(hace7dias.getDate() - 6)
  hace7dias.setHours(0, 0, 0, 0)
  const hace7diasISO = hace7dias.toISOString()

  // Consultas en paralelo
  const [
    { count: cotizacionesPeriodo },
    { count: pedidosPeriodo },
    { count: pedidosPendientes },
    { data: pedidosData },
    { data: pedidosRecientes },
    { data: cotizaciones7dias },
    { data: pedidos7dias },
    { data: itemsCotizacion },
    { data: gananciasData },
  ] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', inicioISO),

    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', inicioISO),

    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('estado', 'pendiente'),

    supabase
      .from('pedidos')
      .select('total')
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', inicioISO)
      .neq('estado', 'cancelado'),

    supabase
      .from('pedidos')
      .select('id, numero_pedido, nombre_cliente, estado, total, created_at')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('cotizaciones')
      .select('created_at')
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', hace7diasISO),

    supabase
      .from('pedidos')
      .select('created_at')
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', hace7diasISO),

    supabase
      .from('items_cotizacion')
      .select('nombre_producto, cantidad, cotizaciones!inner(ferreteria_id, created_at)')
      .eq('cotizaciones.ferreteria_id', session.ferreteriaId)
      .gte('cotizaciones.created_at', (() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString()
      })()),

    // Ganancias — solo para dueño
    esVendedor
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from('pedidos')
          .select('total, costo_total')
          .eq('ferreteria_id', session.ferreteriaId)
          .gte('created_at', inicioISO)
          .neq('estado', 'cancelado')
          .not('costo_total', 'is', null),
  ])

  const ingresosPeriodo = (pedidosData ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const gananciaPeriodo = (gananciasData ?? []).reduce(
    (s, p) => s + (p.total ?? 0) - (p.costo_total ?? 0), 0
  )
  const hayGanancia = (gananciasData ?? []).length > 0

  // Construir datos del gráfico (últimos 7 días siempre)
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(hace7dias)
    fecha.setDate(hace7dias.getDate() + i)
    const fechaStr = fecha.toISOString().slice(0, 10)
    return {
      dia: DIAS_CORTOS[fecha.getDay()],
      pedidos: (pedidos7dias ?? []).filter((p) => p.created_at.slice(0, 10) === fechaStr).length,
      cotizaciones: (cotizaciones7dias ?? []).filter((c) => c.created_at.slice(0, 10) === fechaStr).length,
    }
  })

  // Top 5 productos más solicitados
  const conteoProductos: Record<string, number> = {}
  for (const item of (itemsCotizacion ?? [])) {
    conteoProductos[item.nombre_producto] = (conteoProductos[item.nombre_producto] ?? 0) + (item.cantidad ?? 1)
  }
  const topProductos = Object.entries(conteoProductos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const metricas = [
    {
      label: `Cotizaciones ${label}`,
      valor: cotizacionesPeriodo ?? 0,
      icono: MessageSquare,
      color: 'bg-blue-50 text-blue-600',
      desc: 'solicitudes de precio',
    },
    {
      label: `Pedidos ${label}`,
      valor: pedidosPeriodo ?? 0,
      icono: ShoppingCart,
      color: 'bg-green-50 text-green-600',
      desc: 'órdenes recibidas',
    },
    {
      label: 'Pendientes',
      valor: pedidosPendientes ?? 0,
      icono: Package,
      color: 'bg-yellow-50 text-yellow-600',
      desc: 'esperando atención',
    },
    // Solo dueños ven ingresos/ganancias
    ...(!esVendedor ? [{
      label: `Ingresos ${label}`,
      valor: formatPEN(ingresosPeriodo),
      icono: TrendingUp,
      color: 'bg-orange-50 text-orange-600',
      desc: hayGanancia ? `Ganancia: ${formatPEN(gananciaPeriodo)}` : 'en pedidos confirmados',
    }] : []),
  ]

  return (
    <div className="p-4 sm:p-8">
      {/* Encabezado + selector de periodo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {session.nombreFerreteria}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('es-PE', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6">
        {metricas.map(({ label: lbl, valor, icono: Icon, color, desc }) => (
          <div key={lbl} className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
            <div className={`inline-flex p-2.5 rounded-lg ${color} mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{valor}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{lbl}</p>
            <p className="text-xs text-gray-400 hidden sm:block mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* Gráfico + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Actividad últimos 7 días</h3>
          <ActivityChart datos={chartData} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Productos más pedidos (30d)</h3>
          {topProductos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {topProductos.map(([nombre, cantidad], i) => {
                const max = topProductos[0][1]
                const pct = Math.round((cantidad / max) * 100)
                return (
                  <div key={nombre}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-700 truncate flex-1 mr-2">
                        <span className="text-gray-400 mr-1">#{i + 1}</span>
                        {nombre}
                      </span>
                      <span className="text-xs font-semibold text-gray-600 shrink-0">{cantidad}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Estado del bot + Pedidos recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {!esVendedor && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Estado del bot</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Bot de WhatsApp</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Activo
                </span>
              </div>
              <div className="pt-1 space-y-1.5">
                {[
                  { label: 'Ver pedidos pendientes', href: '/dashboard/orders' },
                  { label: 'Agregar producto', href: '/dashboard/catalog/new' },
                  { label: 'Ver conversaciones', href: '/dashboard/conversations' },
                  { label: 'Configuración', href: '/dashboard/settings' },
                ].map(({ label: lbl, href }) => (
                  <Link key={href} href={href} className="flex items-center text-sm text-orange-600 hover:text-orange-700 hover:underline">
                    → {lbl}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={`bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm ${esVendedor ? 'lg:col-span-2' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Pedidos recientes</h3>
            <Link href="/dashboard/orders" className="text-xs text-orange-500 hover:underline">Ver todos →</Link>
          </div>
          {(pedidosRecientes ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin pedidos aún</p>
          ) : (
            <div className="space-y-2">
              {(pedidosRecientes ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{p.nombre_cliente}</p>
                    <p className="text-xs text-gray-400">{p.numero_pedido} · {formatFecha(p.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorEstadoPedido(p.estado)}`}>
                      {labelEstadoPedido(p.estado)}
                    </span>
                    {!esVendedor && (
                      <span className="text-xs font-semibold text-gray-700">{formatPEN(p.total)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
