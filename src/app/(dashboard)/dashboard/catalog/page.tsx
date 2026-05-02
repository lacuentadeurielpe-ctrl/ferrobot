import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Download, Receipt, Settings } from 'lucide-react'
import ProductsTable from '@/components/catalog/ProductsTable'
import CatalogNav from '@/components/catalog/CatalogNav'
import { getSessionInfo } from '@/lib/auth/roles'

export default async function CatalogPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Cargar productos, categorías, config y ajuste IGV global en paralelo
  const [{ data: productos }, { data: categorias }, { data: configBot }, { data: ferreteria }] = await Promise.all([
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
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', session.ferreteriaId)
      .single(),
    supabase
      .from('ferreterias')
      .select('igv_incluido_en_precios')
      .eq('id', session.ferreteriaId)
      .single(),
  ])

  const igvGlobal = ferreteria?.igv_incluido_en_precios ?? false

  return (
    <div className="p-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">Catálogo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {productos?.length ?? 0} producto{(productos?.length ?? 0) !== 1 ? 's' : ''} registrado{(productos?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/catalog/export"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm font-medium transition"
            title="Descargar inventario completo como Excel"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </a>
          <Link
            href="/dashboard/catalog/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      <CatalogNav />

      {/* Banner global IGV */}
      <div className="mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm
        border-zinc-100 bg-zinc-50 text-zinc-600">
        <Receipt className="w-4 h-4 text-zinc-400 shrink-0" />
        <span>
          <strong>IGV:</strong>{' '}
          {igvGlobal
            ? 'Los precios de tus productos ya incluyen el 18% de IGV'
            : 'Los precios de tus productos no incluyen IGV (se añade al emitir comprobante)'}
        </span>
        <Link
          href="/dashboard/settings#facturacion"
          className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition shrink-0"
        >
          <Settings className="w-3 h-3" />
          Cambiar
        </Link>
      </div>

      <ProductsTable
        productos={productos ?? []}
        categorias={categorias ?? []}
        margenMinimo={configBot?.margen_minimo_porcentaje ?? 10}
        igvGlobal={igvGlobal}
      />
    </div>
  )
}
