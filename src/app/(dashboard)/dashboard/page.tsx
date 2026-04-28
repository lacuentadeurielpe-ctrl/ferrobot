// Dashboard principal — Fase 2 REFORMA
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { formatPEN, labelEstadoPedido } from '@/lib/utils'
import {
  ShoppingCart, MessageSquare, TrendingUp, TrendingDown,
  Clock, CheckCircle2, Truck, Package, Banknote,
  FileText, CreditCard, Target, Users, Zap, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import ActivityChart from '@/components/dashboard/ActivityChart'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import { redirect } from 'next/navigation'
import { inicioDiaLima, finDiaLima, fechaLimaStr, fechaLocalLima, etiquetaFechaLima, ahoraLima } from '@/lib/tiempo'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function calcPeriodo(p: string): { inicio: string; fin: string; prevInicio: string; prevFin: string; label: string; dias: number } {
  const finHoy = finDiaLima(0)
  switch (p) {
    case 'ayer': {
      const inicio = inicioDiaLima(-1)
      const fin    = inicioDiaLima(0)
      return { inicio, fin, prevInicio: inicioDiaLima(-2), prevFin: inicio, label: 'Ayer', dias: 1 }
    }
    case 'semana': {
      const lima = ahoraLima(); const dow = lima.getUTCDay()
      const diasDesdeL = dow === 0 ? 6 : dow - 1
      const inicio = inicioDiaLima(-diasDesdeL)
      return { inicio, fin: finHoy, prevInicio: inicioDiaLima(-diasDesdeL - 7), prevFin: inicio, label: 'Esta semana', dias: diasDesdeL + 1 }
    }
    case 'mes': {
      const lima = ahoraLima()
      const yyyy = lima.getUTCFullYear(); const mm = String(lima.getUTCMonth() + 1).padStart(2, '0'); const dia = lima.getUTCDate()
      const inicio = `${yyyy}-${mm}-01T05:00:00Z`
      const prevLima = ahoraLima(); prevLima.setUTCMonth(prevLima.getUTCMonth() - 1)
      const pYyyy = prevLima.getUTCFullYear(); const pMm = String(prevLima.getUTCMonth() + 1).padStart(2, '0')
      return { inicio, fin: finHoy, prevInicio: `${pYyyy}-${pMm}-01T05:00:00Z`, prevFin: inicio, label: 'Este mes', dias: dia }
    }
    case '30d': {
      const inicio = inicioDiaLima(-29)
      return { inicio, fin: finHoy, prevInicio: inicioDiaLima(-59), prevFin: inicio, label: 'Últimos 30 días', dias: 30 }
    }
    default: {
      const inicio = inicioDiaLima(0)
      return { inicio, fin: finHoy, prevInicio: inicioDiaLima(-1), prevFin: inicio, label: 'Hoy', dias: 1 }
    }
  }
}

function cambio(actual: number, prev: number): { pct: number; sube: boolean } | null {
  if (prev === 0) return actual > 0 ? { pct: 100, sube: true } : null
  const pct = Math.round(((actual - prev) / prev) * 100)
  return { pct: Math.abs(pct), sube: pct >= 0 }
}

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

// Estados que cuentan como "activos" (no incluye entregado ni cancelado)
const ESTADOS_EN_CURSO = ['pendiente', 'confirmado', 'en_preparacion', 'enviado']

const ESTADOS_PIPELINE = [
  { key: 'pendiente',      label: 'Pendiente',  icon: Clock,        bg: 'bg-amber-50',   dot: 'bg-amber-400',   text: 'text-amber-700'  },
  { key: 'confirmado',     label: 'Confirmado', icon: CheckCircle2, bg: 'bg-sky-50',     dot: 'bg-sky-400',     text: 'text-sky-700'    },
  { key: 'en_preparacion', label: 'Preparando', icon: Package,      bg: 'bg-violet-50',  dot: 'bg-violet-400',  text: 'text-violet-700' },
  { key: 'enviado',        label: 'En camino',  icon: Truck,        bg: 'bg-blue-50',    dot: 'bg-blue-400',    text: 'text-blue-700'   },
  { key: 'entregado',      label: 'Entregado',  icon: CheckCircle2, bg: 'bg-emerald-50', dot: 'bg-emerald-400', text: 'text-emerald-700'},
]

function colorFeed(estado: string): string {
  const map: Record<string, string> = { entregado: 'bg-emerald-400', enviado: 'bg-blue-400', en_preparacion: 'bg-violet-400', confirmado: 'bg-sky-400', pendiente: 'bg-amber-400', cancelado: 'bg-red-400' }
  return map[estado] ?? 'bg-zinc-300'
}
function textFeed(estado: string): string {
  const map: Record<string, string> = { entregado: 'Pedido entregado', enviado: 'Pedido en camino', en_preparacion: 'En preparación', confirmado: 'Pedido confirmado', pendiente: 'Pedido recibido', cancelado: 'Pedido cancelado' }
  return map[estado] ?? labelEstadoPedido(estado)
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p: periodo = 'hoy' } = await searchParams
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase   = await createClient()
  const fid        = session.ferreteriaId
  const esVendedor = session.rol === 'vendedor'
  const esDueno    = !esVendedor
  const inicioHoy  = inicioDiaLima(0)
  const inicioAyer = inicioDiaLima(-1)
  const per        = calcPeriodo(periodo)
  const hace30     = inicioDiaLima(-29)

  // ── Queries en paralelo ──────────────────────────────────────────────
  const [
    { data: pedidosActivos },
    { data: cobrosPendientes },
    { data: pedidos30d },
    { data: cotizaciones30d },
    { data: itemsCotizacion },
    { data: pedidosHoy },
    { data: pedidosAyer },
    { count: convActivas },
    { data: feedPedidos },
    { data: feedCotizaciones },
    { data: feedPagos },
  ] = await Promise.all([
    // Pedidos activos para pipeline (todos menos cancelados)
    supabase.from('pedidos').select('id, estado, total, nombre_cliente, numero_pedido, created_at, updated_at')
      .eq('ferreteria_id', fid).not('estado', 'in', '(cancelado)').order('created_at', { ascending: false }),
    // Cobros pendientes hoy
    supabase.from('pedidos').select('id, numero_pedido, nombre_cliente, total, metodo_pago')
      .eq('ferreteria_id', fid).eq('estado', 'entregado').neq('estado_pago', 'pagado').gte('created_at', inicioHoy),
    // Gráfico 30d
    supabase.from('pedidos').select('created_at').eq('ferreteria_id', fid).gte('created_at', hace30),
    supabase.from('cotizaciones').select('created_at').eq('ferreteria_id', fid).gte('created_at', hace30),
    // Top productos
    supabase.from('items_cotizacion').select('nombre_producto, cantidad, cotizaciones!inner(ferreteria_id, created_at)')
      .eq('cotizaciones.ferreteria_id', fid).gte('cotizaciones.created_at', hace30),
    // Snapshot hoy/ayer
    supabase.from('pedidos').select('total, estado').eq('ferreteria_id', fid).gte('created_at', inicioHoy).neq('estado', 'cancelado'),
    supabase.from('pedidos').select('total').eq('ferreteria_id', fid).gte('created_at', inicioAyer).lt('created_at', inicioHoy).neq('estado', 'cancelado'),
    // Chats pausados
    supabase.from('conversaciones').select('*', { count: 'exact', head: true }).eq('ferreteria_id', fid).eq('bot_pausado', true),
    // Feed actividad
    supabase.from('pedidos').select('id, numero_pedido, nombre_cliente, estado, updated_at, total')
      .eq('ferreteria_id', fid).not('estado', 'in', '(pendiente)').order('updated_at', { ascending: false }).limit(14),
    supabase.from('cotizaciones').select('id, estado, created_at, clientes(nombre)')
      .eq('ferreteria_id', fid).order('created_at', { ascending: false }).limit(6),
    supabase.from('pagos_registrados').select('id, monto, estado, registrado_at, clientes(nombre)')
      .eq('ferreteria_id', fid).order('registrado_at', { ascending: false }).limit(5),
  ])

  // Queries del período
  const [
    { data: pedidosPer }, { data: pedidosPrevPer },
    { count: convPer },   { count: convPrevPer },
    { count: clientesNuevosPer }, { count: clientesPrevPer },
  ] = await Promise.all([
    supabase.from('pedidos').select('estado, total, costo_total').eq('ferreteria_id', fid).gte('created_at', per.inicio).lt('created_at', per.fin),
    supabase.from('pedidos').select('estado, total, costo_total').eq('ferreteria_id', fid).gte('created_at', per.prevInicio).lt('created_at', per.prevFin),
    supabase.from('conversaciones').select('*', { count: 'exact', head: true }).eq('ferreteria_id', fid).gte('ultima_actividad', per.inicio).lt('ultima_actividad', per.fin),
    supabase.from('conversaciones').select('*', { count: 'exact', head: true }).eq('ferreteria_id', fid).gte('ultima_actividad', per.prevInicio).lt('ultima_actividad', per.prevFin),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('ferreteria_id', fid).gte('created_at', per.inicio).lt('created_at', per.fin),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('ferreteria_id', fid).gte('created_at', per.prevInicio).lt('created_at', per.prevFin),
  ])

  // ── Cómputos ──────────────────────────────────────────────────────────
  const pipeline: Record<string, number> = {}
  for (const p of pedidosActivos ?? []) pipeline[p.estado] = (pipeline[p.estado] ?? 0) + 1

  // Solo cuentan como "activos" los pedidos EN CURSO (no entregados ni cancelados)
  const pedidosActivosN = ESTADOS_EN_CURSO.reduce((s, key) => s + (pipeline[key] ?? 0), 0)
  const pedidosRecientes = (pedidosActivos ?? [])
    .filter(p => ESTADOS_EN_CURSO.includes(p.estado))
    .slice(0, 5)

  const conteoProductos: Record<string, number> = {}
  for (const item of itemsCotizacion ?? [])
    conteoProductos[item.nombre_producto] = (conteoProductos[item.nombre_producto] ?? 0) + (item.cantidad ?? 1)
  const topProductos = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const pedidosPerArr   = pedidosPer ?? []
  const pedidosPrevArr  = pedidosPrevPer ?? []
  const totalPerPedidos = pedidosPerArr.length
  const prevPerPedidos  = pedidosPrevArr.length
  const perEntregados   = pedidosPerArr.filter(p => p.estado === 'entregado').length
  const prevEntregados  = pedidosPrevArr.filter(p => p.estado === 'entregado').length
  const perIngresos     = pedidosPerArr.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + (p.total ?? 0), 0)
  const prevPerIngresos = pedidosPrevArr.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + (p.total ?? 0), 0)
  const perGanancia     = esDueno ? pedidosPerArr.filter(p => p.estado === 'entregado').reduce((s, p) => s + (p.total ?? 0) - (p.costo_total ?? 0), 0) : 0
  const ticketProm      = totalPerPedidos > 0 ? Math.round(perIngresos / totalPerPedidos) : 0
  const prevTicket      = prevPerPedidos  > 0 ? Math.round(prevPerIngresos / prevPerPedidos) : 0
  const tasaEntrega     = totalPerPedidos > 0 ? Math.round((perEntregados / totalPerPedidos) * 100) : 0
  const prevTasaEntrega = prevPerPedidos  > 0 ? Math.round((prevEntregados / prevPerPedidos) * 100) : 0

  const cmbPedidos  = cambio(totalPerPedidos, prevPerPedidos)
  const cmbIngresos = cambio(perIngresos, prevPerIngresos)
  const cmbConv     = cambio(convPer ?? 0, convPrevPer ?? 0)
  const cmbTicket   = cambio(ticketProm, prevTicket)
  const cmbTasa     = cambio(tasaEntrega, prevTasaEntrega)
  const cmbClientes = cambio(clientesNuevosPer ?? 0, clientesPrevPer ?? 0)

  // Snapshot hoy
  const ingresosHoy  = (pedidosHoy ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const ingresosAyer = (pedidosAyer ?? []).reduce((s, p) => s + (p.total ?? 0), 0)
  const cmbHoy       = cambio(ingresosHoy, ingresosAyer)
  const cobrosN      = (cobrosPendientes ?? []).length

  // Gráfico 30d
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const fechaStr  = fechaLimaStr(-29 + i)
    const diaSemana = new Date(`${fechaStr}T12:00:00Z`).getUTCDay()
    const dd = fechaStr.slice(8, 10); const mm = fechaStr.slice(5, 7)
    return {
      dia: `${dd}/${mm}`, diaSemana: DIAS_CORTOS[diaSemana],
      pedidos:      (pedidos30d      ?? []).filter(p => fechaLocalLima(p.created_at) === fechaStr).length,
      cotizaciones: (cotizaciones30d ?? []).filter(c => fechaLocalLima(c.created_at) === fechaStr).length,
    }
  })

  // Feed actividad
  type FeedEntry = { id: string; dot: string; titulo: string; subtitulo: string; ts: string; icono: React.ElementType; href: string }
  const feed: FeedEntry[] = [
    ...(feedPedidos ?? []).map(p => ({
      id: 'p_' + p.id, dot: colorFeed(p.estado),
      titulo: textFeed(p.estado), subtitulo: `${p.nombre_cliente} · ${p.numero_pedido}`,
      ts: p.updated_at, icono: ShoppingCart, href: '/dashboard/ventas?tab=pedidos',
    })),
    ...(feedCotizaciones ?? []).map(c => ({
      id: 'c_' + c.id, dot: 'bg-zinc-400',
      titulo: 'Cotización enviada', subtitulo: (c.clientes as { nombre?: string } | null)?.nombre ?? 'cliente',
      ts: c.created_at, icono: FileText, href: '/dashboard/ventas?tab=cotizaciones',
    })),
    ...(feedPagos ?? []).map(p => ({
      id: 'pg_' + p.id,
      dot: p.estado === 'confirmado_auto' ? 'bg-emerald-400' : p.estado === 'pendiente_revision' ? 'bg-amber-400' : 'bg-zinc-300',
      titulo: 'Pago recibido',
      subtitulo: `S/${p.monto} · ${(p.clientes as { nombre?: string } | null)?.nombre ?? 'cliente'}`,
      ts: p.registrado_at, icono: CreditCard, href: '/dashboard/ventas?tab=pagos',
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 9)

  // KPI cards config
  type KpiCard = { label: string; valor: string; sub: string; delta: ReturnType<typeof cambio>; icon: React.ElementType; accent: string; visible: boolean; href: string }
  const kpiCards: KpiCard[] = [
    { label: 'Pedidos',        valor: String(totalPerPedidos),                       sub: `${perEntregados} entregados`,              delta: cmbPedidos,  icon: ShoppingCart, accent: 'text-blue-500 bg-blue-50',     visible: true,    href: '/dashboard/ventas?tab=pedidos'      },
    { label: 'Ingresos',       valor: formatPEN(perIngresos),                        sub: esDueno && perGanancia > 0 ? `Gan. ${formatPEN(perGanancia)}` : ' ', delta: cmbIngresos, icon: Banknote, accent: 'text-emerald-600 bg-emerald-50', visible: esDueno, href: '/dashboard/ventas?tab=pagos'        },
    { label: 'Ticket prom.',   valor: ticketProm > 0 ? formatPEN(ticketProm) : '—',  sub: 'por pedido',                               delta: cmbTicket,   icon: Target,       accent: 'text-violet-600 bg-violet-50',  visible: esDueno, href: '/dashboard/ventas?tab=pedidos'      },
    { label: 'Tasa entrega',   valor: tasaEntrega > 0 ? `${tasaEntrega}%` : '—',     sub: `${perEntregados} de ${totalPerPedidos}`,   delta: cmbTasa,     icon: Truck,        accent: 'text-amber-600 bg-amber-50',    visible: true,    href: '/dashboard/ventas?tab=pedidos'      },
    { label: 'Clientes nuevos',valor: String(clientesNuevosPer ?? 0),                sub: 'del período',                              delta: cmbClientes, icon: Users,        accent: 'text-sky-600 bg-sky-50',        visible: esDueno, href: '/dashboard/clientes'                },
    { label: 'Conversaciones', valor: String(convPer ?? 0),                          sub: `${convActivas ?? 0} pausadas`,             delta: cmbConv,     icon: MessageSquare,accent: 'text-zinc-600 bg-zinc-100',     visible: true,    href: '/dashboard/conversations'           },
  ].filter(k => k.visible)

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">{session.nombreFerreteria}</h1>
          <p className="text-zinc-400 text-sm mt-0.5 capitalize">{etiquetaFechaLima()}</p>
        </div>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>

      {/* ── SNAPSHOT DEL DÍA — siempre muestra hoy, todo clickeable ───── */}
      <div className="bg-zinc-950 rounded-2xl p-5 text-white overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/[0.03]" />
          <div className="absolute -right-4   top-8  w-24 h-24 rounded-full bg-white/[0.03]" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Resumen de hoy</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Ingresos hoy */}
          <Link href="/dashboard/ventas?tab=pagos" className="group p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer">
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">
              {esDueno ? formatPEN(ingresosHoy) : String((pedidosHoy ?? []).length)}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-zinc-500">{esDueno ? 'ingresos hoy' : 'pedidos hoy'}</p>
              {esDueno && cmbHoy && (
                <span className={cn('text-xs font-semibold flex items-center gap-0.5', cmbHoy.sube ? 'text-emerald-400' : 'text-red-400')}>
                  {cmbHoy.sube ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
                  {cmbHoy.pct}%
                </span>
              )}
            </div>
          </Link>
          {/* Pedidos activos — solo en curso, no incluye entregados */}
          <Link href="/dashboard/ventas?tab=pedidos" className="group p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer">
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{pedidosActivosN}</p>
            <p className="text-xs text-zinc-500 mt-1">pedidos en curso</p>
          </Link>
          {/* Cobros pendientes */}
          <Link href="/dashboard/ventas?tab=pedidos" className="group p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer">
            <p className={cn('text-2xl sm:text-3xl font-bold tabular-nums', cobrosN > 0 ? 'text-amber-400' : '')}>{cobrosN}</p>
            <p className="text-xs text-zinc-500 mt-1">por cobrar hoy</p>
          </Link>
          {/* Chats pausados */}
          <Link href="/dashboard/conversations" className="group p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer">
            <p className={cn('text-2xl sm:text-3xl font-bold tabular-nums', (convActivas ?? 0) > 0 ? 'text-sky-400' : '')}>{convActivas ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">chats pausados</p>
          </Link>
        </div>
      </div>

      {/* ── KPI CARDS — todas clickeables ──────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">{per.label}</p>
        <div className={cn('grid gap-3', kpiCards.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
          {kpiCards.map((k) => (
            <Link key={k.label} href={k.href}
              className="bg-white rounded-2xl border border-zinc-100 p-4 hover:border-zinc-300 hover:shadow-sm transition group">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-400 leading-tight">{k.label}</p>
                <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center', k.accent)}>
                  <k.icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight tabular-nums leading-none">{k.valor}</p>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-zinc-400 truncate">{k.sub}</p>
                {k.delta && (
                  <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold shrink-0', k.delta.sube ? 'text-emerald-600' : 'text-red-500')}>
                    {k.delta.sube ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
                    {k.delta.pct}%
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── PIPELINE + FEED ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Pipeline — barras clickeables */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900">Estado de pedidos</h3>
            <Link href="/dashboard/ventas?tab=pedidos"
              className="text-xs text-zinc-400 hover:text-zinc-900 transition flex items-center gap-0.5 font-medium">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2 mb-4">
            {ESTADOS_PIPELINE.map((estado) => {
              const count = pipeline[estado.key] ?? 0
              // Para el porcentaje, usamos el total del pipeline (todos los estados visibles)
              const totalPipeline = Object.values(pipeline).reduce((s, n) => s + n, 0) || 1
              const pct   = Math.round((count / totalPipeline) * 100)
              const Icon  = estado.icon
              return (
                <Link key={estado.key} href="/dashboard/ventas?tab=pedidos"
                  className="flex items-center gap-3 group hover:opacity-80 transition">
                  <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0', estado.bg)}>
                    <Icon className={cn('w-3.5 h-3.5', estado.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-600 font-medium">{estado.label}</span>
                      <span className={cn('text-xs font-bold tabular-nums', count > 0 ? estado.text : 'text-zinc-300')}>{count}</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-1.5">
                      <div className={cn('h-1.5 rounded-full transition-all duration-500', estado.dot)}
                        style={{ width: count > 0 ? `${Math.max(pct, 4)}%` : '0%' }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Pedidos recientes en curso */}
          <div className="border-t border-zinc-50 pt-3 space-y-1.5">
            {pedidosRecientes.length === 0 ? (
              <p className="text-xs text-zinc-300 text-center py-2">Sin pedidos en curso</p>
            ) : pedidosRecientes.map(p => (
              <Link key={p.id} href="/dashboard/ventas?tab=pedidos"
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-zinc-50 transition">
                <div className="min-w-0 flex items-center gap-1.5">
                  <span className="font-medium text-zinc-700 truncate">{p.nombre_cliente}</span>
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-400 shrink-0">{p.numero_pedido}</span>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ml-2',
                  ESTADOS_PIPELINE.find(e => e.key === p.estado)?.bg ?? 'bg-zinc-100',
                  ESTADOS_PIPELINE.find(e => e.key === p.estado)?.text ?? 'text-zinc-600',
                )}>
                  {labelEstadoPedido(p.estado)}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Feed de actividad — cada entrada clickeable */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900">Actividad reciente</h3>
            <span className="text-[10px] bg-zinc-100 text-zinc-500 font-semibold px-2 py-0.5 rounded-full">en vivo</span>
          </div>

          {feed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center mb-3">
                <Zap className="w-5 h-5 text-zinc-300" />
              </div>
              <p className="text-sm text-zinc-400">Sin actividad reciente</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-100" />
              <div className="space-y-1.5">
                {feed.map((item) => {
                  const Icon = item.icono
                  return (
                    <Link key={item.id} href={item.href}
                      className="flex items-start gap-3 relative group rounded-xl hover:bg-zinc-50 px-1.5 py-1.5 transition">
                      <div className={cn('w-[22px] h-[22px] rounded-full border-2 border-white shrink-0 flex items-center justify-center shadow-sm z-10 group-hover:scale-110 transition', item.dot)}>
                        <Icon className="w-2.5 h-2.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-zinc-800 truncate">{item.titulo}</p>
                          <p className="text-[10px] text-zinc-400 shrink-0 whitespace-nowrap">{tiempoRelativo(item.ts)}</p>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.subtitulo}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── COBROS PENDIENTES — solo si hay, clickeable ─────────────────── */}
      {cobrosN > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900">Cobros pendientes hoy</h3>
            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
              {cobrosN} sin cobrar
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(cobrosPendientes ?? []).map(p => (
              <Link key={p.id} href="/dashboard/ventas?tab=pedidos"
                className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 gap-3 hover:border-amber-200 transition">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 truncate">{p.nombre_cliente}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{p.numero_pedido} · {p.metodo_pago ?? 'sin método'}</p>
                </div>
                {esDueno && <p className="text-sm font-bold text-zinc-900 shrink-0 tabular-nums">{formatPEN(p.total)}</p>}
              </Link>
            ))}
          </div>
          <Link href="/dashboard/ventas?tab=pedidos"
            className="mt-3 flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition font-medium">
            Gestionar cobros <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* ── GRÁFICO + TOP PRODUCTOS — gráfico clickeable ─────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Últimos 30 días</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <Link href="/dashboard/ventas?tab=pedidos"
            className="lg:col-span-2 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-zinc-200 transition block">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Tendencia de actividad</h3>
            <ActivityChart datos={chartData} />
          </Link>

          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900">Más cotizados (30d)</h3>
              <Link href="/dashboard/catalog" className="text-xs text-zinc-400 hover:text-zinc-900 transition font-medium flex items-center gap-0.5">
                Ver catálogo <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {topProductos.length === 0 ? (
              <p className="text-xs text-zinc-300 text-center py-4">Sin datos aún</p>
            ) : (
              <div className="space-y-4">
                {topProductos.map(([nombre, cantidad], i) => {
                  const max = topProductos[0][1]
                  const pct = Math.round((cantidad / max) * 100)
                  return (
                    <Link key={nombre} href="/dashboard/catalog"
                      className="block group hover:opacity-80 transition">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-zinc-600 truncate flex-1 mr-2 leading-tight">
                          <span className="text-zinc-300 mr-1.5 font-semibold text-[10px]">#{i + 1}</span>
                          {nombre}
                        </span>
                        <span className="text-xs font-bold text-zinc-700 shrink-0 tabular-nums">{cantidad}</span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5">
                        <div className="bg-zinc-900 h-1.5 rounded-full transition-all group-hover:bg-zinc-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
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
