// GET  /api/superadmin/tenants  — listado de todos los tenants con info de plan y suscripción
// Acceso: solo superadmin autenticado (cualquier nivel)

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ferreterias')
    .select(`
      id,
      nombre,
      telefono_whatsapp,
      activo,
      estado_tenant,
      trial_hasta,
      suspendido_motivo,
      suspendido_at,
      plan_id,
      created_at,
      planes (
        id, nombre, creditos_mes, precio_mensual
      ),
      suscripciones (
        id,
        creditos_disponibles,
        creditos_del_mes,
        estado,
        ciclo_inicio,
        ciclo_fin,
        proximo_cobro
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
