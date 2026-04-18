// PUT /api/superadmin/tenants/[id]/ycloud — configurar YCloud de un tenant
// Acceso: solo superadmin nivel 'admin'

import { NextResponse } from 'next/server'
import { requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'
import { encriptar } from '@/lib/encryption'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id: ferreteriaId } = await params
  const body = await request.json()

  const { api_key, webhook_secret, numero_whatsapp } = body

  if (!api_key || !numero_whatsapp) {
    return NextResponse.json({ error: 'api_key y numero_whatsapp son obligatorios' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Encriptar la api_key (y webhook_secret si se proporcionó)
  const [apiKeyEnc, webhookSecretEnc] = await Promise.all([
    encriptar(api_key),
    webhook_secret ? encriptar(webhook_secret) : Promise.resolve(null),
  ])

  // Upsert: si ya existe, actualizar; si no, crear
  const { error } = await admin
    .from('configuracion_ycloud')
    .upsert({
      ferreteria_id:      ferreteriaId,
      api_key_enc:        apiKeyEnc,
      webhook_secret_enc: webhookSecretEnc,
      numero_whatsapp:    numero_whatsapp.replace(/^\+/, ''),
      estado_conexion:    'pendiente',
      configurado_por:    session.superadminId,
      configurado_at:     new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'ferreteria_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// PATCH /api/superadmin/tenants/[id]/ycloud — actualizar solo el estado de conexión
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id: ferreteriaId } = await params
  const body = await request.json()
  const { estado_conexion } = body

  const ESTADOS_VALIDOS = ['activo', 'error', 'desconectado', 'pendiente']
  if (!ESTADOS_VALIDOS.includes(estado_conexion)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('configuracion_ycloud')
    .update({ estado_conexion, updated_at: new Date().toISOString() })
    .eq('ferreteria_id', ferreteriaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
