// POST /api/contabilidad/generar
// Body: { periodo: 'YYYYMM', tipo_libro: 'ventas' }
// FERRETERÍA AISLADA: ferreteriaId siempre de session

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { generarPLEVentas, calcularTotalesPLE } from '@/lib/contabilidad/ple-ventas'
import type { Comprobante } from '@/types/database'

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { periodo?: string; tipo_libro?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { periodo, tipo_libro = 'ventas' } = body

  // Validar periodo YYYYMM
  if (!periodo || !/^\d{6}$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo debe ser YYYYMM (ej: 202604)' }, { status: 400 })
  }

  if (tipo_libro !== 'ventas') {
    return NextResponse.json({ error: 'Solo tipo_libro=ventas está soportado por ahora' }, { status: 400 })
  }

  const supabase = await createClient()
  const ferreteriaId = session.ferreteriaId  // FERRETERÍA AISLADA

  // Armar rango de fechas del periodo
  const year  = parseInt(periodo.slice(0, 4))
  const month = parseInt(periodo.slice(4, 6))
  const desde = new Date(year, month - 1, 1).toISOString()
  const hasta = new Date(year, month, 1).toISOString()

  // Obtener comprobantes del periodo — FERRETERÍA AISLADA
  const { data: comprobantes, error: errComp } = await supabase
    .from('comprobantes')
    .select('*')
    .eq('ferreteria_id', ferreteriaId)
    .in('tipo', ['boleta', 'factura'])
    .neq('estado', 'error')
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .order('created_at', { ascending: true })

  if (errComp) {
    return NextResponse.json({ error: `Error al obtener comprobantes: ${errComp.message}` }, { status: 500 })
  }

  const lista = (comprobantes ?? []) as Comprobante[]
  const totales = calcularTotalesPLE(lista)
  const contenido_ple = generarPLEVentas(lista, periodo)

  // Upsert del libro — FERRETERÍA AISLADA
  const { data: libro, error: errUpsert } = await supabase
    .from('libros_contables')
    .upsert({
      ferreteria_id:       ferreteriaId,
      periodo,
      tipo_libro,
      estado:              'borrador',
      contenido_ple,
      generado_at:         new Date().toISOString(),
      updated_at:          new Date().toISOString(),
      ...totales,
    }, { onConflict: 'ferreteria_id,periodo,tipo_libro' })
    .select()
    .single()

  if (errUpsert) {
    return NextResponse.json({ error: `Error al guardar libro: ${errUpsert.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, libro })
}
