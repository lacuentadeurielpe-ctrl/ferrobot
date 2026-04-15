import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/settings/zones/[id]
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await request.json()
  const update: Record<string, unknown> = {}
  if (body.nombre !== undefined) update.nombre = body.nombre
  if (body.tiempo_estimado_min !== undefined) update.tiempo_estimado_min = body.tiempo_estimado_min

  const { data, error } = await supabase
    .from('zonas_delivery')
    .update(update)
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/settings/zones/[id]
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { error } = await supabase
    .from('zonas_delivery')
    .delete()
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
