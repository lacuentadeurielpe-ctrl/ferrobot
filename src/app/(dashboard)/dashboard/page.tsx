// Dashboard principal — "los primeros 3 minutos del día"
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { formatPEN, labelEstadoPedido, colorEstadoPedido } from '@/lib/utils'
import {
  ShoppingCart, MessageSquare, AlertTriangle,
  Clock, CheckCircle2, Truck, Package, DollarSign,
  ChevronRight, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import ActivityChart from '@/components/dashboard/ActivityChart'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import { redirect } from 'next/navigation'
import { inicioDiaLima, finDiaLima, fechaLimaStr, fechaLocalLima, etiquetaFechaLima, ahoraLima } from '@/lib/tiempo'

export const dynamic = 'force-dynamic'

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// ── Cálculo de rango para el período seleccionado ─────────────────────────────
function calcPeriodo(p: string): {
  inicio: string; fin: string
  prevInicio: string; prevFin: string
  label: string; dias: number
} {
  const finHoy = finDiaLima(0)

  switch (p) {
    case 'ayer': {
      const inicio = inicioDiaLima(-1)
      const fin    = inicioDiaLima(0)
      return { inicio, fin, prevInicio: inicioDiaLima(-2), prevFin: inicio, label: 'Ayer', dias: 1 }
    }
    case 'semana': {
      const lima = ahoraLima()
      const dow  = lima.getUTCDay()           // 0=dom…6=sáb
      const diasDesdeL = dow === 0 ? 6 : dow - 1
      const inicio = inicioDiaLima(-diasDesdeL)
      return {
        inicio, fin: finHoy,
        prevInicio: inicioDiaLima(-diasDesdeL - 7),
        prevFin: inicio,
        label: 'Esta semana',
        dias: diasDesdeL + 1,
      }
    }
    case 'mes': {
      const lima = ahoraLima()
      const yyyy = lima.getUTCFullYear()
      const mm   = String(lima.getUTCMonth() + 1).padStart(2, '0')
      const dia  = lima.getUTCDate()
      const inicio = `${yyyy}-${mm}-01T05:00:00Z`
      // Mes anterior: mismo rango de días
      const prevLima = ahoraLima()
      prevLima.setUTCMonth(prevLima.getUTCMonth() - 1)
      const pYyyy = prevLima.getUTCFullYear()
      const pMm   = String(prevLima.getUTCMonth() + 1).padStart(2, '0')
      const prevInicio = `${pYyyy}-${pMm}-01T05:00:00Z`
      return { inicio, fin: finHoy, prevInicio, prevFin: inicio, label: 'Este mes', dias: dia }
    }
    case '30d': {
      const inicio = inicioDiaLima(-29)
      return { inicio, fin: finHoy, prevInicio: inicioDiaLima(-59), prevFin: inicio, label: 'Últimos 30 días', dias: 30 }
    }
    default: { // 'hoy'
      const inicio = inicioDiaLima(0)
      return { inicio, fin: finHoy, prevInicio: inicioDiaLima(-1), prevFin: inicio, label: 'Hoy', dias: 1 }
    }
  }
}

// ── Comparativa % de cambio ───────────────────────────────────────────────────
function cambio(actual: number, prev: number): { pct: number; sube: boolean } | null {
  if (prev === 0) return actual > 0 ? { pct: 100, sube: true } : null
  const pct = Math.round(((actual - prev) / prev) * 100)
  return { pct: Math.abs(pct), sube: pct >= 0 }
}

const ESTADOS_PIPELINE: Array<{ key: string; label: string; icon: React.ElementType; color: string }> = [
  { key: 'pendiente',      label: 'Pendiente',    icon: Clock,         color: 'text-yellow-500' },
  { key: 'confirmado',     label: 'Confirmado',   icon: CheckCircle2,  color: 'text-blue-500'   },
  { key: 'en_preparacion', label: 'Preparando',   icon: Package,       color: 'text-purple-500' },
  { key: 'enviado',        label: 'Enviado',      icon: Truck,         color: 'text-orange-500' },
  { key: 'entregado',      label: 'Entregado',    icon: CheckCircle2,  color: 'text-green-500'  },
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  const { p: periodo = 'hoy' } = await searchParams

  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()
  const fid = session.ferreteriaId
  const esVendedor = session.rol === 'vendedor'

  // Límites en hora Lima (UTC correcta)
  const inicioHoy = inicioDiaLima(0)

  // Período seleccionado
  const per = calcPeriodo(periodo)

  // Hace 30 días para gráfico y top productos
  const hace30diasISO = inicioDiaLima(-29)

  // ── Todas las queries en paralelo ───────────────────────────────────────────
  const [
    // ALERTAS: pedidos de delivery sin repartidor asignado
    { data: sinRepartidor },
    // ALERTAS: cotizaciones esperando confirmación del cliente (> 4h)
    { count: cotPendientesAntiguas },
    // PIPELINE: todos los pedidos activos (no cancelados)
    { data: pedidosActivos },
    // COBROS: pedidos entregados hoy con pago pendiente
    { data: cobrosPendientes },
    // GRÁFICO 30 días
    { data: pedidos7dias },
    { data: cotizaciones7dias },
    // TOP productos 30 días
    { data: itemsCotizacion },
    // ALERTAS: productos con stock <= stock_minimo
    { data: productosStockBajo },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero_pedido, nombre_cliente, total')
      .eq('ferreteria_id', fid)
      .eq('modalidad', 'delivery')
      .eq('estado', 'confirmado')
      .is('repartidor_id', null),

    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', fid)
      .eq('estado', 'enviada')
      .lt('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()),

    supabase
      .from('pedidos')
      .select('id, estado, total, nombre_cliente, numero_pedido, created_at')
      .eq('ferreteria_id', fid)
      .not('estado', 'in', '(cancelado)')
      .order('created_at', { ascending: false }),

    supabase
      .from('pedidos')
      .select('id, numero_pedido, nombre_cliente, total, metodo_pago')
      .eq('ferreteria_id', fid)
      .eq('estado', 'entregado')
      .neq('estado_pago', 'pagado')
      .gte('created_at', inicioHoy),

    supabase
      .from('pedidos')
      .select('created_at')
      .eq('ferreteria_id', fid)
      .gte('created_at', hace30diasISO),

    supabase
      .from('cotizaciones')
      .select('created_at')
      .eq('ferreteria_id', fid)
      .gte('created_at', hace30diasISO),

    supabase
      .from('items_cotizacion')
      .select('nombre_producto, cantidad, cotizaciones!inner(ferreteria_id, created_at)')
      .eq('cotizaciones.ferreteria_id', fid)
      .gte('cotizaciones.created_at', hace30diasISO),

    supabase
      .from('productos')
      .select('id, nombre, stock, stock_minimo, unidad')
      .eq('ferreteria_id', fid)
      .eq('activo', true)
      .not('stock_minimo', 'is', null),
  ])

  // ── Queries del período seleccionado (corren en paralelo) ─────────────────
  const [
    { data: pedidosPer },
    { data: pedidosPrevPer },
    { count: convPer },
    { count: convPrevPer },
  ] = await Promise.all([
    supabase.from('pedidos').select('estado, total, costo_total')
      .eq('ferreteria_id', fid).gte('created_at', per.inicio).lt('created_at', per.fin),
    supabase.from('pedidos').select('estado, total, costo_total')
      .eq('ferreteria_id', fid).gte('created_at', per.prevInicio).lt('created_at', per.prevFin),
    supabase.from('conversaciones').select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', fid).gte('updated_at', per.inicio).lt('updated_at', per.fin),
    supabase.from('conversaciones').select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', fid).gte('updated_at', per.prevInicio).lt('updated_at', per.prevFin),
  ])

  // ── Cómputos ───────────────────────────────────────────────────────────────

  // Pipeline: contar por estado
  const pipeline: Record<string, number> = {}
  for (const p of pedidosActivos ?? []) {
    pipeline[p.estado] = (pipeline[p.estado] ?? 0) + 1
  }

  // Pedidos recientes (últimos 5 no cancelados)
  const pedidosRecientes = (pedidosActivos ?? [])
    .filter(p => p.estado !== 'cancelado')
    .slice(0, 5)

  // Top productos
  const conteoProductos: Record<string, number> = {}
  for (const item of itemsCotizacion ?? []) {
    conteoProductos[item.nombre_producto] = (conteoProductos[item.nombre_producto] ?? 0) + (item.cantidad ?? 1)
  }
  const topProductos = Object.entries(conteoProductos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Estadísticas del período seleccionado
  const pedidosPerArr    = pedidosPer ?? []
  const pedidosPrevArr   = pedidosPrevPer ?? []
  const totalPerPedidos  = pedidosPerArr.length
  const prevPerPedidos   = pedidosPrevArr.length
  const perEntregados    = pedidosPerArr.filter(p => p.estado === 'entregado').length
  const perIngresos      = pedidosPerArr.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + (p.total ?? 0), 0)
  const prevPerIngresos  = pedidosPrevArr.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + (p.total ?? 0), 0)
  const perGanancia      = !esVendedor
    ? pedidosPerArr.filter(p => p.estado === 'entregado').reduce((s, p) => s + (p.total ?? 0) - (p.costo_total ?? 0), 0)
    : 0

  const cmbPedidos   = cambio(totalPerPedidos, prevPerPedidos)
  const cmbIngresos  = cambio(perIngresos, prevPerIngresos)
  const cmbConv      = cambio(convPer ?? 0, convPrevPer ?? 0)

  // Gráfico 30 días — fechas en hora Lima
  // Renombramos las variables (ya se usan pedidos30dias/cotizaciones30dias)
  const pedidos30dias      = pedidos7dias      // misma var, ahora contiene 30d
  const cotizaciones30dias = cotizaciones7dias // misma var, ahora contiene 30d

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const fechaStr = fechaLimaStr(-29 + i)  // "YYYY-MM-DD" en Lima
    const diaSemana = new Date(`${fechaStr}T12:00:00Z`).getUTCDay()
    // Para 30 días: etiqueta "dd/mm" cada 5 días, resto vacío (Recharts lo maneja)
    const dd = fechaStr.slice(8, 10)
    const mm = fechaStr.slice(5, 7)
    return {
      dia: `${dd}/${mm}`,
      diaSemana: DIAS_CORTOS[diaSemana],
      pedidos:      (pedidos30dias      ?? []).filter(p => fechaLocalLima(p.created_at) === fechaStr).length,
      cotizaciones: (cotizaciones30dias ?? []).filter(c => fechaLocalLima(c.created_at) === fechaStr).length,
    }
  })

  // Stock bajo: filtrar los que tienen stock <= stock_minimo
  const stockBajo = (productosStockBajo ?? []).filter(
    p => p.stock_minimo !== null && p.stock <= p.stock_minimo
  )

  // Alertas
  const alertas: Array<{ nivel: 'rojo' | 'naranja' | 'amarillo'; texto: string; href: string }> = []
  if ((sinRepartidor ?? []).length > 0) {
    const n = sinRepartidor!.length
    alertas.push({
      nivel: 'rojo',
      texto: `${n} pedido${n > 1 ? 's' : ''} de delivery sin repartidor asignado`,
      href: '/dashboard/orders',
    })
  }
  if ((cotPendientesAntiguas ?? 0) > 0) {
    alertas.push({
      nivel: 'naranja',
      texto: `${cotPendientesAntiguas} cotización${(cotPendientesAntiguas ?? 0) > 1 ? 'es' : ''} sin respuesta del cliente hace más de 4 horas`,
      href: '/dashboard/cotizaciones',
    })
  }
  if ((cobrosPendientes ?? []).length > 0) {
    const n = cobrosPendientes!.length
    alertas.push({
      nivel: 'amarillo',
      texto: `${n} entrega${n > 1 ? 's' : ''} de hoy con cobro pendiente`,
      href: '/dashboard/orders',
    })
  }
  if (stockBajo.length > 0) {
    const nombres = stockBajo.slice(0, 2).map(p => p.nombre).join(', ')
    const extra = stockBajo.length > 2 ? ` y ${stockBajo.length - 2} más` : ''
    alertas.push({
      nivel: 'naranja',
      texto: `Stock crítico: ${nombres}${extra}`,
      href: '/dashboard/catalog',
    })
  }

  const colorAlerta = { rojo: 'bg-red-50 border-red-200 text-red-800', naranja: 'bg-orange-50 border-orange-200 text-orange-800', amarillo: 'bg-yellow-50 border-yellow-200 text-yellow-800' }
  const iconoAlerta = { rojo: '🔴', naranja: '🟠', amarillo: '🟡' }

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-6xl mx-auto">

      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{session.nombreFerreteria}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{etiquetaFechaLima()}</p>
        </div>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>

      {/* ── BLOQUE 1: Alertas ─────────────────────────────────────────────── */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((alerta, i) => (
            <Link
              key={i}
              href={alerta.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition hover:opacity-80 ${colorAlerta[alerta.nivel]}`}
            >
              <span className="text-base">{iconoAlerta[alerta.nivel]}</span>
              <span className="flex-1">{alerta.texto}</span>
              <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
            </Link>
          ))}
        </div>
      )}

      {/* ── BLOQUE 2: KPIs del período seleccionado ──────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{per.label}</p>
        <div className={`grid gap-3 ${esVendedor ? 'grid-cols-2' : 'grid-cols-3'}`}>

          {/* Pedidos */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-green-500" />
              <p className="text-xs text-gray-500">Pedidos</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalPerPedidos}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">{perEntregados} entregados</p>
              {cmbPedidos && (
                <span className={`text-xs font-medium ${cmbPedidos.sube ? 'text-green-600' : 'text-red-500'}`}>
                  {cmbPedidos.sube ? '↑' : '↓'}{cmbPedidos.pct}%
                </span>
              )}
            </div>
          </div>

          {/* Ingresos — solo dueño */}
          {!esVendedor && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-orange-500" />
                <p className="text-xs text-gray-500">Ingresos</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatPEN(perIngresos)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {perGanancia > 0 && (
                  <p className="text-xs text-gray-400">Gan: {formatPEN(perGanancia)}</p>
                )}
                {cmbIngresos && (
                  <span className={`text-xs font-medium ${cmbIngresos.sube ? 'text-green-600' : 'text-red-500'}`}>
                    {cmbIngresos.sube ? '↑' : '↓'}{cmbIngresos.pct}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Conversaciones */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-gray-500">Conversaciones</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{convPer ?? 0}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">chats activos</p>
              {cmbConv && (
                <span className={`text-xs font-medium ${cmbConv.sube ? 'text-green-600' : 'text-red-500'}`}>
                  {cmbConv.sube ? '↑' : '↓'}{cmbConv.pct}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: Hoy — Pipeline + Cobros ────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hoy</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Pipeline de pedidos */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Estado de pedidos</h3>
              <Link href="/dashboard/orders" className="text-xs text-orange-500 hover:underline flex items-center gap-0.5">
                Ver todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex items-center gap-1 mb-4">
              {ESTADOS_PIPELINE.map((estado, i) => {
                const count = pipeline[estado.key] ?? 0
                const activo = count > 0
                return (
                  <div key={estado.key} className="flex items-center gap-1 flex-1">
                    <Link
                      href={`/dashboard/orders?estado=${estado.key}`}
                      className={`flex-1 rounded-lg px-2 py-2.5 text-center transition ${activo ? 'bg-orange-50 hover:bg-orange-100' : 'bg-gray-50'}`}
                    >
                      <p className={`text-xl font-bold ${activo ? 'text-orange-600' : 'text-gray-400'}`}>{count}</p>
                      <p className={`text-xs mt-0.5 ${activo ? 'text-gray-600' : 'text-gray-400'}`}>{estado.label}</p>
                    </Link>
                    {i < ESTADOS_PIPELINE.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-gray-200 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
            {/* Pedidos recientes */}
            <div className="space-y-1.5 border-t border-gray-50 pt-3">
              {pedidosRecientes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">Sin pedidos activos</p>
              ) : (
                pedidosRecientes.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-700 truncate">{p.nombre_cliente}</span>
                      <span className="text-gray-400 ml-1.5">{p.numero_pedido}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${colorEstadoPedido(p.estado)}`}>
                      {labelEstadoPedido(p.estado)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cobros pendientes */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Cobros pendientes hoy</h3>
              {(cobrosPendientes ?? []).length > 0 && (
                <span className="text-xs bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-full">
                  {(cobrosPendientes ?? []).length} sin cobrar
                </span>
              )}
            </div>
            {(cobrosPendientes ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-300 mb-2" />
                <p className="text-sm text-gray-400">Todo cobrado por hoy 🎉</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(cobrosPendientes ?? []).map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-yellow-50 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.nombre_cliente}</p>
                      <p className="text-xs text-gray-500">{p.numero_pedido} · {p.metodo_pago ?? 'sin método'}</p>
                    </div>
                    {!esVendedor && (
                      <p className="text-sm font-bold text-gray-800 shrink-0 ml-2">{formatPEN(p.total)}</p>
                    )}
                  </div>
                ))}
                <Link
                  href="/dashboard/orders"
                  className="block text-center text-xs text-orange-500 hover:underline pt-1"
                >
                  Gestionar cobros →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BLOQUE 4: Gráfico + Top productos ────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Últimos 30 días</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Actividad</h3>
            <ActivityChart datos={chartData} />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
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
      </div>

    </div>
  )
}
