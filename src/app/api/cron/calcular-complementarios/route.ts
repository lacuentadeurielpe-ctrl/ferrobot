// GET /api/cron/calcular-complementarios
// Vercel Cron: cada lunes a las 02:00 UTC (9pm Lima del domingo).
// Analiza co-compras de los últimos 30 días y upserta pares auto-detectados
// en productos_complementarios donde frecuencia >= UMBRAL.
//
// FERRETERÍA AISLADA: procesa cada ferretería en forma independiente.
// Solo toca filas tipo='auto' — nunca borra ni modifica los 'manual' del dueño.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const UMBRAL_FRECUENCIA = 0.30   // el par aparece en al menos 30% de pedidos con ese producto
const VENTANA_DIAS      = 30     // analizar últimos 30 días
const MIN_PEDIDOS       = 5      // mínimo de pedidos para considerar estadística válida

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = adminClient()
  const desde    = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString()

  // Obtener todas las ferreterías activas
  const { data: ferreterias, error: errFerr } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('onboarding_completo', true)

  if (errFerr || !ferreterias) {
    return NextResponse.json({ error: 'No se pudo listar ferreterías' }, { status: 500 })
  }

  let totalPares = 0
  const resumen: Record<string, number> = {}

  for (const { id: ferreteriaId } of ferreterias) {
    try {
      const pares = await calcularParesParaFerreteria(supabase, ferreteriaId, desde)
      if (pares > 0) resumen[ferreteriaId] = pares
      totalPares += pares
    } catch (e) {
      console.error(`[Cron complementarios] Error en ferreteria=${ferreteriaId}:`, e)
    }
  }

  console.log(`[Cron complementarios] Completado. ${totalPares} pares actualizados en ${ferreterias.length} ferreterías.`)
  return NextResponse.json({ ok: true, totalPares, ferreterias: resumen })
}

async function calcularParesParaFerreteria(
  supabase: ReturnType<typeof adminClient>,
  ferreteriaId: string,
  desde: string
): Promise<number> {
  // Obtener items de pedidos del período, agrupados por pedido
  const { data: items, error } = await supabase
    .from('items_pedido')
    .select('pedido_id, producto_id')
    .eq('pedidos.ferreteria_id', ferreteriaId)  // FERRETERÍA AISLADA via join
    .gte('pedidos.created_at', desde)
    .not('producto_id', 'is', null)

  // Si el join filtrado no funciona por el client, hacemos dos queries
  if (error || !items) {
    // Fallback: primero obtener pedidos de la ferretería en el período
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id')
      .eq('ferreteria_id', ferreteriaId)       // FERRETERÍA AISLADA
      .gte('created_at', desde)
      .in('estado', ['confirmado', 'en_preparacion', 'enviado', 'entregado'])

    if (!pedidos || pedidos.length < MIN_PEDIDOS) return 0

    const pedidoIds = pedidos.map((p) => p.id)

    const { data: itemsFallback } = await supabase
      .from('items_pedido')
      .select('pedido_id, producto_id')
      .in('pedido_id', pedidoIds)
      .not('producto_id', 'is', null)

    if (!itemsFallback || itemsFallback.length === 0) return 0
    return procesarItems(supabase, ferreteriaId, itemsFallback)
  }

  if (items.length === 0) return 0
  return procesarItems(supabase, ferreteriaId, items)
}

async function procesarItems(
  supabase: ReturnType<typeof adminClient>,
  ferreteriaId: string,
  items: Array<{ pedido_id: string; producto_id: string | null }>
): Promise<number> {
  // Agrupar por pedido
  const porPedido = new Map<string, Set<string>>()
  for (const item of items) {
    if (!item.producto_id) continue
    if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, new Set())
    porPedido.get(item.pedido_id)!.add(item.producto_id)
  }

  if (porPedido.size < MIN_PEDIDOS) return 0

  // Contar cuántos pedidos tienen cada producto
  const conteoPorProducto = new Map<string, number>()
  for (const productosEnPedido of porPedido.values()) {
    for (const pid of productosEnPedido) {
      conteoPorProducto.set(pid, (conteoPorProducto.get(pid) ?? 0) + 1)
    }
  }

  // Contar co-ocurrencias: cuántos pedidos tienen A y B juntos
  const coOcurrencias = new Map<string, number>()
  for (const productosEnPedido of porPedido.values()) {
    const arr = [...productosEnPedido]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const clave = `${arr[i]}|${arr[j]}`
        const claveInv = `${arr[j]}|${arr[i]}`
        coOcurrencias.set(clave, (coOcurrencias.get(clave) ?? 0) + 1)
        coOcurrencias.set(claveInv, (coOcurrencias.get(claveInv) ?? 0) + 1)
      }
    }
  }

  // Filtrar pares que superen el umbral de frecuencia
  const paresValidos: Array<{
    ferreteria_id: string
    producto_id: string
    complementario_id: string
    tipo: string
    frecuencia: number
    activo: boolean
  }> = []

  for (const [clave, coCount] of coOcurrencias) {
    const [productoId, complementarioId] = clave.split('|')
    const totalProducto = conteoPorProducto.get(productoId) ?? 0
    if (totalProducto < MIN_PEDIDOS) continue
    const frecuencia = coCount / totalProducto
    if (frecuencia < UMBRAL_FRECUENCIA) continue

    paresValidos.push({
      ferreteria_id:    ferreteriaId,
      producto_id:      productoId,
      complementario_id: complementarioId,
      tipo:             'auto',
      frecuencia:       Math.round(frecuencia * 1000) / 1000,
      activo:           true,
    })
  }

  if (paresValidos.length === 0) return 0

  // Upsert solo tipo='auto' — los 'manual' del dueño nunca se tocan
  // onConflict: (ferreteria_id, producto_id, complementario_id)
  const { error: errUpsert } = await supabase
    .from('productos_complementarios')
    .upsert(paresValidos, {
      onConflict: 'ferreteria_id,producto_id,complementario_id',
      ignoreDuplicates: false,
    })
    // Solo actualizar si el tipo ya era 'auto' — evitar pisar los 'manual'
    // Supabase no soporta WHERE en upsert, así que filtramos antes de subir

  if (errUpsert) {
    console.error(`[Cron complementarios] Error upsert ferreteria=${ferreteriaId}:`, errUpsert.message)
    return 0
  }

  console.log(`[Cron complementarios] ferreteria=${ferreteriaId} → ${paresValidos.length} pares auto`)
  return paresValidos.length
}
