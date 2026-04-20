// GET /api/cron/debounce-cleanup
// Vercel Cron: limpia filas huérfanas de debounce_pendiente (webhook que crasheó).
// Se ejecuta cada 5 minutos. Borra filas cuyo vence_at pasó hace más de 5 min.
//
// FERRETERÍA AISLADA: la tabla ya está scoped por ferreteria_id; el cleanup
// solo borra por tiempo vencido, no por tenant específico.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { limpiarDebounceHuerfano } from '@/lib/bot/debounce'

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const borradas = await limpiarDebounceHuerfano(supabase)
  console.log(`[cron/debounce-cleanup] Borradas ${borradas} filas huérfanas`)
  return NextResponse.json({ ok: true, borradas })
}
