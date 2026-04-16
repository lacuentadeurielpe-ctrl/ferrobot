// GET /api/repartidores — lista repartidores activos de la ferretería
// POST /api/repartidores — crea un nuevo repartidor
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repartidores')
    .select('id, nombre, telefono, activo, token, created_at')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede agregar repartidores' }, { status: 403 })

  const body = await request.json()
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repartidores')
    .insert({
      ferreteria_id: session.ferreteriaId,
      nombre: body.nombre.trim(),
      telefono: body.telefono?.trim() ?? null,
    })
    .select('id, nombre, telefono, activo, token, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
