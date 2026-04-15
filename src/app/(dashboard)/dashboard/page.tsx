// Dashboard principal — Server Component con métricas reales
import { createClient } from '@/lib/supabase/server'
import { formatPEN, formatFecha, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import { ShoppingCart, MessageSquare, Package, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import ActivityChart from '@/components/dashboard/ActivityChart'

export const dynamic = 'force-dynamic'

// Nombres cortos de días para el gráfico
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Obtener la ferretería del usuario
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp')
    .eq('owner_id', user!.id)
    .single()

  if (!ferreteria) return null

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyISO = hoy.toISOString()

  // Inicio de los últimos 7 días
  const hace7dias = new Date(hoy)
  hace7dias.setDate(hoy.getDate() - 6)
  const hace7diasISO = hace7dias.toISOString()

  // Consultas en paralelo
  const [
    { count: cotizacionesHoy },
    { count: pedidosHoy },
    { count: pedidosPendientes },
    { data: pedidosData },
    { data: pedidosRecientes },
    { data: cotizaciones7dias },
    { data: pedidos7dias },
    { data: itemsCotizacion },
  ] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .gte('created_at', hoyISO),

    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .gte('created_at', hoyISO),

    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .eq('estado', 'pendiente'),

    supabase
      .from('pedidos')
      .select('total')
      .eq('ferreteria_id', ferreteria.id)
      .gte('created_at', hoyISO)
      .neq('estado', 'cancelado'),

    supabase
      .from('pedidos')
      .select('id, numero_pedido, nombre_cliente, estado, total, created_at')
      .eq('ferreteria_id', ferreteria.id)
      .order('created_at', { ascending: false })
      .limit(5),

    // Cotizaciones últimos 7 días
    supabase
      .from('cotizaciones')
      .select('created_at')
      .eq('ferreteria_id', ferreteria.id)
      .gte('created_at', hace7diasISO),

    // Pedidos últimos 7 días
    supabase
      .from('pedidos')
      .select('created_at')
      .eq('ferreteria_id', ferreteria.id)
      .gte('created_at', hace7diasISO),

    // Items de cotizaciones para top productos (último mes)
    supabase
      .from('items_cotizacion')
      .select('nombre_producto, cantidad, cotizaciones!inner(ferreteria_id, created_at)')
      .eq('cotizaciones.ferreteria_id', ferreteria.id)
      .gte('cotizaciones.created_at', (() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString()
      })()),
  ])

  const ingresosHoy = (pedidosData ?? []).reduce((sum, p) => sum + (p.total ?? 0), 0)

  // Construir datos del gráfico últimos 7 días
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(hace7dias)
    fecha.setDate(hace7dias.getDate() + i)
    const fechaStr = fecha.toISOString().slice(0, 10)
    const diaNombre = DIAS_CORTOS[fecha.getDay()]

    const pedidos = (pedidos7dias ?? []).filter(
      (p) => p.created_at.slice(0, 10) === fechaStr
    ).length

    const cotizaciones = (cotizaciones7dias ?? []).filter(
      (c) => c.created_at.slice(0, 10) === fechaStr
    ).length

    return { dia: diaNombre, pedidos, cotizaciones }
  })

  // Top 5 productos más solicitados
  const conteoProductos: Record<string, number> = {}
  for (const item of (itemsCotizacion ?? [])) {
    const nombre = item.nombre_producto
    conteoProductos[nombre] = (conteoProductos[nombre] ?? 0) + (item.cantidad ?? 1)
  }
  const topProductos = Object.entries(conteoProductos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const metricas = [
    {
      label: 'Cotizaciones hoy',
      valor: cotizacionesHoy ?? 0,
      icono: MessageSquare,
      color: 'bg-blue-50 text-blue-600',
      desc: 'solicitudes de precio',
    },
    {
      label: 'Pedidos hoy',
      valor: pedidosHoy ?? 0,
      icono: ShoppingCart,
      color: 'bg-green-50 text-green-600',
      desc: 'órdenes recibidas',
    },
    {
      label: 'Pedidos pendientes',
      valor: pedidosPendientes ?? 0,
      icono: Package,
      color: 'bg-yellow-50 text-yellow-600',
      desc: 'esperando atención',
    },
    {
      label: 'Ingresos hoy',
      valor: formatPEN(ingresosHoy),
      icono: TrendingUp,
      color: 'bg-orange-50 text-orange-600',
      desc: 'en pedidos confirmados',
    },
  ]

  return (
    <div className="p-4 sm:p-8">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Hola, bienvenido a {ferreteria.nombre}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('es-PE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          })}
        </p>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6">
        {metricas.map(({ label, valor, icono: Icon, color, desc }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
            <div className={`inline-flex p-2.5 rounded-lg ${color} mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{valor}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 hidden sm:block">{desc}</p>
          </div>
        ))}
      </div>

      {/* Gráfico + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
        {/* Gráfico últimos 7 días */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Actividad últimos 7 días</h3>
          <ActivityChart datos={chartData} />
        </div>

        {/* Top productos */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Productos más pedidos</h3>
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
                      <div
                        className="bg-orange-400 h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Estado del sistema + Pedidos recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
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
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Número conectado</span>
              <span className="text-sm font-medium text-gray-800">
                +{ferreteria.telefono_whatsapp}
              </span>
            </div>
            <div className="pt-1 space-y-1.5">
              {[
                { label: 'Ver pedidos pendientes', href: '/dashboard/orders' },
                { label: 'Agregar producto', href: '/dashboard/catalog/new' },
                { label: 'Ver conversaciones', href: '/dashboard/conversations' },
                { label: 'Configuración', href: '/dashboard/settings' },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center text-sm text-orange-600 hover:text-orange-700 hover:underline"
                >
                  → {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Pedidos recientes</h3>
            <Link href="/dashboard/orders" className="text-xs text-orange-500 hover:underline">
              Ver todos →
            </Link>
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
                    <span className="text-xs font-semibold text-gray-700">{formatPEN(p.total)}</span>
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
