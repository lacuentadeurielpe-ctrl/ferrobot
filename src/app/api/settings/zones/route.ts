import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/settings/zones
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('zonas_delivery')
    .select('*')
    .eq('ferreteria_id', ferreteria.id)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/settings/zones
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { nombre, tiempo_estimado_min } = await request.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('zonas_delivery')
    .insert({
      ferreteria_id: ferreteria.id,
      nombre: nombre.trim(),
      tiempo_estimado_min: tiempo_estimado_min ?? 60,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
