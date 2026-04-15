import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProductForm from '@/components/catalog/ProductForm'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) redirect('/onboarding')

  const [{ data: producto }, { data: categorias }, { data: config }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(id, nombre), reglas_descuento(*)')
      .eq('id', id)
      .eq('ferreteria_id', ferreteria.id)
      .single(),
    supabase
      .from('categorias').select('*').eq('ferreteria_id', ferreteria.id).order('nombre'),
    supabase
      .from('configuracion_bot').select('margen_minimo_porcentaje').eq('ferreteria_id', ferreteria.id).single(),
  ])

  if (!producto) notFound()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard/catalog"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" />
          Volver al catálogo
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Editar producto</h1>
        <p className="text-sm text-gray-500 mt-1">{producto.nombre}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <ProductForm
          producto={producto}
          categorias={categorias ?? []}
          margenMinimo={config?.margen_minimo_porcentaje ?? 10}
        />
      </div>
    </div>
  )
}
