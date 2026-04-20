// GET  /api/complementarios — lista pares manuales de la ferretería
// POST /api/complementarios — crear un par manual
// FERRETERÍA AISLADA: toda operación scoped por ferreteriaId de la sesión

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('productos_complementarios')
    .select(`
      id, tipo, frecuencia, activo,
      producto:producto_id (id, nombre, unidad),
      complementario:complementario_id (id, nombre, unidad)
    `)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .order('tipo', { ascending: false })          // manual primero
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = await createClient()
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede configurar complementarios' }, { status: 403 })

  const body = await request.json()
  const { producto_id, complementario_id } = body

  if (!producto_id || !complementario_id) {
    return NextResponse.json({ error: 'producto_id y complementario_id requeridos' }, { status: 400 })
  }
  if (producto_id === complementario_id) {
    return NextResponse.json({ error: 'Un producto no puede ser complementario de sí mismo' }, { status: 400 })
  }

  // Verificar que ambos productos pertenecen a esta ferretería
  const { data: prods } = await supabase
    .from('productos')
    .select('id')
    .eq('ferreteria_id', session.ferreteriaId)  // FERRETERÍA AISLADA
    .in('id', [producto_id, complementario_id])

  if (!prods || prods.length !== 2) {
    return NextResponse.json({ error: 'Uno o ambos productos no existen en tu ferretería' }, { status: 400 })
  }

  // Crear el par (y el inverso también, para que funcione bidireccional)
  const { error } = await supabase
    .from('productos_complementarios')
    .upsert([
      {
        ferreteria_id:    session.ferreteriaId,
        producto_id,
        complementario_id,
        tipo:             'manual',
        frecuencia:       1.0,
        activo:           true,
      },
      {
        ferreteria_id:    session.ferreteriaId,
        producto_id:      complementario_id,
        complementario_id: producto_id,
        tipo:             'manual',
        frecuencia:       1.0,
        activo:           true,
      },
    ], { onConflict: 'ferreteria_id,producto_id,complementario_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
