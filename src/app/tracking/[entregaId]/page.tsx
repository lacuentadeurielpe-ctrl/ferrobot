import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import TrackingView from './TrackingView'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function generateMetadata({ params }: { params: Promise<{ entregaId: string }> }) {
  return { title: 'Seguimiento de entrega · FerroBot' }
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ entregaId: string }>
}) {
  const { entregaId } = await params
  const supabase = adminClient()

  const { data: entrega } = await supabase
    .from('entregas')
    .select(`
      id, estado, eta_actual, distancia_km,
      pedidos(
        id, numero_pedido, nombre_cliente, telefono_cliente,
        direccion_entrega, total, estado, eta_minutos,
        cliente_lat, cliente_lng
      ),
      vehiculos(nombre, tipo, velocidad_promedio_kmh),
      repartidores(
        nombre, telefono,
        gps_ultima_lat, gps_ultima_lng, gps_actualizado_at,
        ferreterias(nombre, telefono_whatsapp)
      )
    `)
    .eq('id', entregaId)
    .single()

  if (!entrega) notFound()

  const pedido     = entrega.pedidos     as any
  const repartidor = entrega.repartidores as any
  const ferreteria = repartidor?.ferreterias as any

  const initial = {
    entregaId:   entrega.id,
    estado:      entrega.estado,
    pedido: {
      numero_pedido:     pedido?.numero_pedido     ?? null,
      nombre_cliente:    pedido?.nombre_cliente    ?? null,
      direccion_entrega: pedido?.direccion_entrega ?? null,
      total:             pedido?.total             ?? null,
      estado:            pedido?.estado            ?? null,
      cliente_lat:       pedido?.cliente_lat       ?? null,
      cliente_lng:       pedido?.cliente_lng       ?? null,
    },
    repartidor: {
      nombre:   repartidor?.nombre             ?? null,
      telefono: repartidor?.telefono           ?? null,
      gps_lat:  repartidor?.gps_ultima_lat     ?? null,
      gps_lng:  repartidor?.gps_ultima_lng     ?? null,
      gps_at:   repartidor?.gps_actualizado_at ?? null,
    },
    ferreteria: {
      nombre:   ferreteria?.nombre            ?? null,
      telefono: ferreteria?.telefono_whatsapp ?? null,
    },
    eta_minutos:  pedido?.eta_minutos   ?? null,
    distancia_km: entrega.distancia_km  ?? null,
    eta_actual:   entrega.eta_actual    ?? null,
  }

  return <TrackingView initial={initial} entregaId={entregaId} />
}
