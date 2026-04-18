/**
 * /api/settings/ycloud
 *
 * GET  — devuelve el estado de la configuración YCloud del tenant (sin exponer tokens)
 * POST — guarda o actualiza api_key + webhook_secret + numero_whatsapp (encriptados)
 * DELETE — desconecta (limpia tokens, estado = 'desconectado')
 *
 * Solo el dueño puede acceder.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encriptar } from '@/lib/encryption'

async function getDuenoFerreteria() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  return ferreteria ? { userId: user.id, ferreteriaId: ferreteria.id } : null
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getDuenoFerreteria()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('configuracion_ycloud')
    .select('numero_whatsapp, estado_conexion, ultimo_mensaje_at, ultimo_error, ultimo_error_at, created_at')
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!data) {
    return NextResponse.json({ configurado: false })
  }

  return NextResponse.json({
    configurado:      true,
    numero_whatsapp:  data.numero_whatsapp,
    estado_conexion:  data.estado_conexion,
    ultimo_mensaje_at: data.ultimo_mensaje_at,
    ultimo_error:     data.ultimo_error,
    ultimo_error_at:  data.ultimo_error_at,
  })
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getDuenoFerreteria()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { api_key?: string; webhook_secret?: string; numero_whatsapp?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { api_key, webhook_secret, numero_whatsapp } = body

  if (!api_key || !numero_whatsapp) {
    return NextResponse.json(
      { error: 'api_key y numero_whatsapp son requeridos' },
      { status: 400 }
    )
  }

  // Limpiar número (quitar + y espacios)
  const numeroCleaned = numero_whatsapp.replace(/\D/g, '')
  if (numeroCleaned.length < 7) {
    return NextResponse.json({ error: 'Número de WhatsApp inválido' }, { status: 400 })
  }

  // Encriptar tokens
  const [apiKeyEnc, webhookSecretEnc] = await Promise.all([
    encriptar(api_key.trim()),
    webhook_secret ? encriptar(webhook_secret.trim()) : Promise.resolve(null),
  ])

  const admin = createAdminClient()
  const { error } = await admin
    .from('configuracion_ycloud')
    .upsert(
      {
        ferreteria_id:      session.ferreteriaId,
        api_key_enc:        apiKeyEnc,
        webhook_secret_enc: webhookSecretEnc,
        numero_whatsapp:    numeroCleaned,
        estado_conexion:    'pendiente',
        ultimo_error:       null,
        ultimo_error_at:    null,
      },
      { onConflict: 'ferreteria_id' }
    )

  if (error) {
    console.error('[YCloud settings POST]', error)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE() {
  const session = await getDuenoFerreteria()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('configuracion_ycloud')
    .update({
      api_key_enc:        '',
      webhook_secret_enc: null,
      estado_conexion:    'desconectado',
      ultimo_error:       null,
      ultimo_error_at:    null,
    })
    .eq('ferreteria_id', session.ferreteriaId)

  if (error) {
    return NextResponse.json({ error: 'Error desconectando' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
