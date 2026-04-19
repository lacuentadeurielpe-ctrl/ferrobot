// GET  /api/settings/facturacion — obtiene datos de facturación del tenant
// PATCH /api/settings/facturacion — actualiza datos de facturación del tenant

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import type { TipoRuc, RegimenTributario } from '@/types/database'

const CAMPOS_FACTURACION = [
  'tipo_ruc',
  'ruc',
  'razon_social',
  'nombre_comercial',
  'regimen_tributario',
  'serie_boletas',
  'serie_facturas',
  'igv_incluido_en_precios',
  'representante_legal_nombre',
  'representante_legal_dni',
  'representante_legal_cargo',
] as const

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ferreterias')
    .select(CAMPOS_FACTURACION.join(', '))
    .eq('id', session.ferreteriaId)  // FERRETERÍA AISLADA
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Sólo permitir actualizar campos de facturación — ningún otro campo
  const updates: Record<string, unknown> = {}
  for (const campo of CAMPOS_FACTURACION) {
    if (campo in body) updates[campo] = body[campo]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })
  }

  // Validaciones básicas
  const tipoRuc = (updates.tipo_ruc ?? undefined) as TipoRuc | undefined

  if (tipoRuc && !['sin_ruc', 'ruc10', 'ruc20'].includes(tipoRuc)) {
    return NextResponse.json({ error: 'tipo_ruc inválido' }, { status: 400 })
  }

  const regimen = updates.regimen_tributario as RegimenTributario | null | undefined
  if (regimen !== undefined && regimen !== null &&
      !['rer', 'rmt', 'rus', 'general'].includes(regimen)) {
    return NextResponse.json({ error: 'regimen_tributario inválido' }, { status: 400 })
  }

  // Si tipo_ruc es sin_ruc, limpiar campos tributarios
  if (tipoRuc === 'sin_ruc') {
    updates.ruc = null
    updates.razon_social = null
    updates.regimen_tributario = null
    updates.representante_legal_nombre = null
    updates.representante_legal_dni = null
    updates.representante_legal_cargo = null
  }

  const { data, error } = await supabase
    .from('ferreterias')
    .update(updates)
    .eq('id', session.ferreteriaId)  // FERRETERÍA AISLADA
    .select(CAMPOS_FACTURACION.join(', '))
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
