// GET /api/superadmin/tributario/libros?periodo=YYYYMM — estado de libros contables por tenant

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const ahora = new Date()
  const periodoDefault = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const periodo = searchParams.get('periodo') || periodoDefault

  const admin = createAdminClient()

  const [
    { data: ferreterias },
    { data: libros },
  ] = await Promise.all([
    admin
      .from('ferreterias')
      .select('id, nombre_comercial, razon_social, ruc, nubefact_token')
      .order('nombre_comercial', { ascending: true }),

    admin
      .from('libros_contables')
      .select('id, ferreteria_id, periodo, tipo_libro, estado, total_registros, total_ventas, total_igv, total_base_imponible, total_boletas, total_facturas')
      .eq('periodo', periodo)
      .eq('tipo_libro', 'ventas'),
  ])

  const librosMap: Record<string, any> = {}
  for (const l of (libros ?? [])) {
    librosMap[l.ferreteria_id] = l
  }

  const resultado = (ferreterias ?? []).map((f: any) => ({
    ferreteria_id:    f.id,
    ferreteria_nombre: f.nombre_comercial ?? f.razon_social ?? '—',
    ferreteria_ruc:   f.ruc ?? '—',
    tiene_nubefact:   !!f.nubefact_token,
    libro:            librosMap[f.id] ?? null,
  }))

  // Sort: ferreterías con libro primero, luego sin libro
  resultado.sort((a, b) => {
    if (a.libro && !b.libro) return -1
    if (!a.libro && b.libro) return 1
    return a.ferreteria_nombre.localeCompare(b.ferreteria_nombre)
  })

  return NextResponse.json(resultado)
}
