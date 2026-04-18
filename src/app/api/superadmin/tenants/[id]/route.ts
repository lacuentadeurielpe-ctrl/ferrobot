// GET   /api/superadmin/tenants/[id]  — detalle completo del tenant
// PATCH /api/superadmin/tenants/[id]  — actualizar estado (suspender/activar/cancelar)
// Acceso: superadmin — PATCH requiere nivel 'admin'

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI, requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const [
    { data: ferreteria },
    { data: suscripcion },
    { data: ycloudConfig },
    { data: incidencias },
    { data: movimientos },
    { data: recargas },
  ] = await Promise.all([
    admin
      .from('ferreterias')
      .select(`
        id, nombre, telefono_whatsapp, activo, estado_tenant,
        trial_hasta, suspendido_motivo, suspendido_at, plan_id, created_at,
        planes (id, nombre, creditos_mes, precio_mensual)
      `)
      .eq('id', id)
      .single(),

    admin
      .from('suscripciones')
      .select('*, planes(nombre, creditos_mes, precio_mensual)')
      .eq('ferreteria_id', id)
      .single(),

    admin
      .from('configuracion_ycloud')
      .select('numero_whatsapp, estado_conexion, ultimo_mensaje_at, ultimo_error, ultimo_error_at, configurado_at')
      .eq('ferreteria_id', id)
      .single(),

    admin
      .from('incidencias_sistema')
      .select('id, tipo, detalle, resuelto, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(20),

    admin
      .from('movimientos_creditos')
      .select('id, tipo_tarea, modelo_usado, creditos_usados, costo_usd, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(50),

    admin
      .from('recargas_creditos')
      .select('id, creditos, motivo, monto_cobrado, created_at')
      .eq('ferreteria_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!ferreteria) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  return NextResponse.json({
    ferreteria,
    suscripcion,
    ycloud: ycloudConfig,
    incidencias: incidencias ?? [],
    movimientos_creditos: movimientos ?? [],
    recargas: recargas ?? [],
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado — se requiere nivel admin' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { estado_tenant, suspendido_motivo, activo } = body

  const ESTADOS_VALIDOS = ['trial', 'activo', 'suspendido', 'cancelado']
  if (estado_tenant && !ESTADOS_VALIDOS.includes(estado_tenant)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const update: Record<string, unknown> = {}
  if (estado_tenant) {
    update.estado_tenant = estado_tenant
    if (estado_tenant === 'suspendido') {
      update.suspendido_motivo = suspendido_motivo ?? null
      update.suspendido_at = new Date().toISOString()
    } else if (estado_tenant === 'activo') {
      update.suspendido_motivo = null
      update.suspendido_at = null
    }
  }
  if (typeof activo === 'boolean') {
    update.activo = activo
  }

  const { data, error } = await admin
    .from('ferreterias')
    .update(update)
    .eq('id', id)
    .select('id, nombre, estado_tenant, activo')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
