import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CotizacionesTable from '@/components/cotizaciones/CotizacionesTable'
import { FileText } from 'lucide-react'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function CotizacionesPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: cotizaciones }, { data: configBot }] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*, clientes(nombre, telefono), items_cotizacion(*, productos(precio_compra))')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', session.ferreteriaId)
      .single(),
  ])

  const lista = (cotizaciones ?? []).map((c) => ({
    ...c,
    clientes: Array.isArray(c.clientes) ? c.clientes[0] ?? null : c.clientes,
  })) as Parameters<typeof CotizacionesTable>[0]['cotizaciones']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-xs text-gray-500">{lista.length} cotizaciones generadas por el bot</p>
        </div>
      </div>

      <CotizacionesTable cotizaciones={lista} margenMinimo={configBot?.margen_minimo_porcentaje ?? 10} />
    </div>
  )
}
