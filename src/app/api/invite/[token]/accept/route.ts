// POST /api/invite/[token]/accept — acepta una invitación y crea el miembro
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function POST(
  _: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()

  // Verificar sesión del usuario que acepta
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión primero' }, { status: 401 })

  // Leer la invitación
  const { data: inv, error: invError } = await supabase
    .from('invitaciones')
    .select('id, ferreteria_id, usada, expires_at')
    .eq('token', token)
    .single()

  if (invError || !inv) return NextResponse.json({ error: 'Invitación inválida' }, { status: 404 })
  if (inv.usada) return NextResponse.json({ error: 'Esta invitación ya fue utilizada' }, { status: 400 })
  if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: 'Esta invitación ha expirado' }, { status: 400 })

  // Verificar que el usuario no sea ya el dueño de esa ferretería
  const { data: esOwner } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('id', inv.ferreteria_id)
    .eq('owner_id', user.id)
    .single()

  if (esOwner) return NextResponse.json({ error: 'Ya eres el dueño de esta ferretería' }, { status: 400 })

  // Verificar que no sea ya miembro activo
  const { data: yaEsMiembro } = await supabase
    .from('miembros_ferreteria')
    .select('id')
    .eq('ferreteria_id', inv.ferreteria_id)
    .eq('user_id', user.id)
    .eq('activo', true)
    .single()

  if (yaEsMiembro) return NextResponse.json({ error: 'Ya eres miembro de esta ferretería' }, { status: 400 })

  // Usar admin client para bypassear RLS en la inserción
  const adminSupabase = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Obtener nombre del usuario desde auth
  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Vendedor'
  const email = user.email ?? ''

  // Insertar miembro (si ya existe inactivo, reactivar)
  const { data: miembroExistente } = await adminSupabase
    .from('miembros_ferreteria')
    .select('id')
    .eq('ferreteria_id', inv.ferreteria_id)
    .eq('user_id', user.id)
    .single()

  if (miembroExistente) {
    await adminSupabase
      .from('miembros_ferreteria')
      .update({ activo: true, nombre: displayName, email })
      .eq('id', miembroExistente.id)
  } else {
    const { error: insertError } = await adminSupabase
      .from('miembros_ferreteria')
      .insert({
        ferreteria_id: inv.ferreteria_id,
        user_id: user.id,
        rol: 'vendedor',
        nombre: displayName,
        email,
        activo: true,
      })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Marcar invitación como usada
  await adminSupabase
    .from('invitaciones')
    .update({ usada: true })
    .eq('id', inv.id)

  return NextResponse.json({ ok: true })
}
