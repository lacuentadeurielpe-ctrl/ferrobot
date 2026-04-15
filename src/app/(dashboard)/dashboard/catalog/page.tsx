import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Upload, Sparkles } from 'lucide-react'
import ProductsTable from '@/components/catalog/ProductsTable'

export default async function CatalogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) redirect('/onboarding')

  // Cargar productos, categorías y config en paralelo
  const [{ data: productos }, { data: categorias }, { data: configBot }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(id, nombre), reglas_descuento(*)')
      .eq('ferreteria_id', ferreteria.id)
      .order('nombre'),
    supabase
      .from('categorias')
      .select('*')
      .eq('ferreteria_id', ferreteria.id)
      .order('nombre'),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', ferreteria.id)
      .single(),
  ])

  return (
    <div className="p-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de productos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {productos?.length ?? 0} producto{(productos?.length ?? 0) !== 1 ? 's' : ''} registrado{(productos?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/catalog/upload"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            <Upload className="w-4 h-4" />
            Carga masiva
          </Link>
          <Link
            href="/dashboard/catalog/ai"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-200 bg-purple-50 text-sm text-purple-700 hover:bg-purple-100 font-medium transition"
          >
            <Sparkles className="w-4 h-4" />
            Carga con IA
          </Link>
          <Link
            href="/dashboard/catalog/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
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
