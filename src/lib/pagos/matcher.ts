// F5: Matcher y registrador de pagos
//
// Valida un comprobante extraído contra la config del dueño y los pedidos
// pendientes del cliente. Auto-confirma si todo cuadra o escala al dueño.
//
// FERRETERÍA AISLADA: todas las queries filtran por ferreteria_id.
// LIMITACIÓN: sin APIs de Yape/Plin/bancos, solo validamos lo que vemos
// en la captura vs lo que configuró el dueño. No verificamos que el pago
// realmente llegó — confiamos en la captura del cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosComprobante } from './extractor'

export interface ResultadoMatch {
  /** true = pago procesado (auto o manual). false = no se pudo procesar. */
  ok: boolean
  /** Estado final del pago registrado */
  estado: 'confirmado_auto' | 'pendiente_revision' | 'rechazado' | 'a_favor'
  /** Mensaje para enviar al cliente */
  mensajeCliente: string
  /** Texto interno para notificar al dueño (solo si pendiente_revision) */
  mensajeDueno?: string
  /** Razón de derivación/rechazo (para guardar en pagos_registrados.notas) */
  notas?: string
  /** ID del pago registrado */
  pagoId?: string
  /** Pedido que fue actualizado (si hubo match) */
  pedidoId?: string
  pedidoNumero?: string
}

interface MatchParams {
  supabase: SupabaseClient
  ferreteriaId: string
  clienteId: string | null
  datos: DatosComprobante
  urlCaptura?: string | null
}

/** Extrae los últimos N dígitos de un string numérico */
function ultimosDigitos(numero: string, n: number): string {
  return numero.replace(/\D/g, '').slice(-n)
}

/** Valida que el destinatario de la captura coincida con el config del dueño */
function validarDestinatario(
  datos: DatosComprobante,
  ferreteria: Record<string, unknown>
): { ok: boolean; razon?: string } {
  const datosYape = (ferreteria.datos_yape as { numero?: string } | null)
  const datosPlin = (ferreteria.datos_plin as { numero?: string } | null)
  const datosTransf = (ferreteria.datos_transferencia as { cuenta?: string } | null)

  if (datos.tipo === 'yape') {
    if (!datosYape?.numero) {
      // Dueño no configuró Yape — no podemos validar pero tampoco rechazamos
      return { ok: true }
    }
    // Yape no muestra el destinatario, pero sí los últimos 3 del pagador
    // Solo validamos que el método esté activo en el tenant
    const metodosActivos = (ferreteria.metodos_pago_activos as string[] | null) ?? []
    if (!metodosActivos.includes('yape')) {
      return { ok: false, razon: 'Yape no está habilitado como método de pago en esta ferretería.' }
    }
    return { ok: true }
  }

  if (datos.tipo === 'plin') {
    if (!datosPlin?.numero) {
      return { ok: true }  // Sin config Plin → no podemos validar
    }
    if (datos.ultimos_digitos_destinatario) {
      const duenoUlt = ultimosDigitos(datosPlin.numero, 3)
      const capturaUlt = ultimosDigitos(datos.ultimos_digitos_destinatario, 3)
      if (duenoUlt !== capturaUlt) {
        return { ok: false, razon: `El número Plin del destinatario (…${capturaUlt}) no coincide con el configurado (…${duenoUlt}).` }
      }
    }
    return { ok: true }
  }

  if (datos.tipo === 'transferencia') {
    if (!datosTransf?.cuenta) {
      return { ok: true }  // Sin config cuenta → no podemos validar
    }
    if (datos.ultimos_digitos_destinatario) {
      const duenoUlt = ultimosDigitos(datosTransf.cuenta, 4)
      const capturaUlt = ultimosDigitos(datos.ultimos_digitos_destinatario, 4)
      if (duenoUlt !== capturaUlt) {
        return { ok: false, razon: `La cuenta destino (…${capturaUlt}) no coincide con la configurada (…${duenoUlt}).` }
      }
    }
    return { ok: true }
  }

  return { ok: true }  // 'desconocido' → no rechazamos, escalamos
}

