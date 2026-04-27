'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, LayoutDashboard, TrendingUp, MessageSquare, Package, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import NotificationBadge from '@/components/layout/NotificationBadge'
import { checkPermiso, type PermisoMap, type Permiso } from '@/lib/auth/permisos'
import type { Rol } from '@/lib/auth/roles'

// ── Tab bar principal (móvil) ─────────────────────────────────────────────────
const TAB_ITEMS: {
  label: string
  href: string
  icon: React.ElementType
  permiso: Permiso
  badge?: 'pedidos' | 'conversaciones'
  exact?: boolean
}[] = [
  { label: 'Inicio',  href: '/dashboard',              icon: LayoutDashboard, permiso: 'ver_dashboard', exact: true },
  { label: 'Ventas',  href: '/dashboard/ventas',       icon: TrendingUp,      permiso: 'ver_pedidos',  badge: 'pedidos' },
  { label: 'Chat',    href: '/dashboard/conversations', icon: MessageSquare,   permiso: 'ver_pedidos',  badge: 'conversaciones' },
  { label: 'Catálogo', href: '/dashboard/catalog',      icon: Package,         permiso: 'ver_stock' },
]

interface MobileSidebarWrapperProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  nombreFerreteria?: string | null
  logoUrl?: string | null
  ferreteriaId: string
  pedidosPendientes: number
  conversacionesActivas: number
  rol: Rol
  permisos: PermisoMap
}

export default function MobileSidebarWrapper({
  sidebar,
  children,
  ferreteriaId,
  pedidosPendientes,
  conversacionesActivas,
  rol,
  permisos,
}: MobileSidebarWrapperProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  const session      = { rol, permisos }
  const tabsVisibles = TAB_ITEMS.filter((t) => checkPermiso(session, t.permiso))

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">

      {/* ── Sidebar — solo desktop ──────────────────────────────────────── */}
      <div className="hidden md:flex md:shrink-0">
        {sidebar}
      </div>

      {/* ── Overlay drawer móvil ────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Drawer móvil (sidebar completo desde la izquierda) ─────────── */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ease-in-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="relative h-full">
          {sidebar}
          <button
            onClick={() => setDrawerOpen(false)}
            className="absolute top-4 right-[-40px] w-8 h-8 bg-white rounded-r-xl shadow-sm
                       border border-l-0 border-zinc-200 flex items-center justify-center text-zinc-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 relative overflow-auto md:pb-0 pb-16">
          {children}
        </main>

        {/* ── Bottom tab bar — solo móvil ─────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-zinc-100">
          <div className="flex items-stretch h-16">

            {tabsVisibles.map(({ label, href, icon: Icon, badge, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors',
                    active ? 'text-zinc-950' : 'text-zinc-400'
                  )}
                >
                  {/* Indicador activo — línea superior */}
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-zinc-900 rounded-full" />
                  )}

                  {/* Icono + badge */}
                  <div className="relative">
                    <Icon className={cn('w-5 h-5', active ? 'text-zinc-900' : 'text-zinc-400')} />
                    {badge && (
                      <div className="absolute -top-1.5 -right-2 pointer-events-none">
                        <NotificationBadge
                          ferreteriaId={ferreteriaId}
                          tipo={badge}
                          initialCount={badge === 'pedidos' ? pedidosPendientes : conversacionesActivas}
                        />
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </Link>
              )
            })}

            {/* Más — abre el drawer con la navegación completa */}
            <button
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors',
                drawerOpen ? 'text-zinc-950' : 'text-zinc-400'
              )}
            >
              {drawerOpen && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-zinc-900 rounded-full" />
              )}
              <MoreHorizontal className={cn('w-5 h-5', drawerOpen ? 'text-zinc-900' : 'text-zinc-400')} />
              <span className="text-[10px] font-medium leading-none">Más</span>
            </button>

          </div>
        </nav>
      </div>

    </div>
  )
}
