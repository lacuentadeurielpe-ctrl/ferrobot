// PATCH /api/settings/nubefact  — guarda token + modo Nubefact (cifrado)
// POST  /api/settings/nubefact  — test de conexión (no guarda nada)
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

  let body: { token?: string; modo?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const modo = body.modo ?? 'prueba'
  if (!['prueba', 'produccion'].includes(modo)) {
    return NextResponse.json({ error: 'Modo inválido. Debe ser prueba o produccion' }, { status: 400 })
  }

  const supabase = await createClient()

  // Si no viene token nuevo, solo actualizamos el modo
  if (!body.token?.trim()) {
    const { error } = await supabase
      .from('ferreterias')
      .update({ nubefact_modo: modo })
      .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Encriptar el token antes de guardar
  let tokenEnc: string
  try {
    tokenEnc = await encriptar(body.token.trim())
  } catch (e) {
    return NextResponse.json(
      { error: `Error al cifrar el token: ${e instanceof Error ? e.message : 'desconocido'}` },
      { status: 500 }
    )
  }

  const { error } = await supabase
    .from('ferreterias')
    .update({
      nubefact_token_enc: tokenEnc,
      nubefact_modo:      modo,
    })
    .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── POST — test de conexión ───────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { token?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const supabase = await createClient()

  // Si viene token nuevo en el body, lo usamos directamente (para test antes de guardar)
  let tokenPlano = body.token?.trim() ?? ''

  // Si no viene token, buscamos el guardado
  if (!tokenPlano) {
    const { data: ferr } = await supabase
      .from('ferreterias')
      .select('ruc, nubefact_token_enc')
      .eq('id', session.ferreteriaId)  // FERRETERÍA AISLADA
      .single()

    if (!ferr?.nubefact_token_enc) {
      return NextResponse.json(
        { ok: false, error: 'No hay token Nubefact configurado' },
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

    // Necesitamos el RUC del tenant para el test
    if (!ferr.ruc) {
      return NextResponse.json(
        { ok: false, error: 'Configura el RUC en Settings → Facturación antes de probar Nubefact' },
        { status: 422 }
      )
    }

    const resultado = await testConexionNubefact(ferr.ruc, tokenPlano)
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
  }

  // Test con token nuevo (antes de guardar) — necesitamos el RUC
  const { data: ferr } = await supabase
    .from('ferreterias')
    .select('ruc')
    .eq('id', session.ferreteriaId)  // FERRETERÍA AISLADA
    .single()

  if (!ferr?.ruc) {
    return NextResponse.json(
      { ok: false, error: 'Configura el RUC en Settings → Facturación antes de probar Nubefact' },
      { status: 422 }
    )
  }

  const resultado = await testConexionNubefact(ferr.ruc, tokenPlano)
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}

// ── GET — estado actual (token enmascarado) ───────────────────────────────────

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ferreterias')
    .select('nubefact_token_enc, nubefact_modo')
    .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    configurado:    !!data?.nubefact_token_enc,
    modo:           data?.nubefact_modo ?? 'prueba',
    // Nunca devolvemos el token real — solo si está configurado
  })
}
