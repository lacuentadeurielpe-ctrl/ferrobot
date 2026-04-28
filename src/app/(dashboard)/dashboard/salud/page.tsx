// Panel de salud del bot — solo dueño
// Muestra: estado del bot, checklist de config, KPIs 7d, clientes en riesgo de inactividad
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import {
  Activity, CheckCircle2, XCircle, AlertTriangle,
  MessageSquare, FileText, ShoppingBag, Users, TrendingUp,
  Clock, Wifi, WifiOff, Package, MapPin, CreditCard, Bot,
} from 'lucide-react'
import { cn, formatFecha } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── helpers ──────────────────────────────────────────────────────────────────

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function horasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60))
}

function pct(a: number, b: number) {
  if (b === 0) return '—'
  return `${Math.round((a / b) * 100)}%`
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function SaludPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')
  if (session.rol !== 'dueno') redirect('/dashboard')

  const supabase = await createClient()
  const admin    = createAdminClient()

  const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── Consultas en paralelo (todas aisladas por ferreteriaId) ───────────────
  const [
    { data: ferreteria },
    { data: ycloudConfig },
    { data: configBot },
    { count: productosCount },
    { count: zonasCount },
    { count: conversaciones7d },
    { count: cotizaciones7d },
    { count: pedidos7d },
    { data: clientesRaw },
  ] = await Promise.all([
    supabase
      .from('ferreterias')
      .select('horario_apertura, horario_cierre, dias_atencion, formas_pago')
      .eq('id', session.ferreteriaId)
      .single(),
    admin
      .from('configuracion_ycloud')
      .select('estado_conexion, ultimo_mensaje_at, ultimo_error')
      .eq('ferreteria_id', session.ferreteriaId)
      .maybeSingle(),
    supabase
      .from('configuracion_bot')
      .select('perfil_bot')
      .eq('ferreteria_id', session.ferreteriaId)
      .maybeSingle(),
    supabase
      .from('productos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('activo', true),
    supabase
      .from('zonas_delivery')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId),
    supabase
      .from('conversaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('updated_at', hace7d),
    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', hace7d),
    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .gte('created_at', hace7d),
    supabase
      .from('clientes')
      .select('id, nombre, pedidos(created_at, total, estado)')
      .eq('ferreteria_id', session.ferreteriaId),
  ])

  // ── Estado del bot ───────────────────────────────────────────────────────
  const ultimoMensajeAt   = ycloudConfig?.ultimo_mensaje_at ?? null
  const horasUltimoMensaje = horasDesde(ultimoMensajeAt)
  const ycloudActivo       = ycloudConfig?.estado_conexion === 'activa'

  type EstadoBot = 'activo' | 'inactivo' | 'sin_configurar'
  let estadoBot: EstadoBot = 'sin_configurar'
  if (ycloudConfig) {
    if (ycloudActivo && (horasUltimoMensaje === null || horasUltimoMensaje < 72)) {
      estadoBot = 'activo'
    } else {
      estadoBot = 'inactivo'
    }
  }

  // ── Checklist ────────────────────────────────────────────────────────────
  const perfilBot = (configBot as unknown as { perfil_bot?: { tipo_negocio?: string } } | null)?.perfil_bot
  const checklist = [
    {
      key:   'ycloud',
      label: 'WhatsApp conectado',
      ok:    ycloudActivo,
      icon:  ycloudActivo ? Wifi : WifiOff,
      fix:   '/dashboard/settings?tab=whatsapp',
    },
    {
      key:   'productos',
      label: `Productos en catálogo (${productosCount ?? 0} activos)`,
      ok:    (productosCount ?? 0) > 0,
      icon:  Package,
      fix:   '/dashboard/catalog',
    },
    {
      key:   'zonas',
      label: `Zonas de delivery (${zonasCount ?? 0} configuradas)`,
      ok:    (zonasCount ?? 0) > 0,
      icon:  MapPin,
      fix:   '/dashboard/settings?tab=general',
    },
    {
      key:   'horario',
      label: 'Horario de atención',
      ok:    !!(ferreteria?.horario_apertura && ferreteria?.horario_cierre && (ferreteria?.dias_atencion as string[] | null)?.length),
      icon:  Clock,
      fix:   '/dashboard/settings?tab=general',
    },
    {
      key:   'formas_pago',
      label: 'Formas de pago configuradas',
      ok:    ((ferreteria?.formas_pago as string[] | null)?.length ?? 0) > 0,
      icon:  CreditCard,
      fix:   '/dashboard/settings?tab=general',
    },
    {
      key:   'perfil_bot',
      label: 'Perfil del bot configurado',
      ok:    !!(perfilBot?.tipo_negocio?.trim()),
      icon:  Bot,
      fix:   '/dashboard/settings?tab=perfil_bot',
    },
  ]

  const checklistOk = checklist.filter((c) => c.ok).length

  // ── Retención — clientes inactivos > 14 días ─────────────────────────────
  const hoy = Date.now()
  const clientesInactivos = (clientesRaw ?? [])
    .map((c) => {
      const pedidos = (c.pedidos ?? []) as Array<{ created_at: string; total: number; estado: string }>
      const pedidosValidos = pedidos.filter((p) => p.estado !== 'cancelado')
      const ultimoPedido = pedidosValidos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      const dias = diasDesde(ultimoPedido?.created_at ?? null)
      const totalGastado = pedidosValidos.reduce((s, p) => s + (p.total ?? 0), 0)
      return {
        id:            c.id,
        nombre:        c.nombre as string,
        ultimoPedido:  ultimoPedido?.created_at ?? null,
        diasInactivo:  dias ?? 999,
        totalGastado,
        totalPedidos:  pedidosValidos.length,
      }
    })
    .filter((c) => c.diasInactivo >= 14 && c.totalPedidos > 0)
    .sort((a, b) => b.diasInactivo - a.diasInactivo || b.totalGastado - a.totalGastado)
    .slice(0, 10)

  const conv7d = conversaciones7d ?? 0
  const cot7d  = cotizaciones7d  ?? 0
  const ped7d  = pedidos7d       ?? 0

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <Activity className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Salud del bot</h1>
          <p className="text-xs text-zinc-400">Estado en tiempo real · Última actualización: ahora</p>
        </div>
      </div>

      {/* ── Estado bot + Checklist resumen ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Estado */}
        <div className={cn(
          'rounded-2xl border p-5 flex items-center gap-4',
          estadoBot === 'activo'        ? 'border-emerald-200 bg-emerald-50'
          : estadoBot === 'inactivo'    ? 'border-amber-200  bg-amber-50'
          : 'border-zinc-200 bg-zinc-50'
        )}>
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            estadoBot === 'activo'     ? 'bg-emerald-100'
            : estadoBot === 'inactivo' ? 'bg-amber-100'
            : 'bg-zinc-100'
          )}>
            {estadoBot === 'activo'
              ? <Wifi    className="w-5 h-5 text-emerald-600" />
              : estadoBot === 'inactivo'
              ? <AlertTriangle className="w-5 h-5 text-amber-600" />
              : <WifiOff className="w-5 h-5 text-zinc-400" />
            }
          </div>
          <div>
            <p className={cn(
              'text-sm font-semibold',
              estadoBot === 'activo'     ? 'text-emerald-800'
              : estadoBot === 'inactivo' ? 'text-amber-800'
              : 'text-zinc-600'
            )}>
              {estadoBot === 'activo'     ? 'Bot activo'
               : estadoBot === 'inactivo' ? 'Sin actividad reciente'
               : 'WhatsApp no configurado'}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {ultimoMensajeAt
                ? horasUltimoMensaje === 0
                  ? 'Último mensaje hace menos de 1 hora'
                  : `Último mensaje hace ${horasUltimoMensaje}h`
                : ycloudConfig
                  ? 'Sin mensajes registrados aún'
                  : 'Conecta WhatsApp en Ajustes → Bot → WhatsApp'}
            </p>
            {ycloudConfig?.ultimo_error && estadoBot === 'inactivo' && (
              <p className="text-[10px] text-amber-600 mt-1 truncate max-w-[200px]">
                {String(ycloudConfig.ultimo_error).slice(0, 80)}
              </p>
            )}
          </div>
        </div>

        {/* Checklist resumen */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-900">Configuración</p>
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              checklistOk === checklist.length
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : checklistOk >= 4
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            )}>
              {checklistOk}/{checklist.length} completo
            </span>
          </div>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                {item.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  : <XCircle      className="w-3.5 h-3.5 shrink-0 text-zinc-300" />
                }
                <span className={cn('text-xs', item.ok ? 'text-zinc-700' : 'text-zinc-400')}>
                  {item.label}
                </span>
                {!item.ok && (
                  <a href={item.fix} className="text-[10px] text-blue-500 hover:underline ml-auto shrink-0">
                    Configurar →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs últimos 7 días ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Últimos 7 días</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Conversaciones', value: conv7d, icon: MessageSquare, color: 'text-blue-600'    },
            { label: 'Cotizaciones',   value: cot7d,  icon: FileText,      color: 'text-violet-600'  },
            { label: 'Pedidos',        value: ped7d,  icon: ShoppingBag,   color: 'text-emerald-600' },
            { label: 'Tasa cotización',value: pct(cot7d, conv7d), icon: TrendingUp, color: 'text-amber-600', raw: true },
            { label: 'Tasa cierre',    value: pct(ped7d, cot7d), icon: TrendingUp,  color: 'text-pink-600',  raw: true },
          ].map(({ label, value, icon: Icon, color, raw }) => (
            <div key={label} className="bg-white rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide leading-tight">{label}</p>
                <Icon className={cn('w-3.5 h-3.5', color)} />
              </div>
              <p className={cn('text-2xl font-bold', raw ? color : 'text-zinc-950')}>
                {value}
              </p>
            </div>
          ))}
        </div>
        {conv7d === 0 && (
          <p className="text-xs text-zinc-400 mt-2 text-center">
            Sin actividad en los últimos 7 días — verifica que WhatsApp esté conectado y el webhook activo.
          </p>
        )}
      </div>

      {/* ── Clientes en riesgo de inactividad ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Clientes inactivos &gt; 14 días
          </p>
          <span className="text-xs text-zinc-400">{clientesInactivos.length} clientes</span>
        </div>

        {clientesInactivos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 px-5 py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-700">¡Todos los clientes activos!</p>
            <p className="text-xs text-zinc-400 mt-1">Ningún cliente lleva más de 14 días sin comprar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Último pedido</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Días sin comprar</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Total histórico</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesInactivos.map((c, i) => (
                    <tr key={c.id} className={cn('border-b border-zinc-50 last:border-0', i % 2 === 1 && 'bg-zinc-50/50')}>
                      <td className="px-4 py-3">
                        <a href={`/dashboard/clientes/${c.id}`} className="font-medium text-zinc-900 hover:text-blue-600 transition">
                          {c.nombre}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {c.ultimoPedido ? formatFecha(c.ultimoPedido) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-full',
                          c.diasInactivo >= 60
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : c.diasInactivo >= 30
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-zinc-100 text-zinc-600'
                        )}>
                          {c.diasInactivo === 999 ? '—' : `${c.diasInactivo}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-700 font-medium">
                        S/{c.totalGastado.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {c.totalPedidos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {clientesInactivos.length > 0 && (
          <p className="text-xs text-zinc-400 mt-2">
            💡 Estos clientes compraron antes — son los más fáciles de recuperar. Considera contactarlos por WhatsApp directo.
          </p>
        )}
      </div>

    </div>
  )
}
