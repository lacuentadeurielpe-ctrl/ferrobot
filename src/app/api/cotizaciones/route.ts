import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

// GET /api/cotizaciones
export async function GET(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/cotizaciones — crear cotización manual desde el panel
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const body = await request.json()
  const {
    nombre_cliente,
    telefono_cliente,
    notas_dueno,
    items,
  }: {
    nombre_cliente: string
    telefono_cliente: string
    notas_dueno?: string
    items: {
      producto_id: string | null
      nombre_producto: string
      unidad: string
      cantidad: number
      precio_unitario: number
    }[]
  } = body

  if (!nombre_cliente?.trim()) return NextResponse.json({ error: 'Nombre del cliente requerido' }, { status: 400 })
  if (!telefono_cliente?.trim()) return NextResponse.json({ error: 'Teléfono del cliente requerido' }, { status: 400 })
  if (!items?.length) return NextResponse.json({ error: 'Debe incluir al menos un item' }, { status: 400 })

  // 1. Buscar o crear cliente
  let clienteId: string | null = null
  const telNormal = telefono_cliente.replace(/^\+/, '').trim()
  
  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('id')
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('telefono', telNormal)
    .maybeSingle()

  if (clienteExistente) {
    clienteId = clienteExistente.id
    if (nombre_cliente) {
      await supabase
        .from('clientes')
        .update({ nombre: nombre_cliente.trim() })
        .eq('id', clienteId)
    }
  } else {
    const { data: nuevoCliente, error: errCliente } = await supabase
      .from('clientes')
      .insert({
        ferreteria_id: session.ferreteriaId,
        telefono: telNormal,
        nombre: nombre_cliente.trim(),
      })
      .select('id')
      .single()
    
    if (errCliente || !nuevoCliente) {
      return NextResponse.json({ error: 'Error al registrar cliente' }, { status: 500 })
    }
    clienteId = nuevoCliente.id
  }

  const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)

  // 2. Crear la cotización en estado 'aprobada' (las creadas en panel no requieren aprobación)
  const { data: cotizacion, error: errCotizacion } = await supabase
    .from('cotizaciones')
    .insert({
      ferreteria_id: session.ferreteriaId,
      cliente_id: clienteId,
      estado: 'aprobada',
      total,
      notas_dueno: notas_dueno?.trim() || null,
      requiere_aprobacion: false,
    })
    .select('id')
    .single()

  if (errCotizacion || !cotizacion) {
    return NextResponse.json({ error: errCotizacion?.message ?? 'Error creando cotización' }, { status: 500 })
  }

  // 3. Crear los items de la cotización
  const itemsInsert = items.map((i) => ({
    cotizacion_id: cotizacion.id,
    producto_id: i.producto_id,
    nombre_producto: i.nombre_producto,
    unidad: i.unidad,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    precio_original: i.precio_unitario,
    subtotal: i.cantidad * i.precio_unitario,
  }))

  const { error: errItems } = await supabase.from('items_cotizacion').insert(itemsInsert)
  if (errItems) {
    await supabase.from('cotizaciones').delete().eq('id', cotizacion.id)
    return NextResponse.json({ error: errItems.message }, { status: 500 })
  }

  return NextResponse.json({ id: cotizacion.id }, { status: 201 })
}
