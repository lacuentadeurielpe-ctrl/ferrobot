// POST /api/team/invite — genera un enlace de invitación para la ferretería
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function POST() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()

  // Invalidar invitaciones anteriores no usadas para esta ferretería
  await supabase
    .from('invitaciones')
    .update({ usada: true })
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('usada', false)

  // Crear nueva invitación (token generado por el DEFAULT de la BD)
  const { data, error } = await supabase
    .from('invitaciones')
    .insert({ ferreteria_id: session.ferreteriaId })
    .select('token, expires_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  return NextResponse.json({
    token: data.token,
    link: `${baseUrl}/invite/${data.token}`,
    expires_at: data.expires_at,
  })
}