/**
 * Procesa un comprobante de pago extraído:
 * 1. Verifica que no sea duplicado
 * 2. Valida destinatario contra config del dueño
 * 3. Busca pedido pendiente del cliente que coincida con el monto
 * 4. Registra el pago y actualiza el pedido
 */
export async function procesarPago(params: MatchParams): Promise<ResultadoMatch> {
  const { supabase, ferreteriaId, clienteId, datos, urlCaptura } = params

  // ── 1. Dedup: verificar que este número de operación no fue registrado ya ──
  if (datos.numero_operacion) {
    const { data: dupPago } = await supabase
      .from('pagos_registrados')
      .select('id, estado')
      .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA
      .eq('numero_operacion', datos.numero_operacion)
      .maybeSingle()

    if (dupPago) {
      console.log(`[Pagos] Duplicado detectado — op=${datos.numero_operacion} id=${dupPago.id}`)
      return {
        ok: true,
        estado: 'rechazado',
        mensajeCliente: 'Este comprobante ya fue registrado anteriormente. Si crees que hay un error, comunícate con el encargado 🙏',
        notas: `Duplicado del pago ${dupPago.id}`,
      }
    }
  }

  // ── 2. Verificar que el monto es válido ───────────────────────────────────
  if (!datos.monto || datos.monto <= 0) {
    // No pudimos leer el monto → escalar
    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, datos, urlCaptura,
      estado: 'pendiente_revision',
      notas: 'No se pudo leer el monto del comprobante con claridad.',
    })
    return {
      ok: true,
      estado: 'pendiente_revision',
      mensajeCliente: 'Recibí tu comprobante pero no pude leer el monto con claridad. El encargado lo revisa y te confirma enseguida 🙏',
      mensajeDueno: `💳 *Comprobante por revisar*\nCliente: no se pudo leer el monto. Verificar manualmente.`,
      notas: 'Monto ilegible',
      pagoId,
    }
  }

  // ── 3. Cargar config del dueño para validar destinatario ─────────────────
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('datos_yape, datos_plin, datos_transferencia, metodos_pago_activos, telefono_dueno, nombre, tolerancia_dias_pago')
    .eq('id', ferreteriaId)   // FERRETERÍA AISLADA
    .single()

  if (!ferreteria) {
    return { ok: false, estado: 'pendiente_revision', mensajeCliente: 'Hubo un error procesando tu pago. El encargado te confirma en breve 🙏' }
  }

  // ── 4. Validar destinatario ───────────────────────────────────────────────
  const validacion = validarDestinatario(datos, ferreteria as Record<string, unknown>)
  if (!validacion.ok) {
    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, datos, urlCaptura,
      estado: 'pendiente_revision',
      notas: validacion.razon,
    })
    return {
      ok: true,
      estado: 'pendiente_revision',
      mensajeCliente: 'Recibí tu comprobante. El encargado lo verifica y te confirma en breve 🙏',
      mensajeDueno: `💳 *Comprobante por revisar*\n${validacion.razon}\nMonto: S/${datos.monto.toFixed(2)}\nOp: ${datos.numero_operacion ?? 'N/A'}`,
      notas: validacion.razon,
      pagoId,
    }
  }

  // ── 5. Buscar pedido pendiente del cliente que coincida con el monto ──────
  const toleranciaDias = (ferreteria as Record<string, unknown>).tolerancia_dias_pago as number ?? 30
  const fechaLimite = new Date(Date.now() - toleranciaDias * 24 * 60 * 60 * 1000).toISOString()

  let queryPedidos = supabase
    .from('pedidos')
    .select('id, numero_pedido, total, monto_pagado, estado, estado_pago')
    .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA
    .in('estado', ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado'])
    .neq('estado_pago', 'pagado')
    .gte('created_at', fechaLimite)
    .order('created_at', { ascending: false })
    .limit(10)

  if (clienteId) {
    queryPedidos = queryPedidos.eq('cliente_id', clienteId)
  }

  const { data: pedidosPendientes } = await queryPedidos

  if (!pedidosPendientes || pedidosPendientes.length === 0) {
    // Sin pedidos pendientes → crédito a favor
    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, datos, urlCaptura,
      estado: 'a_favor',
      notas: `Sin pedidos pendientes en los últimos ${toleranciaDias} días. Monto S/${datos.monto.toFixed(2)} guardado como crédito.`,
    })
    return {
      ok: true,
      estado: 'a_favor',
      mensajeCliente: `✅ Recibí tu comprobante de S/${datos.monto.toFixed(2)}. No veo un pedido pendiente a tu nombre, así que quedó registrado como *crédito a favor* para tu próxima compra 🙏`,
      pagoId,
    }
  }

  // ── 6. Matching por monto ─────────────────────────────────────────────────
  const TOLERANCIA_SOL = 0.10  // ±S/0.10 para evitar errores de redondeo

  // Pedidos donde el monto del pago cubre exactamente el saldo pendiente
  const pedidosExactos = pedidosPendientes.filter((p) => {
    const saldoPendiente = p.total - (p.monto_pagado ?? 0)
    return Math.abs(datos.monto! - saldoPendiente) <= TOLERANCIA_SOL
  })

  // Pedidos donde el monto es un pago parcial (pago < saldo pendiente)
  const pedidosParciales = pedidosPendientes.filter((p) => {
    const saldoPendiente = p.total - (p.monto_pagado ?? 0)
    return datos.monto! < saldoPendiente && datos.monto! > 0
  })

  // ── Caso A: un solo match exacto → auto-confirmar ─────────────────────────
  if (pedidosExactos.length === 1) {
    const pedido = pedidosExactos[0]
    const saldo = pedido.total - (pedido.monto_pagado ?? 0)

    // Marcar pedido como pagado
    await supabase
      .from('pedidos')
      .update({
        estado_pago:  'pagado',
        monto_pagado: pedido.total,
      })
      .eq('id', pedido.id)
      .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA

    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, pedidoId: pedido.id, datos, urlCaptura,
      estado: 'confirmado_auto',
      notas: `Auto-confirmado. Saldo cubierto: S/${saldo.toFixed(2)}.`,
    })

    return {
      ok: true,
      estado: 'confirmado_auto',
      mensajeCliente:
        `✅ ¡Pago confirmado! Recibí tu ${datos.tipo === 'yape' ? 'Yape' : datos.tipo === 'plin' ? 'Plin' : 'transferencia'} de *S/${datos.monto!.toFixed(2)}* para el pedido *${pedido.numero_pedido}* 🎉\n\n` +
        `Tu pedido queda registrado como *pagado*. ¡Gracias! 🙏`,
      pagoId,
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero_pedido,
    }
  }

  // ── Caso B: múltiples matches exactos → escalar (ambigüedad) ─────────────
  if (pedidosExactos.length > 1) {
    const lista = pedidosExactos.slice(0, 3).map((p) => `• *${p.numero_pedido}* (S/${p.total.toFixed(2)})`).join('\n')
    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, datos, urlCaptura,
      estado: 'pendiente_revision',
      notas: `Múltiples pedidos con monto S/${datos.monto!.toFixed(2)}: ${pedidosExactos.map(p => p.numero_pedido).join(', ')}`,
    })
    return {
      ok: true,
      estado: 'pendiente_revision',
      mensajeCliente:
        `Recibí tu pago de S/${datos.monto!.toFixed(2)}. Tienes varios pedidos por esa cantidad:\n\n${lista}\n\n¿A cuál pedido corresponde el pago? Respóndeme con el número.`,
      pagoId,
    }
  }

  // ── Caso C: pago parcial (anticipo) con un solo pedido posible ────────────
  if (pedidosParciales.length === 1) {
    const pedido = pedidosParciales[0]
    const nuevoMontoPagado = (pedido.monto_pagado ?? 0) + datos.monto!
    const saldoRestante = pedido.total - nuevoMontoPagado

    await supabase
      .from('pedidos')
      .update({
        monto_pagado: nuevoMontoPagado,
        estado_pago: saldoRestante <= 0 ? 'pagado' : 'parcial',
      })
      .eq('id', pedido.id)
      .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA

    const pagoId = await registrarPago(supabase, {
      ferreteriaId, clienteId, pedidoId: pedido.id, datos, urlCaptura,
      estado: 'confirmado_auto',
      notas: `Pago parcial. Nuevo monto pagado: S/${nuevoMontoPagado.toFixed(2)} / S/${pedido.total.toFixed(2)}.`,
    })

    return {
      ok: true,
      estado: 'confirmado_auto',
      mensajeCliente:
        `✅ Recibí tu pago parcial de *S/${datos.monto!.toFixed(2)}* para el pedido *${pedido.numero_pedido}*.\n\n` +
        `Pagado: S/${nuevoMontoPagado.toFixed(2)} / S/${pedido.total.toFixed(2)}\n` +
        `Saldo pendiente: *S/${saldoRestante.toFixed(2)}* (puede pagarse contra entrega) 🙏`,
      pagoId,
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero_pedido,
    }
  }

  // ── Caso D: monto no coincide con ningún pedido → escalar ─────────────────
  const listaPedidos = pedidosPendientes
    .slice(0, 3)
    .map((p) => `• ${p.numero_pedido}: S/${p.total.toFixed(2)}`)
    .join('\n')

  const pagoId = await registrarPago(supabase, {
    ferreteriaId, clienteId, datos, urlCaptura,
    estado: 'pendiente_revision',
    notas: `Monto S/${datos.monto!.toFixed(2)} no coincide con ningún pedido pendiente.`,
  })

  return {
    ok: true,
    estado: 'pendiente_revision',
    mensajeCliente:
      `Recibí tu comprobante de *S/${datos.monto!.toFixed(2)}*, pero no coincide exactamente con tus pedidos pendientes:\n\n${listaPedidos}\n\nEl encargado lo revisa y te confirma en breve 🙏`,
    mensajeDueno: `💳 *Comprobante por revisar*\nMonto S/${datos.monto!.toFixed(2)} no coincide con ningún pedido. Op: ${datos.numero_operacion ?? 'N/A'}`,
    notas: `Monto no coincide. Pedidos pendientes: ${listaPedidos}`,
    pagoId,
  }
}

