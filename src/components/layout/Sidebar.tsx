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
} from 'lucide-react'
import NotificationBadge from '@/components/layout/NotificationBadge'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: 'pedidos' | 'conversaciones' | 'cotizaciones'
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Catálogo', href: '/dashboard/catalog', icon: Package },
  { label: 'Cotizaciones', href: '/dashboard/cotizaciones', icon: FileText, badge: 'cotizaciones' },
  { label: 'Pedidos', href: '/dashboard/orders', icon: ShoppingCart, badge: 'pedidos' },
  { label: 'Conversaciones', href: '/dashboard/conversations', icon: MessageSquare, badge: 'conversaciones' },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  nombreFerreteria: string | null
  ferreteriaId: string
  pedidosPendientes: number
  conversacionesActivas: number
  cotizacionesPendientes: number
}

export default function Sidebar({ nombreFerreteria, ferreteriaId, pedidosPendientes, conversacionesActivas, cotizacionesPendientes }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

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
            <p className="text-gray-400 text-xs">Panel de gestión</p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ label, href, icon: Icon, badge }) => {
          // Marcamos activo si la ruta empieza con el href (excepto dashboard exacto)
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
