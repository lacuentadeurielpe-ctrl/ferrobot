import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/cotizaciones
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('ferreteria_id', ferreteria.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
