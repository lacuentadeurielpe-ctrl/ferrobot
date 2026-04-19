// POST /api/sunat/ruc — consulta datos de un RUC en la API pública de SUNAT
//
// Seguridad:
// - Requiere sesión autenticada (evita uso como proxy público abierto)
// - No filtra por ferreteria_id porque SUNAT es datos públicos (cualquier RUC)
// - El GUARDADO del ruc_cliente en BD siempre se hace filtrando por ferreteriaId
//   en el punto de uso (bot, settings), no aquí

import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { consultarRuc, validarFormatoRuc } from '@/lib/sunat/ruc'

export async function POST(request: Request) {
  // Requiere sesión — evita proxy público
  const session = await getSessionInfo()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { ruc?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const ruc = (body.ruc ?? '').replace(/\D/g, '')

  if (!ruc || ruc.length !== 11) {
    return NextResponse.json({ error: 'RUC debe tener 11 dígitos' }, { status: 400 })
  }

  if (!validarFormatoRuc(ruc)) {
    return NextResponse.json(
      { error: 'Formato de RUC inválido (debe comenzar con 10 o 20)' },
      { status: 400 }
    )
  }

  const resultado = await consultarRuc(ruc)

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 422 })
  }

  return NextResponse.json(resultado.data)
}
