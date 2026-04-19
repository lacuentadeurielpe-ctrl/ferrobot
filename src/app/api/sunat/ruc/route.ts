// POST /api/sunat/ruc — consulta datos de un RUC en la API de SUNAT
//
// Requiere: sesión autenticada + variable APIS_NET_PE_TOKEN en Vercel
// SUNAT es datos públicos; el guardado del ruc_cliente siempre usa ferreteriaId.

import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { consultarRuc, validarFormatoRuc, sunatDisponible } from '@/lib/sunat/ruc'

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Informar rápido si el token no está configurado
  if (!sunatDisponible()) {
    return NextResponse.json(
      {
        error:    'Verificación SUNAT no configurada',
        sinToken: true,
        ayuda:    'Registra en apis.net.pe (gratis), obtén tu token y agrégalo como APIS_NET_PE_TOKEN en Vercel → Settings → Environment Variables',
      },
      { status: 503 }
    )
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
    const status = resultado.sinToken ? 503 : 422
    return NextResponse.json(
      { error: resultado.error, sinToken: resultado.sinToken ?? false },
      { status }
    )
  }

  return NextResponse.json(resultado.data)
}
