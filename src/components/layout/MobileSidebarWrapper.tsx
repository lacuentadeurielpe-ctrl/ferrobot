'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'

interface MobileSidebarWrapperProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  nombreFerreteria?: string | null
  logoUrl?: string | null
}

export default function MobileSidebarWrapper({ sidebar, children, nombreFerreteria, logoUrl }: MobileSidebarWrapperProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar desktop — siempre visible en md+ */}
      <div className="hidden md:flex md:shrink-0">
        {sidebar}
      </div>

      {/* Overlay móvil */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer móvil */}
      <div className={`
        fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="relative h-full">
          {sidebar}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-[-44px] w-9 h-9 bg-white rounded-r-lg shadow flex items-center justify-center text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header móvil con hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-cover border border-gray-100" />
          )}
          <span className="text-sm font-semibold text-gray-800 truncate">
            {nombreFerreteria ?? 'FerreBot'}
          </span>
        </div>

        <main className="flex-1 relative overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
