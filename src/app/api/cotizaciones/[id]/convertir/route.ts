import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

// POST /api/cotizaciones/[id]/convertir — Convertir cotización a pedido
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params

  // 1. Obtener la cotización con sus ítems
  const { data: cotizacion, error: errCot } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (errCot || !cotizacion) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  if (!cotizacion.items_cotizacion || cotizacion.items_cotizacion.length === 0) {
    return NextResponse.json({ error: 'La cotización no tiene productos' }, { status: 400 })
  }

  // 2. Generar número de pedido
  const { data: numeroPedido, error: errNum } = await supabase
    .rpc('generar_numero_pedido', { p_ferreteria_id: session.ferreteriaId })
    
  if (errNum || !numeroPedido)
    return NextResponse.json({ error: `Error generando número de pedido: ${errNum?.message}` }, { status: 500 })

  // 3. Calcular costos si los productos existen en el catálogo
  let costo_total = 0
  let itemsParaPedido: any[] = []
  try {
    itemsParaPedido = await Promise.all(cotizacion.items_cotizacion.map(async (item: any) => {
      let costo_unitario = 0
      if (item.producto_id) {
        const { data: prod } = await supabase
          .from('productos')
          .select('precio_compra, stock, venta_sin_stock, nombre')
          .eq('id', item.producto_id)
          .single()
        if (prod) {
          if (!prod.venta_sin_stock && prod.stock < item.cantidad) {
            throw new Error(`El producto "${prod.nombre}" no tiene stock suficiente (Stock: ${prod.stock}, Solicitado: ${item.cantidad}). Activa la opción de "Venta sin stock" en el catálogo si deseas forzar la venta.`)
          }
          costo_unitario = prod.precio_compra
        }
      }
      
      costo_total += costo_unitario * item.cantidad

      return {
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto,
        unidad: item.unidad,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        costo_unitario: costo_unitario,
        subtotal: item.subtotal,
      }
    }))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 4. Crear el pedido
  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .insert({
      ferreteria_id: session.ferreteriaId,
      cotizacion_id: cotizacion.id,
      cliente_id: cotizacion.cliente_id,
      numero_pedido: numeroPedido,
      nombre_cliente: cotizacion.clientes?.nombre ?? '',
      telefono_cliente: cotizacion.clientes?.telefono ?? '',
      modalidad: 'recojo', // Por defecto recojo para cotizaciones convertidas
      estado: 'pendiente',
      total: cotizacion.total,
      costo_total: costo_total,
      notas: `Convertido desde Cotización #${cotizacion.id.slice(0, 8).toUpperCase()}`,
    })
    .select('id, numero_pedido')
    .single()

  if (errPedido || !pedido)
    return NextResponse.json({ error: errPedido?.message ?? 'Error creando pedido' }, { status: 500 })

  // 5. Insertar ítems del pedido
  const itemsInsert = itemsParaPedido.map(i => ({
    pedido_id: pedido.id,
    ...i
  }))

  const { error: errItems } = await supabase.from('items_pedido').insert(itemsInsert)
  
  if (errItems) {
    // Rollback manual (opcional) si fallan los items
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    return NextResponse.json({ error: errItems.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, pedido_id: pedido.id, numero_pedido: pedido.numero_pedido })
}
