import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderToStream } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import PlantillaTicket from '@/components/pdf/PlantillaTicket'
import PlantillaBoletaFactura from '@/components/pdf/PlantillaBoletaFactura'
import React from 'react'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const supabase = createAdminClient()

  const { id } = await params

  // 1. Obtener comprobante
  const { data: comprobante, error: errComp } = await supabase
    .from('comprobantes')
    .select('*, pedidos(items_pedido(*))')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (errComp || !comprobante) {
    return new NextResponse('Comprobante no encontrado', { status: 404 })
  }

  // 2. Obtener ferreteria
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .eq('id', session.ferreteriaId)
    .single()

  if (!ferreteria) {
    return new NextResponse('Error interno', { status: 500 })
  }

  // 3. Generar QR
  let qrDataUri = ''
  if (comprobante.nubefact_qr_cadena) {
    try {
      qrDataUri = await QRCode.toDataURL(comprobante.nubefact_qr_cadena, {
        margin: 0,
        width: 150
      })
    } catch (e) {
      console.error('Error generando QR', e)
    }
  }

  // 4. Preparar data
  const items = comprobante.pedidos?.items_pedido?.map((i: any) => ({
    cantidad: i.cantidad,
    descripcion: i.nombre_producto,
    precio_unitario: i.precio_unitario,
    subtotal: i.subtotal,
  })) || []

  const data = {
    ferreteria: {
      razon_social: ferreteria.razon_social || ferreteria.nombre || 'MI FERRETERIA E.I.R.L',
      nombre_comercial: ferreteria.nombre_comercial || ferreteria.nombre,
      ruc: ferreteria.ruc || '00000000000',
      direccion: ferreteria.direccion || 'Lima, Peru',
      logo_url: ferreteria.logo_url || null,
    },
    comprobante: {
      numero_completo: comprobante.numero_completo || comprobante.numero_comprobante || '',
      tipo: (comprobante.tipo || 'boleta') as any,
      fecha: comprobante.created_at,
      cliente_nombre: comprobante.cliente_nombre || 'CLIENTES VARIOS',
      cliente_doc: comprobante.cliente_ruc_dni || '',
      subtotal: comprobante.subtotal || 0,
      igv: comprobante.igv || 0,
      total: comprobante.total || 0,
      hash: comprobante.nubefact_hash || '',
      qr_data_uri: qrDataUri,
    },
    items,
  }

  // 5. Elegir plantilla según tipo de comprobante
  // Boletas y Facturas usan la plantilla A4 profesional
  // Notas de venta internas usan la plantilla de ticket 80mm
  const tipo = comprobante.tipo || ''
  const usarTicket = !tipo || tipo === 'nota_venta' || tipo === 'proforma'
  
  const component = usarTicket
    ? React.createElement(PlantillaTicket, { data })
    : React.createElement(PlantillaBoletaFactura, { data })

  // 6. Renderizar PDF
  try {
    const stream = await renderToStream(component as any)
    
    // Convert Node.js stream to Web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        stream.on('end', () => {
          controller.close()
        })
        stream.on('error', (err) => {
          controller.error(err)
        })
      }
    })

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${data.comprobante.numero_completo}.pdf"`
      }
    })
  } catch (err) {
    console.error('Error renderizando PDF', err)
    return new NextResponse('Error generando PDF', { status: 500 })
  }
}
