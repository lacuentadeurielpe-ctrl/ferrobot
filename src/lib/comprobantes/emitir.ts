// Lógica de negocio para emitir boletas electrónicas vía Nubefact.
//
// FERRETERÍA AISLADA:
//   - Toda query a Supabase filtra por ferreteria_id
//   - El token Nubefact se obtiene de la propia ferretería (nunca env global)
//   - El correlativo usa pg_advisory_xact_lock para evitar duplicados concurrentes

import { createAdminClient } from '@/lib/supabase/admin'
import { desencriptar }      from '@/lib/encryption'
import { enviarANubefact }   from '@/lib/nubefact'
import {
  NUBEFACT_TIPO,
  NUBEFACT_TIPO_DOC_CLIENTE,
  NUBEFACT_TIPO_IGV,
  type NubefactItem,
  type NubefactPayload,
} from '@/lib/nubefact/tipos'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface OpcionesEmision {
  pedidoId:       string
  ferreteriaId:   string   // FERRETERÍA AISLADA — siempre requerido
  tipoBoleta:     'boleta' // F3 solo boletas; facturas en F4
  clienteNombre:  string
  clienteDni:     string   // puede ser '' → emite sin documento
  emitidoPor:     'dashboard' | 'bot'
}

export interface ResultadoEmision {
  ok:             boolean
  comprobanteId?: string
  numeroCompleto?: string  // ej: 'B001-000001'
  pdfUrl?:        string
  xmlUrl?:        string
  error?:         string
  tokenInvalido?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fechaPeruana(): string {
  // DD-MM-YYYY en zona Lima (UTC-5)
  const fecha = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const dd = String(fecha.getDate()).padStart(2, '0')
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const yyyy = fecha.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function emitirBoleta(opts: OpcionesEmision): Promise<ResultadoEmision> {
  const supabase = createAdminClient()

  // ── 1. Cargar ferretería — FERRETERÍA AISLADA ────────────────────────────
  const { data: ferreteria, error: errFerr } = await supabase
    .from('ferreterias')
    .select(`
      id, ruc, razon_social, nombre_comercial,
      serie_boletas, igv_incluido_en_precios,
      nubefact_token_enc, nubefact_modo
    `)
    .eq('id', opts.ferreteriaId)
    .single()

  if (errFerr || !ferreteria) {
    return { ok: false, error: 'Ferretería no encontrada' }
  }

  if (!ferreteria.nubefact_token_enc) {
    return { ok: false, error: 'Nubefact no configurado. Ve a Settings → Facturación para conectar tu cuenta.' }
  }

  if (!ferreteria.ruc || ferreteria.ruc.length !== 11) {
    return { ok: false, error: 'El RUC de la ferretería no está configurado. Completa Settings → Facturación.' }
  }

  // ── 2. Cargar pedido con items — FERRETERÍA AISLADA ──────────────────────
  const { data: pedido, error: errPedido } = await supabase
    .from('pedidos')
    .select('id, total, nombre_cliente, items_pedido(*)')
    .eq('id', opts.pedidoId)
    .eq('ferreteria_id', opts.ferreteriaId)   // AISLADO
    .single()

  if (errPedido || !pedido) {
    return { ok: false, error: 'Pedido no encontrado o no pertenece a esta ferretería' }
  }

  const items = (pedido.items_pedido ?? []) as {
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    unidad: string
    producto_id: string | null
  }[]

  if (items.length === 0) {
    return { ok: false, error: 'El pedido no tiene items' }
  }

  // ── 3. Verificar que no existe boleta emitida para este pedido ───────────
  const { data: yaEmitida } = await supabase
    .from('comprobantes')
    .select('id, numero_completo, estado')
    .eq('pedido_id', opts.pedidoId)
    .eq('ferreteria_id', opts.ferreteriaId)   // AISLADO
    .eq('tipo', 'boleta')
    .not('estado', 'eq', 'anulado')
    .maybeSingle()

  if (yaEmitida) {
    return {
      ok:             false,
      error:          `Ya existe la boleta ${yaEmitida.numero_completo} para este pedido (estado: ${yaEmitida.estado})`,
      comprobanteId:  yaEmitida.id,
    }
  }

  // ── 4. Desencriptar token Nubefact ───────────────────────────────────────
  let tokenPlano: string
  try {
    tokenPlano = await desencriptar(ferreteria.nubefact_token_enc)
  } catch {
    return { ok: false, error: 'Error al descifrar el token Nubefact. Reconfigura en Settings.' }
  }

  // ── 5. Generar correlativo atómico (función SQL de F1) ───────────────────
  const serie = ferreteria.serie_boletas ?? 'B001'
  const { data: corrData, error: errCorr } = await supabase
    .rpc('generar_numero_comprobante', {
      p_ferreteria_id: opts.ferreteriaId,
      p_tipo:          'boleta',
      p_serie:         serie,
    })

  if (errCorr || corrData == null) {
    return { ok: false, error: `Error generando correlativo: ${errCorr?.message ?? 'sin datos'}` }
  }

  const numero = corrData as number
  const numeroCompleto = `B-${serie}-${String(numero).padStart(6, '0')}`

  // ── 6. Calcular montos IGV ───────────────────────────────────────────────
  const igvIncluido = ferreteria.igv_incluido_en_precios ?? false
  const IGV_RATE    = 0.18

  const nubefactItems: NubefactItem[] = items.map((item, i) => {
    const precioConIgv = igvIncluido
      ? item.precio_unitario
      : item.precio_unitario * (1 + IGV_RATE)

    const valorUnitario = igvIncluido
      ? redondear2(item.precio_unitario / (1 + IGV_RATE))
      : item.precio_unitario

    const subtotalSinIgv = redondear2(valorUnitario * item.cantidad)
    const igvItem        = redondear2(subtotalSinIgv * IGV_RATE)
    const totalItem      = redondear2(precioConIgv * item.cantidad)

    return {
      unidad_de_medida:  item.unidad === 'unid' ? 'NIU' : (item.unidad?.toUpperCase().slice(0, 3) || 'NIU'),
      codigo:            item.producto_id ?? `ITEM${i + 1}`,
      descripcion:       item.nombre_producto,
      cantidad:          item.cantidad,
      valor_unitario:    valorUnitario,
      precio_unitario:   redondear2(precioConIgv),
      descuento:         '',
      subtotal:          subtotalSinIgv,
      tipo_de_igv:       NUBEFACT_TIPO_IGV.GRAVADO_OP_ONEROSA,
      igv:               igvItem,
      total:             totalItem,
      anticipo_regularizacion:  false,
      anticipo_documento_serie:  '',
      anticipo_documento_numero: '',
    }
  })

  const totalGravada = redondear2(nubefactItems.reduce((s, i) => s + i.subtotal, 0))
  const totalIgv     = redondear2(nubefactItems.reduce((s, i) => s + i.igv, 0))
  const totalFinal   = redondear2(nubefactItems.reduce((s, i) => s + i.total, 0))

  // ── 7. Determinar tipo documento cliente ────────────────────────────────
  const dniLimpio = opts.clienteDni.replace(/\D/g, '')
  const tipoDocCliente = dniLimpio.length === 8
    ? NUBEFACT_TIPO_DOC_CLIENTE.DNI
    : dniLimpio.length === 11
    ? NUBEFACT_TIPO_DOC_CLIENTE.RUC
    : NUBEFACT_TIPO_DOC_CLIENTE.SIN_DOC

  // ── 8. Armar payload Nubefact ───────────────────────────────────────────
  const payload: NubefactPayload = {
    operacion:                   'generar_comprobante',
    tipo_de_comprobante:         NUBEFACT_TIPO.BOLETA,
    serie,
    numero,
    sunat_transaction:           1,
    cliente_tipo_de_documento:   tipoDocCliente,
    cliente_numero_de_documento: dniLimpio || '00000000',
    cliente_denominacion:        opts.clienteNombre || 'CLIENTE VARIOS',
    cliente_direccion:           '',
    cliente_email:               '',
    cliente_email_1:             '',
    cliente_email_2:             '',
    fecha_de_emision:            fechaPeruana(),
    fecha_de_vencimiento:        '',
    moneda:                      1,
    tipo_de_cambio:              '',
    porcentaje_de_igv:           18,
    descuento_global:            '',
    total_descuento:             '',
    total_anticipo:              '',
    total_gravada:               totalGravada,
    total_inafecta:              '',
    total_exonerada:             '',
    total_igv:                   totalIgv,
    total_gratuita:              '',
    total_otros_cargos:          '',
    total:                       totalFinal,
    percepcion_tipo:             '',
    percepcion_base_imponible:   '',
    total_percepcion:            '',
    total_incluido_percepcion:   '',
    detraccion:                  false,
    observaciones:               '',
    documento_que_se_modifica_tipo:   '',
    documento_que_se_modifica_serie:  '',
    documento_que_se_modifica_numero: '',
    tipo_de_nota_de_credito:     '',
    tipo_de_nota_de_debito:      '',
    enviar_automaticamente_a_la_sunat:  true,
    enviar_automaticamente_al_cliente:  false,
    codigo_unico:                `${opts.ferreteriaId}-${opts.pedidoId}-boleta`,
    condiciones_de_pago:         '',
    medio_de_pago:               '',
    placa_vehiculo:              '',
    orden_compra_servicio:       '',
    tabla_personalizada_codigo:  '',
    formato_de_pdf:              '',
    items:                       nubefactItems,
  }

  // ── 9. Enviar a Nubefact ─────────────────────────────────────────────────
  const resultado = await enviarANubefact(ferreteria.ruc, tokenPlano, payload)

  // ── 10. Guardar en BD independientemente del resultado ──────────────────
  //    Si Nubefact falla, guardamos con estado 'error' para reintentar luego
  const estadoComprobante = resultado.ok ? 'emitido' : 'error'

  const { data: comprobante, error: errInsert } = await supabase
    .from('comprobantes')
    .insert({
      ferreteria_id:    opts.ferreteriaId,          // AISLADO
      pedido_id:        opts.pedidoId,
      tipo:             'boleta',
      serie,
      numero,
      numero_completo:  numeroCompleto,
      estado:           estadoComprobante,
      subtotal:         totalGravada,
      igv:              totalIgv,
      total:            totalFinal,
      cliente_nombre:   opts.clienteNombre,
      cliente_ruc_dni:  dniLimpio || null,
      nubefact_id:      resultado.data?.nubefact_id   ?? null,
      nubefact_hash:    resultado.data?.hash_cpe       ?? null,
      xml_url:          resultado.data?.enlace_del_xml ?? null,
      pdf_url:          resultado.data?.enlace_del_pdf ?? null,
      emitido_por:      opts.emitidoPor,
      error_envio:      resultado.ok ? null : (resultado.error ?? 'Error desconocido'),
    })
    .select('id')
    .single()

  if (errInsert || !comprobante) {
    // El comprobante pudo haberse emitido en SUNAT pero no guardado — situación crítica
    console.error('[emitirBoleta] Error guardando comprobante en BD:', errInsert)
    if (resultado.ok) {
      return {
        ok:             true,
        numeroCompleto,
        pdfUrl:         resultado.data!.enlace_del_pdf,
        xmlUrl:         resultado.data!.enlace_del_xml,
        error:          '⚠ Boleta emitida en SUNAT pero hubo un error al guardarla. Anota el número: ' + numeroCompleto,
      }
    }
  }

  if (!resultado.ok) {
    return {
      ok:             false,
      comprobanteId:  comprobante?.id,
      error:          resultado.error,
      tokenInvalido:  resultado.tokenInvalido,
    }
  }

  return {
    ok:             true,
    comprobanteId:  comprobante?.id,
    numeroCompleto,
    pdfUrl:         resultado.data!.enlace_del_pdf,
    xmlUrl:         resultado.data!.enlace_del_xml,
  }
}
