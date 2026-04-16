'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  MessageSquare,
  Settings,
  LogOut,
  Wrench,
  FileText,
  Users,
  CreditCard,
  ClipboardList,
} from 'lucide-react'
import NotificationBadge from '@/components/layout/NotificationBadge'
import type { Rol } from '@/lib/auth/roles'
import { checkPermiso, type Permiso, type PermisoMap } from '@/lib/auth/permisos'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: 'pedidos' | 'conversaciones' | 'cotizaciones'
  permiso?: Permiso   // si está definido, solo se muestra si el usuario tiene ese permiso
}

const navItems: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',                icon: LayoutDashboard, permiso: 'ver_dashboard' },
  { label: 'Catálogo',       href: '/dashboard/catalog',        icon: Package,         permiso: 'ver_stock' },
  { label: 'Cotizaciones',   href: '/dashboard/cotizaciones',   icon: FileText,        badge: 'cotizaciones', permiso: 'ver_pedidos' },
  { label: 'Pedidos',        href: '/dashboard/orders',         icon: ShoppingCart,    badge: 'pedidos',      permiso: 'ver_pedidos' },
  { label: 'Conversaciones', href: '/dashboard/conversations',  icon: MessageSquare,   badge: 'conversaciones', permiso: 'ver_pedidos' },
  { label: 'Clientes',       href: '/dashboard/clientes',       icon: Users,           permiso: 'ver_historial_clientes' },
  { label: 'Créditos',       href: '/dashboard/creditos',       icon: CreditCard,      permiso: 'ver_creditos' },
  { label: 'Rendiciones',    href: '/dashboard/rendiciones',    icon: ClipboardList,   permiso: 'ver_caja_dia' },
  { label: 'Configuración',  href: '/dashboard/settings',       icon: Settings,        permiso: 'configurar_ferreteria' },
]

interface SidebarProps {
  nombreFerreteria: string | null
  ferreteriaId: string
  pedidosPendientes: number
  conversacionesActivas: number
  cotizacionesPendientes: number
  rol: Rol
  permisos: PermisoMap
}

export default function Sidebar({
  nombreFerreteria,
  ferreteriaId,
  pedidosPendientes,
  conversacionesActivas,
  cotizacionesPendientes,
  rol,
  permisos,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const session = { rol, permisos }

  const itemsVisibles = navItems.filter((item) => {
    // Sin permiso requerido → siempre visible (solo el dueño debería tener esto)
    if (!item.permiso) return true
    return checkPermiso(session, item.permiso)
  })

  return (
    <aside className="w-60 shrink-0 bg-gray-900 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {nombreFerreteria ?? 'FerreBot'}
            </p>
            <p className="text-gray-400 text-xs">
              {rol === 'dueno' ? 'Panel de gestión' : 'Empleado'}
            </p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {itemsVisibles.map(({ label, href, icon: Icon, badge }) => {
          const isActive =
            href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                isActive
                  ? 'bg-orange-500 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {badge && (
                <NotificationBadge
                  ferreteriaId={ferreteriaId}
                  tipo={badge}
                  initialCount={
                    badge === 'pedidos' ? pedidosPendientes
                    : badge === 'cotizaciones' ? cotizacionesPendientes
                    : conversacionesActivas
                  }
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
