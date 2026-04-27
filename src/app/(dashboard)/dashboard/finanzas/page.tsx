// /dashboard/finanzas — Rendiciones · Contabilidad en una sola página con tabs
import { redirect } from 'next/navigation'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { checkPermiso } from '@/lib/auth/permisos'
import { BarChart2, ClipboardList, BookOpen } from 'lucide-react'
import RendicionesView from '@/components/rendiciones/RendicionesView'
import ContabilidadPanel from '@/components/contabilidad/ContabilidadPanel'
import type { PermisoMap } from '@/lib/auth/permisos'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Tab = 'rendiciones' | 'contabilidad'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')
  if (!checkPermiso(session, 'ver_caja_dia')) redirect('/dashboard')

  const supabase = await createClient()

  // Contabilidad solo para dueños; si vendedor intenta acceder → rendiciones
  const esDueno = session.rol === 'dueno'
  const tab: Tab = (params.tab as Tab) === 'contabilidad' && esDueno
    ? 'contabilidad'
    : 'rendiciones'

  // ── Rendiciones ──────────────────────────────────────────────────────────
  let rendicionesContent: React.ReactNode = null
  if (tab === 'rendiciones') {
    const [{ data: rendiciones }, { data: repartidores }] = await Promise.all([
      supabase
        .from('rendiciones')
        .select('*, repartidores(id, nombre, telefono)')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('repartidores')
        .select('id, nombre')
        .eq('ferreteria_id', session.ferreteriaId)
        .eq('activo', true)
        .order('nombre'),
    ])

    rendicionesContent = (
      <RendicionesView
        rendiciones={rendiciones ?? []}
        repartidores={repartidores ?? []}
        permisos={session.permisos as PermisoMap}
        rol={session.rol}
      />
    )
  }

  // ── Contabilidad ─────────────────────────────────────────────────────────
  let contabilidadContent: React.ReactNode = null
  if (tab === 'contabilidad' && esDueno) {
    const [{ data: libros }, { data: ferreteria }] = await Promise.all([
      supabase
        .from('libros_contables')
        .select('*')
        .eq('ferreteria_id', session.ferreteriaId)
        .order('periodo', { ascending: false })
        .limit(24),
      supabase
        .from('ferreterias')
        .select('ruc, razon_social, nombre_comercial, regimen_tributario')
        .eq('id', session.ferreteriaId)
        .single(),
    ])

    contabilidadContent = (
      <>
        {ferreteria?.ruc && (
          <p className="text-xs text-zinc-400 mb-4">
            RUC: {ferreteria.ruc} · {ferreteria.razon_social ?? ferreteria.nombre_comercial}
          </p>
        )}
        <ContabilidadPanel
          libros={libros ?? []}
          ferreteriaId={session.ferreteriaId}
        />
      </>
    )
  }

  const TABS = [
    { id: 'rendiciones' as Tab,  label: 'Rendiciones',  icon: ClipboardList, visible: true },
    { id: 'contabilidad' as Tab, label: 'Contabilidad', icon: BookOpen,       visible: esDueno },
  ].filter((t) => t.visible)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <BarChart2 className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Finanzas</h1>
          <p className="text-xs text-zinc-400">Rendiciones de repartidores y registro contable</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`/dashboard/finanzas?tab=${id}`}
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

      {/* Contenido */}
      {rendicionesContent}
      {contabilidadContent}
    </div>
  )
}
