// El dueño reactiva el bot manualmente para una conversación
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { error } = await supabase
    .from('conversaciones')
    .update({ bot_pausado: false, estado: 'activa', dueno_activo_at: null })
    .eq('id', id)
    .eq('ferreteria_id', ferreteria.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
