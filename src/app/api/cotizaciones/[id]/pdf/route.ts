import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { ComprobantePDF } from '@/lib/pdf/comprobante'

export const dynamic = 'force-dynamic'

// GET /api/cotizaciones/[id]/pdf — generar y previsualizar PDF de cotización
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return new Response('No autorizado', { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  // 1. Cargar cotización con sus items y cliente
  const { data: cotizacion, error } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (error || !cotizacion) {
    return new Response('Cotización no encontrada', { status: 404 })
  }

  // 2. Cargar ferretería para obtener datos de cabecera y diseño
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('nombre, direccion, telefono_whatsapp, logo_url, color_comprobante, mensaje_comprobante, formas_pago')
    .eq('id', session.ferreteriaId)
    .single()

  if (!ferreteria) {
    return new Response('Ferretería no encontrada', { status: 404 })
  }

  const cotNum = `COT-${cotizacion.id.slice(0, 8).toUpperCase()}`
  const cliente = cotizacion.clientes
  const nombreCliente = Array.isArray(cliente)
    ? cliente[0]?.nombre
    : cliente?.nombre || cliente?.telefono || 'Cliente'

  // 3. Mapear datos al formato de ComprobantePDF (marcando esProforma = true)
  const datos = {
    nombre_ferreteria:    ferreteria.nombre,
    direccion_ferreteria: ferreteria.direccion,
    telefono_ferreteria:  ferreteria.telefono_whatsapp,
    logo_url:             ferreteria.logo_url,
    color:                ferreteria.color_comprobante || '#1e40af',
    mensaje_pie:          ferreteria.mensaje_comprobante,
    numero_comprobante:   cotNum,
    fecha_emision:        cotizacion.created_at,
    esProforma:           true,
    numero_pedido:        cotNum,
    nombre_cliente:       nombreCliente,
    modalidad:            'recojo' as const, // por defecto para cotizaciones
    direccion_entrega:    null,
    formas_pago:          (ferreteria.formas_pago as string[]) || [],
    items: cotizacion.items_cotizacion.map((i: any) => ({
      nombre_producto: i.nombre_producto,
      unidad:          i.unidad,
      cantidad:        i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal:        i.subtotal,
    })),
    total:                cotizacion.total,
  }

  // 4. Renderizar PDF usando @react-pdf/renderer
  let pdfBuffer: Buffer
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(
      React.createElement(ComprobantePDF, { datos }) as any
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`Error al generar PDF: ${msg}`, { status: 500 })
  }

  // 5. Devolver como stream de PDF
  return new Response(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${cotNum}.pdf"`,
    },
  })
}
