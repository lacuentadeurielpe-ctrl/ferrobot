// /dashboard/ventas — Cotizaciones · Pedidos · Pagos en una sola página con tabs
import { redirect } from 'next/navigation'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { FileText, ShoppingCart, CreditCard, TrendingUp } from 'lucide-react'
import CotizacionesTable from '@/components/cotizaciones/CotizacionesTable'
import OrdersTable from '@/components/orders/OrdersTable'
import PagosView, { type PagoItem } from '@/components/pagos/PagosView'
import type { PermisoMap } from '@/lib/auth/permisos'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const TABS = [
  { id: 'pedidos',      label: 'Pedidos',      icon: ShoppingCart },
  { id: 'cotizaciones', label: 'Cotizaciones',  icon: FileText     },
  { id: 'pagos',        label: 'Pagos',         icon: CreditCard   },
] as const

type Tab = typeof TABS[number]['id']

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const tab: Tab = (params.tab as Tab) ?? 'pedidos'

  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // ── Pedidos (default) ────────────────────────────────────────────────────
  let pedidosContent: React.ReactNode = null
  if (tab === 'pedidos') {
    const [
      { data: pedidos },
      { data: productos },
      { data: zonas },
      { data: repartidores },
      { data: ferreteriaData },
    ] = await Promise.all([
      supabase
        .from('pedidos')
        .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*), metodo_pago, estado_pago, pago_confirmado_por, pago_confirmado_at')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('productos')
        .select('id, nombre, unidad, precio_base, precio_compra, stock')
        .eq('ferreteria_id', session.ferreteriaId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('zonas_delivery')
        .select('id, nombre, tiempo_estimado_min')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('nombre'),
      supabase
        .from('repartidores')
        .select('id, nombre, telefono, activo')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('nombre'),
      supabase
        .from('ferreterias')
        .select('nubefact_token_enc, tipo_ruc')
        .eq('id', session.ferreteriaId)
        .single(),
    ])

    pedidosContent = (
      <OrdersTable
        pedidos={pedidos ?? []}
        productos={productos ?? []}
        zonas={zonas ?? []}
        ferreteriaId={session.ferreteriaId}
        rol={session.rol}
        repartidores={repartidores ?? []}
        permisos={session.permisos as PermisoMap}
        nubefactConfigurado={!!ferreteriaData?.nubefact_token_enc}
        tieneRuc={ferreteriaData?.tipo_ruc !== 'sin_ruc'}
      />
    )
  }

  // ── Cotizaciones ─────────────────────────────────────────────────────────
  let cotizacionesContent: React.ReactNode = null
  if (tab === 'cotizaciones') {
    const [{ data: cotizaciones }, { data: configBot }] = await Promise.all([
      supabase
        .from('cotizaciones')
        .select('*, clientes(nombre, telefono), items_cotizacion(*, productos(precio_compra))')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('configuracion_bot')
        .select('margen_minimo_porcentaje')
        .eq('ferreteria_id', session.ferreteriaId)
        .single(),
    ])

    const lista = (cotizaciones ?? []).map((c) => ({
      ...c,
      clientes: Array.isArray(c.clientes) ? c.clientes[0] ?? null : c.clientes,
    })) as Parameters<typeof CotizacionesTable>[0]['cotizaciones']

    cotizacionesContent = (
      <CotizacionesTable
        cotizaciones={lista}
        margenMinimo={configBot?.margen_minimo_porcentaje ?? 10}
      />
    )
  }

  // ── Pagos ────────────────────────────────────────────────────────────────
  let pagosContent: React.ReactNode = null
  if (tab === 'pagos') {
    const { data: pagos } = await supabase
      .from('pagos_registrados')
      .select(`
        id, metodo, monto, moneda, numero_operacion, nombre_pagador,
        ultimos_digitos, fecha_pago, banco_origen, estado, url_captura,
        confianza_extraccion, notas, registrado_at,
        cliente:clientes(id, nombre, telefono),
        pedido:pedidos(id, numero_pedido, total)
      `)
      .eq('ferreteria_id', session.ferreteriaId)
      .order('registrado_at', { ascending: false })
      .limit(100)

    const porEstado = (pagos ?? []).reduce<Record<string, number>>((acc, p) => {
      acc[p.estado] = (acc[p.estado] ?? 0) + 1
      return acc
    }, {})

    pagosContent = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'confirmado_auto',    label: 'Confirmados',     color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
            { key: 'pendiente_revision', label: 'Por revisar',     color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
            { key: 'a_favor',            label: 'Crédito a favor', color: 'bg-blue-50 text-blue-700 border-blue-100' },
            { key: 'rechazado',          label: 'Rechazados',      color: 'bg-red-50 text-red-700 border-red-100' },
          ].map(({ key, label, color }) => (
            <div key={key} className={`rounded-2xl border p-4 ${color}`}>
              <p className="text-2xl font-bold tabular-nums">{porEstado[key] ?? 0}</p>
              <p className="text-xs font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <PagosView
          pagos={(pagos ?? []) as unknown as PagoItem[]}
          esDueno={session.rol === 'dueno'}
        />
      </>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Ventas</h1>
          <p className="text-xs text-zinc-400">Pedidos, cotizaciones y pagos de tu negocio</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`/dashboard/ventas?tab=${id}`}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              tab === id
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </a>
        ))}
      </div>

      {/* Contenido del tab activo */}
      {pedidosContent}
      {cotizacionesContent}
      {pagosContent}
    </div>
  )
}
