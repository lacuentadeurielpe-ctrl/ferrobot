// POST /api/settings/yape-qr — sube QR de Yape al Storage y actualiza datos_yape.qr_url
// DELETE /api/settings/yape-qr — elimina el QR
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, datos_yape')
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

  const ext = file.type.split('/')[1] ?? 'png'
  const storagePath = `${ferreteria.id}/yape-qr.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()

  // Eliminar versiones previas
  await admin.storage.from('logos').remove([
    `${ferreteria.id}/yape-qr.jpg`,
    `${ferreteria.id}/yape-qr.jpeg`,
    `${ferreteria.id}/yape-qr.png`,
    `${ferreteria.id}/yape-qr.webp`,
  ])

  const { error: uploadError } = await admin.storage
    .from('logos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('logos').getPublicUrl(storagePath)
  const urlConTimestamp = `${publicUrl}?t=${Date.now()}`

  // Actualizar qr_url dentro de datos_yape manteniendo el resto
  const datosYapeActuales = (ferreteria.datos_yape as any) ?? {}
  await admin
    .from('ferreterias')
    .update({ datos_yape: { ...datosYapeActuales, qr_url: urlConTimestamp } })
    .eq('id', ferreteria.id)

  return NextResponse.json({ url: urlConTimestamp })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, datos_yape')
    .eq('owner_id', user.id)
    .single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const admin = createAdminClient()

  await admin.storage.from('logos').remove([
    `${ferreteria.id}/yape-qr.jpg`,
    `${ferreteria.id}/yape-qr.jpeg`,
    `${ferreteria.id}/yape-qr.png`,
    `${ferreteria.id}/yape-qr.webp`,
  ])

  const datosYapeActuales = (ferreteria.datos_yape as any) ?? {}
  await admin
    .from('ferreterias')
    .update({ datos_yape: { ...datosYapeActuales, qr_url: null } })
    .eq('id', ferreteria.id)

  return NextResponse.json({ ok: true })
}
