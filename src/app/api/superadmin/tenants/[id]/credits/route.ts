// POST /api/superadmin/tenants/[id]/credits — agregar créditos a un tenant
// Acceso: solo superadmin nivel 'admin'

import { NextResponse } from 'next/server'
import { requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { agregarCreditos } from '@/lib/credits'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id: ferreteriaId } = await params
  const body = await request.json()

  const creditos = Number(body.creditos)
  if (!creditos || creditos <= 0 || creditos > 100_000) {
    return NextResponse.json({ error: 'Cantidad de créditos inválida (1-100.000)' }, { status: 400 })
  }

  const motivo = body.motivo ?? 'recarga_manual'
  const montoCobrado = Number(body.monto_cobrado ?? 0)

  const MOTIVOS_VALIDOS = ['plan_mensual', 'recarga_manual', 'compensacion', 'trial']
  if (!MOTIVOS_VALIDOS.includes(motivo)) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }

  try {
    await agregarCreditos({
      ferreteriaId,
      creditos,
      motivo,
      montoCobrado,
      superadminId: session.superadminId,
    })
    return NextResponse.json({ ok: true, creditos_agregados: creditos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