// ── Helper interno ────────────────────────────────────────────────────────────

interface RegistrarPagoParams {
  ferreteriaId: string
  clienteId: string | null
  pedidoId?: string
  datos: DatosComprobante
  urlCaptura?: string | null
  estado: 'confirmado_auto' | 'pendiente_revision' | 'rechazado' | 'a_favor'
  notas?: string
}

async function registrarPago(supabase: SupabaseClient, p: RegistrarPagoParams): Promise<string | undefined> {
  try {
    // Parsear fecha visible del comprobante si la hay
    let fechaPago: string | null = null
    if (p.datos.fecha_visible) {
      try {
        fechaPago = new Date(p.datos.fecha_visible).toISOString()
      } catch {
        fechaPago = null  // no parseamos fechas en español — guardamos null y usamos la visible en JSONB
      }
    }

    const row: Record<string, unknown> = {
      ferreteria_id:        p.ferreteriaId,
      cliente_id:           p.clienteId ?? null,
      pedido_id:            p.pedidoId ?? null,
      metodo:               p.datos.tipo === 'desconocido' ? 'otro' : p.datos.tipo,
      monto:                p.datos.monto ?? 0,
      moneda:               p.datos.moneda ?? 'PEN',
      numero_operacion:     p.datos.numero_operacion ?? null,
      nombre_pagador:       p.datos.nombre_pagador ?? null,
      ultimos_digitos:      p.datos.ultimos_digitos_destinatario ?? p.datos.ultimos_digitos_pagador ?? null,
      codigo_seguridad:     p.datos.codigo_seguridad ?? null,
      fecha_pago:           fechaPago,
      banco_origen:         p.datos.banco_origen ?? null,
      estado:               p.estado,
      url_captura:          p.urlCaptura ?? null,
      datos_extraidos:      p.datos,
      confianza_extraccion: p.datos.confianza_global,
      notas:                p.notas ?? null,
    }

    // Si numero_operacion es null, quitarlo del insert para no violar UNIQUE (null != null en PG)
    if (!row.numero_operacion) delete row.numero_operacion

    const { data, error } = await supabase
      .from('pagos_registrados')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      console.error('[Pagos] Error registrando pago:', error.message)
      return undefined
    }
    return data?.id
  } catch (e) {
    console.error('[Pagos] Error inesperado registrando:', e)
    return undefined
  }
}
