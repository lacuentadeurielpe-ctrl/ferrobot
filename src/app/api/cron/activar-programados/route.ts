// GET /api/cron/activar-programados
// Ejecutado por Vercel Cron a las 6:00 AM Lima (11:00 UTC) todos los días.
// Activa los pedidos con estado='programado' cuya fecha_entrega_programada
// cae dentro del día de hoy en Lima.
//
// Protegido por Authorization: Bearer CRON_SECRET

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { getYCloudApiKey } from '@/lib/tenant'
import { crearEntrega } from '@/lib/delivery/assignment'
import { inicioDiaLima, finDiaLima } from '@/lib/tiempo'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  // Verificar secret de Vercel Cron
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = adminClient()

  // Ventana: hoy completo en Lima (00:00 Lima → 00:00 Lima siguiente día)
  // El cron corre a las 6am Lima — activa los pedidos programados para HOY.
  const inicioHoy = inicioDiaLima(0)   // 00:00 Lima hoy → UTC
  const finHoy    = finDiaLima(0)      // 00:00 Lima mañana → UTC (límite exclusivo)

  // Buscar pedidos programados cuya fecha de entrega cae hoy (Lima)
  // FERRETERÍA AISLADA: la query usa admin client — filtrar por estado + rango fecha
  const { data: pedidosProgramados, error } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, modalidad, ferreteria_id, telefono_cliente, nombre_cliente, total, eta_minutos, ferreterias(nombre, telefono_whatsapp, telefono_dueno)')
    .eq('estado', 'programado')
    .gte('fecha_entrega_programada', inicioHoy)
    .lt('fecha_entrega_programada', finHoy)

  if (error) {
    console.error('[cron/activar-programados] Error buscando pedidos:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pedidos = pedidosProgramados ?? []
  console.log(`[cron/activar-programados] ${pedidos.length} pedido(s) a activar`)

  const resultados: Array<{ pedidoId: string; numero: string; ok: boolean; error?: string }> = []

  for (const pedido of pedidos) {
    try {
      const ferr = pedido.ferreterias as any

      // 1. Cambiar estado a 'confirmado' — FERRETERÍA AISLADA
      await supabase
        .from('pedidos')
        .update({ estado: 'confirmado' })
        .eq('id', pedido.id)
        .eq('ferreteria_id', pedido.ferreteria_id)   // FERRETERÍA AISLADA
        .eq('estado', 'programado')                   // guard — no tocar si ya fue activado

      // 2. Crear registro de entrega para pedidos delivery
      if (pedido.modalidad === 'delivery') {
        await crearEntrega({
          ferreteriaId: pedido.ferreteria_id,
          pedidoId:     pedido.id,
          repartidorId: null,
          etaMinutos:   pedido.eta_minutos ?? null,
          supabase,
        })
      }

      // 3. Notificación WhatsApp al cliente (fire-and-forget)
      if (ferr?.telefono_whatsapp && pedido.telefono_cliente) {
        const apiKey = await getYCloudApiKey(pedido.ferreteria_id).catch(() => null)
        if (apiKey) {
          const textoCliente =
            pedido.modalidad === 'delivery'
              ? `📦 *${ferr.nombre}*\n\n¡Tu pedido programado *${pedido.numero_pedido}* ya está en preparación! Pronto te avisaremos cuando esté en camino. 🚚`
              : `📦 *${ferr.nombre}*\n\n¡Tu pedido programado *${pedido.numero_pedido}* ya está en preparación! Puedes pasar a recogerlo cuando gustes. 🙌`

          enviarMensaje({
            from:  ferr.telefono_whatsapp,
            to:    pedido.telefono_cliente,
            texto: textoCliente,
            apiKey,
          }).catch((e) => console.error('[cron/activar-programados] Error notif cliente:', e))
        }
      }

      resultados.push({ pedidoId: pedido.id, numero: pedido.numero_pedido, ok: true })
    } catch (e) {
      console.error(`[cron/activar-programados] Error activando ${pedido.numero_pedido}:`, e)
      resultados.push({ pedidoId: pedido.id, numero: pedido.numero_pedido, ok: false, error: String(e) })
    }
  }

  return NextResponse.json({
    activados: resultados.filter((r) => r.ok).length,
    fallidos:  resultados.filter((r) => !r.ok).length,
    resultados,
  })
}
