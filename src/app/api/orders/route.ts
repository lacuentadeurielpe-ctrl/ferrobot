import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { geocodificarDireccion } from '@/lib/delivery/geocoding'
import { calcularETA } from '@/lib/delivery/eta'

export const dynamic = 'force-dynamic'

interface ItemNuevoPedido {
  producto_id: string | null
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
}

// POST /api/orders — crear pedido manual desde el panel
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()

  const body = await request.json()
  const {
    nombre_cliente,
    telefono_cliente,
    modalidad,
    direccion_entrega,
    zona_delivery_id,
    notas,
    items,
  }: {
    nombre_cliente: string
    telefono_cliente: string
    modalidad: 'delivery' | 'recojo'
    direccion_entrega?: string
    zona_delivery_id?: string
    notas?: string
    items: ItemNuevoPedido[]
  } = body

  if (!nombre_cliente?.trim()) return NextResponse.json({ error: 'Nombre del cliente requerido' }, { status: 400 })
  if (!telefono_cliente?.trim()) return NextResponse.json({ error: 'Teléfono del cliente requerido' }, { status: 400 })
  if (!modalidad) return NextResponse.json({ error: 'Modalidad requerida' }, { status: 400 })
  if (!items?.length) return NextResponse.json({ error: 'Debe incluir al menos un item' }, { status: 400 })
  if (modalidad === 'delivery' && !direccion_entrega?.trim())
    return NextResponse.json({ error: 'Dirección requerida para delivery' }, { status: 400 })

  const total = items.reduce((s: number, i: ItemNuevoPedido) => s + i.cantidad * i.precio_unitario, 0)
  const costo_total = items.reduce((s: number, i: ItemNuevoPedido) => s + i.cantidad * i.costo_unitario, 0)

  // Generar número de pedido
  const { data: numeroPedido, error: errNum } = await supabase
    .rpc('generar_numero_pedido', { p_ferreteria_id: session.ferreteriaId })
  if (errNum || !numeroPedido)
    return NextResponse.json({ error: `Error generando número: ${errNum?.message}` }, { status: 500 })

  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .insert({
      ferreteria_id: session.ferreteriaId,
      numero_pedido: numeroPedido,
      nombre_cliente: nombre_cliente.trim(),
      telefono_cliente: telefono_cliente.trim(),
      modalidad,
      direccion_entrega: direccion_entrega?.trim() ?? null,
      zona_delivery_id: zona_delivery_id ?? null,
      notas: notas?.trim() ?? null,
      estado: 'pendiente',
      total,
      costo_total,
    })
    .select('id, numero_pedido')
    .single()

  if (errPedido || !pedido)
    return NextResponse.json({ error: errPedido?.message ?? 'Error creando pedido' }, { status: 500 })

  const itemsInsert = items.map((i: ItemNuevoPedido) => ({
    pedido_id: pedido.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    unidad: i.unidad,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    costo_unitario: i.costo_unitario,
    subtotal: i.cantidad * i.precio_unitario,
  }))

  const { error: errItems } = await supabase.from('items_pedido').insert(itemsInsert)
  if (errItems)
    return NextResponse.json({ error: errItems.message }, { status: 500 })

  // ── ETA asíncrono (fire-and-forget) ─────────────────────────────────────────
  // Solo para delivery con dirección. No bloquea la respuesta al cliente.
  if (modalidad === 'delivery' && direccion_entrega?.trim()) {
    const pedidoIdEta = pedido.id
    const ferreteriaIdEta = session.ferreteriaId
    const dirEta = direccion_entrega.trim()
    ;(async () => {
      try {
        // 1. Obtener coordenadas de la ferretería
        const { data: ferreteria } = await supabase
          .from('ferreterias')
          .select('lat, lng, nombre')
          .eq('id', ferreteriaIdEta)
          .single()

        if (!ferreteria?.lat || !ferreteria?.lng) return

        // 2. Geocodificar la dirección del cliente
        const coords = await geocodificarDireccion(dirEta, ferreteria.nombre ?? 'Perú')
        if (!coords) return

        // 3. Obtener velocidad promedio del vehículo activo más rápido (o default 30 km/h)
        const { data: vehiculos } = await supabase
          .from('vehiculos')
          .select('velocidad_promedio_kmh')
          .eq('ferreteria_id', ferreteriaIdEta)
          .eq('activo', true)
          .order('velocidad_promedio_kmh', { ascending: false })
          .limit(1)

        const velocidadKmh = vehiculos?.[0]?.velocidad_promedio_kmh ?? 30

        // 4. Contar pedidos delivery activos (excluyendo el recién creado)
        const { count: cola } = await supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('ferreteria_id', ferreteriaIdEta)
          .eq('modalidad', 'delivery')
          .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
          .neq('id', pedidoIdEta)

        // 5. Calcular ETA
        const eta = await calcularETA({
          ferreteriaLat: ferreteria.lat,
          ferreteriaLng: ferreteria.lng,
          clienteLat:    coords.lat,
          clienteLng:    coords.lng,
          velocidadKmh,
          pedidosEnCola: cola ?? 0,
        })

        // 5. Guardar en el pedido
        await supabase
          .from('pedidos')
          .update({
            eta_minutos:  eta.tiempoTotalMin,
            cliente_lat:  coords.lat,
            cliente_lng:  coords.lng,
          })
          .eq('id', pedidoIdEta)
          .eq('ferreteria_id', ferreteriaIdEta)
      } catch {
        // silently ignore — ETA is best-effort
      }
    })()
  }

  return NextResponse.json({ id: pedido.id, numero_pedido: pedido.numero_pedido }, { status: 201 })
}

// GET /api/orders
export async function GET(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('pedidos')
    .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*), eta_minutos, direccion_entrega')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
