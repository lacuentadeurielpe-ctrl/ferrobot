// DELETE /api/contabilidad/eliminar/[id] — elimina libro cerrado
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  // Solo puede eliminar libros CERRADOS — FERRETERÍA AISLADA
  const { error } = await supabase
    .from('libros_contables')
    .delete()
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('estado', 'cerrado')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
