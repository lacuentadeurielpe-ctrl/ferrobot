import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProductForm from '@/components/catalog/ProductForm'
import { getSessionInfo } from '@/lib/auth/roles'

export default async function NewProductPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: categorias }, { data: config }] = await Promise.all([
    supabase.from('categorias').select('*').eq('ferreteria_id', session.ferreteriaId).order('nombre'),
    supabase.from('configuracion_bot').select('margen_minimo_porcentaje').eq('ferreteria_id', session.ferreteriaId).single(),
  ])

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard/catalog"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" />
          Volver al catálogo
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo producto</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <ProductForm
          categorias={categorias ?? []}
          margenMinimo={config?.margen_minimo_porcentaje ?? 10}
        />
      </div>
    </div>
  )
}
