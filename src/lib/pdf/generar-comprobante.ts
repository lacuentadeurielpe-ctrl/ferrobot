// Orquestador: genera PDF → sube a Storage → guarda en DB → envía por WhatsApp
// Usa el admin client para bypassear RLS (operación interna del sistema)

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarDocumento } from '@/lib/whatsapp/ycloud'
import { ComprobantePDF, type DatosComprobante } from './comprobante'

export interface ResultadoComprobante {
  ok: boolean
  numero_comprobante?: string
  pdf_url?: string
  comprobante_id?: string
  error?: string
}

export async function generarYEnviarComprobante({
  pedidoId,
  ferreteriaId,
}: {
  pedidoId: string
  ferreteriaId: string
}): Promise<ResultadoComprobante> {
  const supabase = createAdminClient()

  // ── 1. Cargar pedido con todos los datos necesarios ──────────────────────
  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .select('*, items_pedido(*), clientes(nombre, telefono)')
    .eq('id', pedidoId)
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (errPedido || !pedido) {
    return { ok: false, error: `Pedido no encontrado: ${errPedido?.message}` }
  }

  // ── 2. Cargar ferretería ─────────────────────────────────────────────────
  const { data: ferreteria, error: errFerr } = await supabase
    .from('ferreterias')
    .select('id, nombre, direccion, telefono_whatsapp, formas_pago, logo_url, color_comprobante, mensaje_comprobante')
    .eq('id', ferreteriaId)
    .single()

  if (errFerr || !ferreteria) {
    return { ok: false, error: `Ferretería no encontrada: ${errFerr?.message}` }
  }

  // ── 3. Verificar si ya existe un comprobante para este pedido ────────────
  const { data: existente } = await supabase
    .from('comprobantes')
    .select('id, numero_comprobante, pdf_url, enviado_whatsapp')
    .eq('pedido_id', pedidoId)
    .single()

  if (existente) {
    return {
      ok: true,
      numero_comprobante: existente.numero_comprobante,
      pdf_url: existente.pdf_url,
      comprobante_id: existente.id,
    }
  }

  // ── 4. Generar número correlativo (atómico en DB) ────────────────────────
  const { data: numData, error: errNum } = await supabase
    .rpc('generar_numero_comprobante', { p_ferreteria_id: ferreteriaId })

  if (errNum || !numData) {
    return { ok: false, error: `Error generando número: ${errNum?.message}` }
  }

  const numeroComprobante = numData as string

  // ── 5. Construir datos para el PDF ───────────────────────────────────────
  const items = ((pedido as any).items_pedido ?? []).map((i: any) => ({
    nombre_producto: i.nombre_producto,
    unidad: i.unidad,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    subtotal: i.subtotal,
  }))

  const datos: DatosComprobante = {
    nombre_ferreteria:  ferreteria.nombre,
    direccion_ferreteria: ferreteria.direccion ?? null,
    telefono_ferreteria: ferreteria.telefono_whatsapp,
    logo_url:           ferreteria.logo_url ?? null,
    color:              ferreteria.color_comprobante ?? '#1e40af',
    mensaje_pie:        ferreteria.mensaje_comprobante ?? null,
    numero_comprobante: numeroComprobante,
    fecha_emision:      new Date().toISOString(),
    numero_pedido:      pedido.numero_pedido,
    nombre_cliente:     pedido.nombre_cliente,
    modalidad:          pedido.modalidad,
    direccion_entrega:  pedido.direccion_entrega ?? null,
    formas_pago:        (ferreteria.formas_pago as string[]) ?? [],
    items,
    total:              pedido.total,
  }

  // ── 6. Renderizar PDF ────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(
      React.createElement(ComprobantePDF, { datos }) as any
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Error renderizando PDF: ${msg}` }
  }

  // ── 7. Subir a Supabase Storage ──────────────────────────────────────────
  const storagePath = `${ferreteriaId}/${numeroComprobante}.pdf`

  const { error: errUpload } = await supabase.storage
    .from('comprobantes')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (errUpload) {
    return { ok: false, error: `Error subiendo PDF: ${errUpload.message}` }
  }

  const { data: { publicUrl } } = supabase.storage
    .from('comprobantes')
    .getPublicUrl(storagePath)

  // ── 8. Guardar registro en DB ────────────────────────────────────────────
  const { data: comprobante, error: errInsert } = await supabase
    .from('comprobantes')
    .insert({
      ferreteria_id:      ferreteriaId,
      pedido_id:          pedidoId,
      numero_comprobante: numeroComprobante,
      pdf_url:            publicUrl,
      enviado_whatsapp:   false,
    })
    .select('id')
    .single()

  if (errInsert || !comprobante) {
    return { ok: false, error: `Error guardando comprobante: ${errInsert?.message}` }
  }

  // ── 9. Enviar por WhatsApp (con un reintento) ────────────────────────────
  const telefonoCliente = (pedido as any).clientes?.telefono ?? pedido.telefono_cliente
  const from = ferreteria.telefono_whatsapp.replace(/^\+/, '')
  const filename = `${numeroComprobante}.pdf`
  const caption = `📄 *${ferreteria.nombre}*\nAdjunto su comprobante de pago N° ${numeroComprobante} por el pedido *${pedido.numero_pedido}*.\n\n¡Gracias por su preferencia! 🙏`

  let enviado = false
  let errorEnvio: string | null = null

  for (let intento = 0; intento < 2; intento++) {
    try {
      if (process.env.YCLOUD_API_KEY && process.env.YCLOUD_API_KEY !== 'your_ycloud_api_key') {
        await enviarDocumento({ from, to: telefonoCliente, pdfUrl: publicUrl, filename, caption })
        enviado = true
        break
      } else {
        // YCloud no configurado — registrar pero no fallar
        errorEnvio = 'YCLOUD_API_KEY no configurado'
        break
      }
    } catch (err) {
      errorEnvio = err instanceof Error ? err.message : String(err)
      if (intento === 0) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  }

  // ── 10. Actualizar estado de envío en DB ─────────────────────────────────
  await supabase
    .from('comprobantes')
    .update({
      enviado_whatsapp: enviado,
      enviado_at:       enviado ? new Date().toISOString() : null,
      error_envio:      errorEnvio,
    })
    .eq('id', comprobante.id)

  if (errorEnvio) {
    console.error(`[Comprobante] Error enviando ${numeroComprobante}:`, errorEnvio)
  }

  return {
    ok: true,
    numero_comprobante: numeroComprobante,
    pdf_url: publicUrl,
    comprobante_id: comprobante.id,
  }
}

// ── Reenvío de comprobante existente ─────────────────────────────────────────
export async function reenviarComprobante({
  pedidoId,
  ferreteriaId,
}: {
  pedidoId: string
  ferreteriaId: string
}): Promise<ResultadoComprobante> {
  const supabase = createAdminClient()

  // Obtener el comprobante existente
  const { data: comprobante, error } = await supabase
    .from('comprobantes')
    .select('*')
    .eq('pedido_id', pedidoId)
    .single()

  if (error || !comprobante) {
    return { ok: false, error: 'No existe un comprobante para este pedido' }
  }

  // Obtener datos de ferretería y pedido para el reenvío
  const [{ data: ferreteria }, { data: pedido }] = await Promise.all([
    supabase
      .from('ferreterias')
      .select('nombre, telefono_whatsapp')
      .eq('id', ferreteriaId)
      .single(),
    supabase
      .from('pedidos')
      .select('numero_pedido, telefono_cliente, clientes(telefono)')
      .eq('id', pedidoId)
      .single(),
  ])

  if (!ferreteria || !pedido) {
    return { ok: false, error: 'Error obteniendo datos para el reenvío' }
  }

  const telefonoCliente = (pedido as any).clientes?.telefono ?? pedido.telefono_cliente
  const from = ferreteria.telefono_whatsapp.replace(/^\+/, '')
  const filename = `${comprobante.numero_comprobante}.pdf`
  const caption = `📄 *${ferreteria.nombre}*\nAquí está su comprobante N° ${comprobante.numero_comprobante} del pedido *${pedido.numero_pedido}* (reenvío). 🙏`

  try {
    if (process.env.YCLOUD_API_KEY && process.env.YCLOUD_API_KEY !== 'your_ycloud_api_key') {
      await enviarDocumento({
        from,
        to: telefonoCliente,
        pdfUrl: comprobante.pdf_url,
        filename,
        caption,
      })
    }

    await supabase
      .from('comprobantes')
      .update({ enviado_whatsapp: true, enviado_at: new Date().toISOString(), error_envio: null })
      .eq('id', comprobante.id)

    return {
      ok: true,
      numero_comprobante: comprobante.numero_comprobante,
      pdf_url: comprobante.pdf_url,
      comprobante_id: comprobante.id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase
      .from('comprobantes')
      .update({ error_envio: msg })
      .eq('id', comprobante.id)
    return { ok: false, error: msg }
  }
}
