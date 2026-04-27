'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  Settings,
  LogOut,
  Users,
  CreditCard,
  Camera,
  Loader2,
  TrendingUp,
  BarChart2,
} from 'lucide-react'
import NotificationBadge from '@/components/layout/NotificationBadge'
import type { Rol } from '@/lib/auth/roles'
import { checkPermiso, type Permiso, type PermisoMap } from '@/lib/auth/permisos'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: 'pedidos' | 'conversaciones' | 'cotizaciones'
  permiso?: Permiso
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard',       icon: LayoutDashboard, permiso: 'ver_dashboard' },
      { label: 'Ventas',    href: '/dashboard/ventas', icon: TrendingUp,      badge: 'pedidos',        permiso: 'ver_pedidos' },
      { label: 'Chat',      href: '/dashboard/conversations', icon: MessageSquare, badge: 'conversaciones', permiso: 'ver_pedidos' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { label: 'Catálogo', href: '/dashboard/catalog',  icon: Package,    permiso: 'ver_stock' },
      { label: 'Clientes', href: '/dashboard/clientes', icon: Users,      permiso: 'ver_historial_clientes' },
      { label: 'Créditos', href: '/dashboard/creditos', icon: CreditCard, permiso: 'ver_creditos' },
    ],
  },
  {
    items: [
      { label: 'Finanzas', href: '/dashboard/finanzas', icon: BarChart2, permiso: 'ver_caja_dia' },
      { label: 'Ajustes',  href: '/dashboard/settings', icon: Settings,  permiso: 'configurar_ferreteria' },
    ],
  },
]

interface SidebarProps {
  nombreFerreteria: string | null
  ferreteriaId: string
  logoUrl?: string | null
  pedidosPendientes: number
  conversacionesActivas: number
  cotizacionesPendientes: number
  rol: Rol
  permisos: PermisoMap
}

export default function Sidebar({
  nombreFerreteria,
  ferreteriaId,
  logoUrl,
  pedidosPendientes,
  conversacionesActivas,
  cotizacionesPendientes,
  rol,
  permisos,
}: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [logoLocal,    setLogoLocal]    = useState<string | null | undefined>(logoUrl)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json()
        setLogoLocal(url)
        router.refresh()
      }
    } finally {
      setSubiendoLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const session = { rol, permisos }

  function isActive(href: string) {
    return href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href)
  }

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-zinc-100 h-full flex flex-col">

      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-3">

          {/* Logo — clickeable para el dueño */}
          <div className="relative shrink-0 group">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center border border-zinc-200 shrink-0">
              {subiendoLogo
                ? <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                : logoLocal
                  ? <img src={logoLocal} alt="Logo" className="w-full h-full object-cover" />
                  : <span className="text-sm font-bold text-zinc-600 select-none">
                      {(nombreFerreteria ?? 'M')[0].toUpperCase()}
                    </span>
              }
            </div>
            {rol === 'dueno' && !subiendoLogo && (
              <>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  title="Cambiar logo"
                  className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100
                             transition flex items-center justify-center"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-950 truncate leading-tight">
              {nombreFerreteria ?? 'Mi negocio'}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {rol === 'dueno' ? (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="hover:text-zinc-600 transition"
                >
                  {logoLocal ? 'Cambiar logo' : 'Subir logo'}
                </button>
              ) : 'Empleado'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Navegación ─────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {navGroups.map((group, gi) => {
          const visibles = group.items.filter((item) =>
            !item.permiso || checkPermiso(session, item.permiso)
          )
          if (visibles.length === 0) return null

          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibles.map(({ label, href, icon: Icon, badge }) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition',
                        active
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                      )}
                    >
                      <Icon className={cn(
                        'w-4 h-4 shrink-0',
                        active ? 'text-zinc-800' : 'text-zinc-400'
                      )} />
                      <span className="truncate flex-1">{label}</span>
                      {badge && (
                        <NotificationBadge
                          ferreteriaId={ferreteriaId}
                          tipo={badge}
                          initialCount={
                            badge === 'pedidos'        ? pedidosPendientes
                            : badge === 'cotizaciones' ? cotizacionesPendientes
                            : conversacionesActivas
                          }
                        />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* ── Cerrar sesión ──────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-zinc-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition w-full"
        >
          <LogOut className="w-4 h-4 shrink-0 text-zinc-400" />
          <span>Cerrar sesión</span>
        </button>
      </div>

    </aside>
  )
}
