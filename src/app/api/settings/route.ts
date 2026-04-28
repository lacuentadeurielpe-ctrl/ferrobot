import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/settings — datos completos de la ferretería
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('ferreterias')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/settings — actualizar datos de la ferretería
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()

  // Campos de ferreterias (whitelist)
  const CAMPOS_FERRETERIA = [
    'nombre', 'direccion', 'telefono_whatsapp',
    'horario_apertura', 'horario_cierre', 'dias_atencion',
    'formas_pago', 'mensaje_bienvenida', 'mensaje_fuera_horario',
    'timeout_intervencion_dueno',
    'color_comprobante', 'mensaje_comprobante',
    'telefono_dueno', 'resumen_diario_activo',
    'modo_asignacion_delivery',
    'datos_yape', 'datos_plin', 'datos_transferencia', 'metodos_pago_activos',
    'tolerancia_dias_pago',
  ]

  const update: Record<string, unknown> = {}
  for (const campo of CAMPOS_FERRETERIA) {
    if (campo in body) update[campo] = body[campo]
  }

  // Campos de configuracion_bot
  const BOT_CAMPOS = ['margen_minimo_porcentaje', 'debounce_segundos', 'ventana_gracia_minutos', 'perfil_bot', 'agentes_activos']
  const botUpdate: Record<string, unknown> = {}
  for (const campo of BOT_CAMPOS) {
    if (campo in body) botUpdate[campo] = body[campo]
  }

  if (Object.keys(update).length === 0 && Object.keys(botUpdate).length === 0)
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  // Actualizar ferreterias
  let data: unknown = null
  if (Object.keys(update).length > 0) {
    const { data: updated, error } = await supabase
      .from('ferreterias')
      .update(update)
      .eq('owner_id', user.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    data = updated
  }

  // Actualizar configuracion_bot si aplica
  if (Object.keys(botUpdate).length > 0) {
    const { error: botError } = await supabase
      .from('configuracion_bot')
      .update(botUpdate)
      .eq('ferreteria_id', ferreteria.id)
    if (botError) return NextResponse.json({ error: botError.message }, { status: 500 })
  }

  return NextResponse.json(data ?? { ok: true })
}
