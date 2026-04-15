import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

// POST /api/settings/logo — sube logo al Storage y actualiza logo_url
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Tipo de imagen no permitido' }, { status: 400 })
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'Imagen muy grande (máx 2 MB)' }, { status: 400 })

  const ext = file.type.split('/')[1] ?? 'jpg'
  const storagePath = `${ferreteria.id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()

  // Eliminar versiones previas (cualquier extensión)
  await admin.storage.from('logos').remove([
    `${ferreteria.id}/logo.jpg`,
    `${ferreteria.id}/logo.jpeg`,
    `${ferreteria.id}/logo.png`,
    `${ferreteria.id}/logo.webp`,
    `${ferreteria.id}/logo.gif`,
  ])

  const { error: uploadError } = await admin.storage
    .from('logos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('logos').getPublicUrl(storagePath)

  // Agregar cache-buster para que el browser no use versión antigua
  const urlConTimestamp = `${publicUrl}?t=${Date.now()}`

  await admin
    .from('ferreterias')
    .update({ logo_url: urlConTimestamp })
    .eq('id', ferreteria.id)

  return NextResponse.json({ url: urlConTimestamp })
}

// DELETE /api/settings/logo — elimina el logo
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const admin = createAdminClient()

  await admin.storage.from('logos').remove([
    `${ferreteria.id}/logo.jpg`,
    `${ferreteria.id}/logo.jpeg`,
    `${ferreteria.id}/logo.png`,
    `${ferreteria.id}/logo.webp`,
    `${ferreteria.id}/logo.gif`,
  ])

  await admin.from('ferreterias').update({ logo_url: null }).eq('id', ferreteria.id)

  return NextResponse.json({ ok: true })
}
