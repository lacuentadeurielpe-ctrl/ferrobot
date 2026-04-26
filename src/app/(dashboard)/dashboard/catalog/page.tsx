import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Upload, Sparkles } from 'lucide-react'
import ProductsTable from '@/components/catalog/ProductsTable'
import { getSessionInfo } from '@/lib/auth/roles'

export default async function CatalogPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Cargar productos, categorías y config en paralelo
  const [{ data: productos }, { data: categorias }, { data: configBot }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(id, nombre), reglas_descuento(*)')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('categorias')
      .select('*')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', session.ferreteriaId)
      .single(),
  ])

  return (
    <div className="p-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">Catálogo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {productos?.length ?? 0} producto{(productos?.length ?? 0) !== 1 ? 's' : ''} registrado{(productos?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/catalog/upload"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition font-medium"
          >
            <Upload className="w-4 h-4" />
            Carga masiva
          </Link>
          <Link
            href="/dashboard/catalog/ai"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-sm text-violet-700 hover:bg-violet-100 font-medium transition"
          >
            <Sparkles className="w-4 h-4" />
            Carga con IA
          </Link>
          <Link
            href="/dashboard/catalog/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      <ProductsTable
        productos={productos ?? []}
        categorias={categorias ?? []}
        margenMinimo={configBot?.margen_minimo_porcentaje ?? 10}
      />
    </div>
  )
}
