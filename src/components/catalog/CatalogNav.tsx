'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Package, Bot, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard/catalog',        label: 'Productos',      icon: Package,   exact: true },
  { href: '/dashboard/catalog/agente', label: 'Asistente IA',   icon: Bot,       badge: '✦' },
  { href: '/dashboard/catalog/upload', label: 'Importar',       icon: Upload },
]

export default function CatalogNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-0 border-b border-zinc-200 mb-6 -mx-0 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon, exact, badge }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap',
              'border-b-2 -mb-px transition-colors',
              active
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
            {badge && (
              <span className={cn(
                'text-[9px] font-bold ml-0.5',
                active ? 'text-violet-600' : 'text-violet-400'
              )}>
                {badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
