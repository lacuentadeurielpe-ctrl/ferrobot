import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CatalogNav from '@/components/catalog/CatalogNav'
import SupplierOrdersManager from '@/components/catalog/SupplierOrdersManager'
import { getSessionInfo } from '@/lib/auth/roles'

export default async function ReabastecerPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Cargar productos y categorías en paralelo filtrados por la ferretería del tenant actual
  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('*, categorias(id, nombre), reglas_descuento(*), unidades_producto(*)')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('categorias')
      .select('*')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
  ])

  return (
    <div className="p-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">Reabastecimiento de Catálogo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Genera órdenes de compra y repón stock de tus proveedores.
          </p>
        </div>
      </div>

      <CatalogNav />

      <SupplierOrdersManager
        productos={productos ?? []}
        categorias={categorias ?? []}
      />
    </div>
  )
}
