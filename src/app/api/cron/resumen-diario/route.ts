// GET /api/cron/resumen-diario
// Enviado por Vercel Cron cada noche a las 8pm Lima (01:00 UTC)
// Protegido por Authorization: Bearer CRON_SECRET

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { formatPEN } from '@/lib/utils'
import { inicioDiaLima, etiquetaFechaLima } from '@/lib/tiempo'
import { getYCloudApiKey } from '@/lib/tenant'

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
  const inicio  = inicioDiaLima(0)
  const etiqueta = etiquetaFechaLima()

  // Ferreterías con resumen diario activo y teléfono del dueño configurado
  const { data: ferreterias, error } = await supabase
    .from('ferreterias')
    .select('id, nombre, telefono_whatsapp, telefono_dueno')
    .eq('resumen_diario_activo', true)
    .not('telefono_dueno', 'is', null)
    .not('telefono_whatsapp', 'is', null)

  if (error) {
    console.error('[cron/resumen-diario] Error obteniendo ferreterías:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const resultados: Array<{ ferreteria: string; ok: boolean; error?: string }> = []

  // Marcar créditos vencidos (ejecutar una vez, aplica a todas las ferreterías)
  try {
    const hoy = new Date().toISOString().slice(0, 10)
    await supabase
      .from('creditos')
      .update({ estado: 'vencido' })
      .eq('estado', 'activo')
      .lt('fecha_limite', hoy)
    console.log('[cron/resumen-diario] Créditos vencidos marcados')
  } catch (e) {
    console.error('[cron/resumen-diario] Error marcando créditos vencidos:', e)
  }

  for (const ferreteria of ferreterias ?? []) {
    try {
      const fid = ferreteria.id

      // Pedidos del día
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('id, estado, total')
        .eq('ferreteria_id', fid)
        .gte('created_at', inicio)

      const pedidosHoy = pedidos ?? []
      const totalPedidos = pedidosHoy.length
      const completados = pedidosHoy.filter(p => p.estado === 'entregado' || p.estado === 'completado').length
      const enCamino = pedidosHoy.filter(p => p.estado === 'en_camino' || p.estado === 'confirmado').length
      const pendientes = pedidosHoy.filter(p => p.estado === 'pendiente').length
      const cancelados = pedidosHoy.filter(p => p.estado === 'cancelado').length
      const ingresos = pedidosHoy
        .filter(p => p.estado !== 'cancelado')
        .reduce((s, p) => s + (p.total ?? 0), 0)

      // Cotizaciones del día
      const { data: cotizaciones } = await supabase
        .from('cotizaciones')
        .select('id, estado')
        .eq('ferreteria_id', fid)
        .gte('created_at', inicio)

      const cotizacionesHoy = cotizaciones ?? []
      const totalCot = cotizacionesHoy.length
      const cotAprobadas = cotizacionesHoy.filter(c => c.estado === 'aprobada').length
      const cotPendientes = cotizacionesHoy.filter(c => c.estado === 'pendiente').length

      // Conversaciones activas (total del día)
      const { data: conversaciones } = await supabase
        .from('conversaciones')
        .select('id')
        .eq('ferreteria_id', fid)
        .gte('updated_at', inicio)

      const totalConv = (conversaciones ?? []).length

      // Armar mensaje
      const nombre = ferreteria.nombre ?? 'tu ferretería'
      const lineas: string[] = []

      lineas.push(`📊 *Resumen del día — ${nombre}*`)
      lineas.push(`_${etiqueta}_`)
      lineas.push('')

      // Pedidos
      if (totalPedidos === 0) {
        lineas.push('🛒 Sin pedidos hoy')
      } else {
        const detalle: string[] = []
        if (completados > 0) detalle.push(`${completados} entregado${completados > 1 ? 's' : ''}`)
        if (enCamino > 0) detalle.push(`${enCamino} en camino`)
        if (pendientes > 0) detalle.push(`${pendientes} pendiente${pendientes > 1 ? 's' : ''}`)
        if (cancelados > 0) detalle.push(`${cancelados} cancelado${cancelados > 1 ? 's' : ''}`)
        lineas.push(`🛒 *Pedidos:* ${totalPedidos} (${detalle.join(' · ')})`)
      }

      // Ingresos
      if (ingresos > 0) {
        lineas.push(`💰 *Ingresos:* ${formatPEN(ingresos)}`)
      }

      // Cotizaciones
      if (totalCot > 0) {
        const detCot: string[] = []
        if (cotAprobadas > 0) detCot.push(`${cotAprobadas} aprobada${cotAprobadas > 1 ? 's' : ''}`)
        if (cotPendientes > 0) detCot.push(`${cotPendientes} pendiente${cotPendientes > 1 ? 's' : ''}`)
        lineas.push(`📋 *Cotizaciones:* ${totalCot}${detCot.length ? ` (${detCot.join(' · ')})` : ''}`)
      } else {
        lineas.push('📋 Sin cotizaciones hoy')
      }

      // Conversaciones
      if (totalConv > 0) {
        lineas.push(`💬 *Conversaciones:* ${totalConv} activa${totalConv > 1 ? 's' : ''}`)
      }

      lineas.push('')

      // Cierre motivacional
      if (totalPedidos === 0 && totalCot === 0) {
        lineas.push('_Mañana será un gran día. ¡Ánimo! 💪_')
      } else if (ingresos > 500) {
        lineas.push('_¡Excelente cierre de día! 🔧🚀_')
      } else {
        lineas.push('_¡Buen trabajo hoy! 🔧_')
      }

      const texto = lineas.join('\n')

      const apiKey = await getYCloudApiKey(ferreteria.id)
      await enviarMensaje({
        from: ferreteria.telefono_whatsapp,
        to: ferreteria.telefono_dueno!,
        texto,
        apiKey,
      })

      resultados.push({ ferreteria: nombre, ok: true })
    } catch (e) {
      const nombre = ferreteria.nombre ?? ferreteria.id
      console.error(`[cron/resumen-diario] Error en ${nombre}:`, e)
      resultados.push({ ferreteria: nombre, ok: false, error: String(e) })
    }
  }

  return NextResponse.json({ enviados: resultados.length, resultados })
}
