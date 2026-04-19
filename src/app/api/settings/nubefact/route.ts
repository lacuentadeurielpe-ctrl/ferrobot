// PATCH /api/settings/nubefact  — guarda ruta + token + modo Nubefact
// POST  /api/settings/nubefact  — test de conexión (no guarda nada)
// GET   /api/settings/nubefact  — estado actual (enmascarado)
//
// FERRETERÍA AISLADA: toda escritura/lectura filtra por session.ferreteriaId

import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient }   from '@/lib/supabase/server'
import { encriptar, desencriptar } from '@/lib/encryption'
import { testConexionNubefact }    from '@/lib/nubefact'

// ── PATCH — guardar configuración ────────────────────────────────────────────

export async function PATCH(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (session.rol !== 'dueno') {
    return NextResponse.json({ error: 'Solo el dueño puede modificar esta configuración' }, { status: 403 })
  }

  let body: { token?: string; ruta?: string; modo?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const modo = body.modo ?? 'prueba'
  if (!['prueba', 'produccion'].includes(modo)) {
    return NextResponse.json({ error: 'Modo inválido. Debe ser prueba o produccion' }, { status: 400 })
  }

  const supabase = await createClient()
  const update: Record<string, string> = { nubefact_modo: modo }

  // Guardar la ruta si viene
  if (body.ruta?.trim()) {
    update.nubefact_ruta = body.ruta.trim()
  }

  // Encriptar y guardar el token si viene
  if (body.token?.trim()) {
    try {
      update.nubefact_token_enc = await encriptar(body.token.trim())
    } catch (e) {
      return NextResponse.json(
        { error: `Error al cifrar el token: ${e instanceof Error ? e.message : 'desconocido'}` },
        { status: 500 }
      )
    }
  }

  const { error } = await supabase
    .from('ferreterias')
    .update(update)
    .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── POST — test de conexión ───────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { token?: string; ruta?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const supabase = await createClient()

  // Leer datos actuales del tenant (FERRETERÍA AISLADA)
  const { data: ferr } = await supabase
    .from('ferreterias')
    .select('nubefact_token_enc, nubefact_ruta')
    .eq('id', session.ferreteriaId)
    .single()

  // Ruta: priorizar la del body (test antes de guardar), sino la guardada
  const ruta = body.ruta?.trim() || ferr?.nubefact_ruta || ''
  if (!ruta) {
    return NextResponse.json(
      { ok: false, error: 'Ingresa la Ruta de Nubefact antes de probar' },
      { status: 422 }
    )
  }

  // Token: priorizar el del body, sino desencriptar el guardado
  let tokenPlano = body.token?.trim() ?? ''
  if (!tokenPlano) {
    if (!ferr?.nubefact_token_enc) {
      return NextResponse.json(
        { ok: false, error: 'Ingresa el Token de Nubefact antes de probar' },
        { status: 422 }
      )
    }
    try {
      tokenPlano = await desencriptar(ferr.nubefact_token_enc)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Error al descifrar el token almacenado' },
        { status: 500 }
      )
    }
  }

  const resultado = await testConexionNubefact(ruta, tokenPlano)
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}

// ── GET — estado actual (token enmascarado) ───────────────────────────────────

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ferreterias')
    .select('nubefact_token_enc, nubefact_ruta, nubefact_modo')
    .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    configurado: !!data?.nubefact_token_enc && !!data?.nubefact_ruta,
    modo:        data?.nubefact_modo ?? 'prueba',
    // Devolvemos la ruta (no es secreta) pero NUNCA el token
    ruta:        data?.nubefact_ruta ?? null,
  })
}
