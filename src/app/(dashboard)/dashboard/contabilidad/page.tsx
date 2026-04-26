import { redirect } from 'next/navigation'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import ContabilidadPanel from '@/components/contabilidad/ContabilidadPanel'

export default async function ContabilidadPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/login')
  // Solo dueño puede ver contabilidad
  if (session.rol !== 'dueno') redirect('/dashboard')

  const supabase = await createClient()

  // Obtener libros existentes — FERRETERÍA AISLADA
  const { data: libros } = await supabase
    .from('libros_contables')
    .select('*')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('periodo', { ascending: false })
    .limit(24)

  // Obtener datos de la ferretería para mostrar RUC/razón social
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('ruc, razon_social, nombre_comercial, regimen_tributario')
    .eq('id', session.ferreteriaId)
    .single()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Contabilidad</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Registro de Ventas mensual — exporta en CSV o formato PLE SUNAT
        </p>
        {ferreteria?.ruc && (
          <p className="text-xs text-zinc-400 mt-0.5">
            RUC: {ferreteria.ruc} · {ferreteria.razon_social ?? ferreteria.nombre_comercial}
          </p>
        )}
      </div>
      <ContabilidadPanel
        libros={libros ?? []}
        ferreteriaId={session.ferreteriaId}
      />
    </div>
  )
}
