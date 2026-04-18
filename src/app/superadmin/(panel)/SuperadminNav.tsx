'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SuperadminSession } from '@/lib/auth/superadmin'

interface Props {
  session: SuperadminSession
}

const NAV_ITEMS = [
  { href: '/superadmin',             label: 'Dashboard',   icon: '📊' },
  { href: '/superadmin/tenants',     label: 'Clientes',    icon: '🏪' },
  { href: '/superadmin/planes',      label: 'Planes',      icon: '📋' },
  { href: '/superadmin/facturacion', label: 'Facturación', icon: '💰' },
  { href: '/superadmin/ia',          label: 'IA',          icon: '🤖' },
  { href: '/superadmin/salud',       label: 'Salud',       icon: '🔔' },
]

export default function SuperadminNav({ session }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/superadmin/login')
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="text-xl">🔧</span>
          <span className="font-bold text-orange-400">FerroBot</span>
          <span className="text-gray-500 text-xs">Superadmin</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/superadmin'
              ? pathname === '/superadmin'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Sesión */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-white">{session.nombre}</p>
            <p className="text-xs text-gray-500">{session.nivel}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  )
}
