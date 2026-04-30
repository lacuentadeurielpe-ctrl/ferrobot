// PATCH /api/delivery/[token]/pedido/[pedidoId]
// Acciones que puede ejecutar el repartidor sobre un pedido:
//   entregado      — confirma entrega con cobro, actualiza estado_pago
//   cambiar_estado — solo permite: confirmado/en_preparacion → enviado
//   incidencia     — registra un problema sin cambiar estado
//   retorno        — devuelve el pedido a tienda
//   emergencia     — solo notifica al dueño por WhatsApp
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { getYCloudApiKey } from '@/lib/tenant'
import { recalcularETAsCola } from '@/lib/delivery/assignment'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; pedidoId: string }> }
) {
  const { token, pedidoId } = await params
  const supabase = adminClient()

  // Autenticar repartidor por token — TENANT AISLADO
  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, puede_registrar_deuda, ferreterias(nombre, telefono_whatsapp, telefono_dueno)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await request.json()
  const { accion, cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc, mensaje_emergencia, nuevo_estado } = body

  const ACCIONES_VALIDAS = ['entregado', 'cambiar_estado', 'incidencia', 'retorno', 'emergencia']
  if (!ACCIONES_VALIDAS.includes(accion)) {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  // Cargar pedido — filtrado por ferreteria_id (TENANT AISLADO)
  const { data: pedidoActual } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, estado, estado_pago, total, monto_pagado, cliente_id, telefono_cliente, eta_minutos, clientes(telefono)')
    .eq('id', pedidoId)
    .eq('ferreteria_id', repartidor.ferreteria_id)   // TENANT AISLADO
    .single()

  if (!pedidoActual) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const ferr = repartidor.ferreterias as any

  // ── Emergencia: solo notifica, no toca el pedido ──────────────────────────
  if (accion === 'emergencia') {
    if (ferr?.telefono_whatsapp && ferr?.telefono_dueno) {
      const msg = `🚨 *EMERGENCIA — ${ferr.nombre}*\n\nRepartidor: *${repartidor.nombre}*\nPedido: *${pedidoActual.numero_pedido}*\n\n${mensaje_emergencia ?? 'Sin detalles adicionales.'}`
      getYCloudApiKey(repartidor.ferreteria_id).then((apiKey) => {
        if (apiKey) {
          enviarMensaje({ from: ferr.telefono_whatsapp.replace(/^\+/, ''), to: ferr.telefono_dueno, texto: msg, apiKey })
            .catch((e) => console.error('[Delivery] Error enviando emergencia:', e))
        }
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true, mensaje: 'Emergencia reportada al dueño' })
  }

  const update: Record<string, unknown> = {}

  // ── Cambiar estado (en ruta / en preparación) ─────────────────────────────
  if (accion === 'cambiar_estado') {
    const ESTADOS_PERMITIDOS = ['enviado'] // el repartidor solo puede marcar "en camino"
    if (!ESTADOS_PERMITIDOS.includes(nuevo_estado)) {
      return NextResponse.json({ error: 'Estado no permitido para repartidor' }, { status: 400 })
    }
    update.estado = nuevo_estado
  }

  // ── Entregado: confirmar entrega + registrar cobro + actualizar estado_pago ──
  if (accion === 'entregado') {
    update.estado = 'entregado'
    update.cobrado_monto = cobrado_monto ?? null
    update.cobrado_metodo = cobrado_metodo ?? null

    const montoCobrado      = typeof cobrado_monto === 'number' ? cobrado_monto : parseFloat(cobrado_monto ?? '0') || 0
    const totalPedido       = pedidoActual.total ?? 0
    // Considerar lo que ya pagó el cliente por WhatsApp/Yape antes de la entrega
    const montoPagadoPrevio = pedidoActual.monto_pagado ?? 0
    const saldoPendiente    = Math.max(0, totalPedido - montoPagadoPrevio)

    // Si ya estaba pagado (vía WhatsApp/Yape previo) → no tocar estado_pago
    if (pedidoActual.estado_pago !== 'pagado') {
      if (saldoPendiente === 0 || montoCobrado >= saldoPendiente) {
        // Cubre el saldo pendiente completo → pagado
        update.estado_pago         = 'pagado'
        update.monto_pagado        = totalPedido   // marca como totalmente cubierto
        update.pago_confirmado_at  = new Date().toISOString()
        update.pago_confirmado_por = `repartidor:${repartidor.nombre}`
        update.metodo_pago         = cobrado_metodo ?? null
      } else if (montoCobrado > 0 && montoCobrado < saldoPendiente) {
        // Pago parcial del saldo restante — requiere permiso
        if (!repartidor.puede_registrar_deuda) {
          return NextResponse.json({
            error: 'No tienes permiso para registrar cobros parciales. Consulta con el encargado.',
            code: 'sin_permiso_deuda',
          }, { status: 403 })
        }
        update.estado_pago  = 'credito_activo'
        update.monto_pagado = montoPagadoPrevio + montoCobrado   // acumular pagos
      }
      // montoCobrado === 0 → deja estado_pago como está (pendiente)
    }
  }

  // ── Incidencia ────────────────────────────────────────────────────────────
  if (accion === 'incidencia') {
    update.incidencia_tipo = incidencia_tipo ?? 'otro'
    update.incidencia_desc = incidencia_desc ?? null
  }

  // ── Retorno: vuelve a tienda, se desasigna ────────────────────────────────
  if (accion === 'retorno') {
    update.estado       = 'en_preparacion'
    update.repartidor_id = null
    update.incidencia_tipo = incidencia_tipo ?? 'otro'
    update.incidencia_desc = incidencia_desc ?? 'Pedido retornado a tienda'
  }

  // Guardar cambios en pedido — TENANT AISLADO (doble filtro)
  const { data, error } = await supabase
    .from('pedidos')
    .update(update)
    .eq('id', pedidoId)
    .eq('ferreteria_id', repartidor.ferreteria_id)   // TENANT AISLADO
    .select('id, estado, estado_pago, numero_pedido')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Sincronizar estado de la entrega ─────────────────────────────────────────
  let entregaIdParaTracking: string | null = null

  if (accion === 'cambiar_estado' && nuevo_estado === 'enviado') {
    // Pedido salió → entrega en_ruta + timestamp; recuperar id para link de tracking
    const { data: entSync, error: e } = await supabase
      .from('entregas')
      .update({ estado: 'en_ruta', salio_at: new Date().toISOString() })
      .eq('pedido_id', pedidoId)
      .eq('ferreteria_id', repartidor.ferreteria_id)   // TENANT AISLADO
      .select('id')
      .single()
    if (e) console.error('[Delivery] Error sync entrega en_ruta:', e.message)
    else entregaIdParaTracking = entSync?.id ?? null
  }

  if (accion === 'entregado') {
    // Calcular duración real (desde salio_at)
    supabase
      .from('entregas')
      .select('salio_at')
      .eq('pedido_id', pedidoId)
      .eq('ferreteria_id', repartidor.ferreteria_id)
      .maybeSingle()
      .then(({ data: ent }) => {
        const duracionReal = ent?.salio_at
          ? Math.round((Date.now() - new Date(ent.salio_at).getTime()) / 60_000)
          : null
        supabase
          .from('entregas')
          .update({
            estado:            'entregado',
            llego_at:          new Date().toISOString(),
            ...(duracionReal != null && { duracion_real_min: duracionReal }),
          })
          .eq('pedido_id', pedidoId)
          .eq('ferreteria_id', repartidor.ferreteria_id)
          .then(({ error: e }) => { if (e) console.error('[Delivery] Error sync entrega entregado:', e.message) })
      })
  }

  if (accion === 'retorno') {
    supabase
      .from('entregas')
      .update({ estado: 'fallida' })
      .eq('pedido_id', pedidoId)
      .eq('ferreteria_id', repartidor.ferreteria_id)
      .then(({ error: e }) => { if (e) console.error('[Delivery] Error sync entrega retorno:', e.message) })
  }

  // ── Recalcular ETAs de la cola cuando la cola se reduce ───────────────────
  // entregado y retorno liberan una posición → los demás pedidos ganan tiempo.
  if (accion === 'entregado' || accion === 'retorno') {
    recalcularETAsCola(repartidor.ferreteria_id, supabase)
      .catch((e) => console.error('[Delivery] recalcularETAsCola error:', e))
  }

  // ── Si fue pago parcial → crear registro de crédito/deuda ─────────────────
  if (accion === 'entregado' && update.estado_pago === 'credito_activo') {
    const montoCobrado      = typeof cobrado_monto === 'number' ? cobrado_monto : parseFloat(cobrado_monto ?? '0') || 0
    const totalPedido       = pedidoActual.total ?? 0
    const montoPagadoPrevio = pedidoActual.monto_pagado ?? 0
    const saldoPendiente    = Math.max(0, totalPedido - montoPagadoPrevio)
    const deuda             = saldoPendiente - montoCobrado   // lo que quedó sin cubrir

    if (deuda > 0) {
      const fechaLimite = new Date()
      fechaLimite.setDate(fechaLimite.getDate() + 30)

      const notasDeuda = montoPagadoPrevio > 0
        ? `Deuda por entrega parcial. Total: S/${totalPedido.toFixed(2)} — Pagado prev. (digital): S/${montoPagadoPrevio.toFixed(2)} — Cobrado por repartidor: S/${montoCobrado.toFixed(2)} — Saldo: S/${deuda.toFixed(2)}. Repartidor: ${repartidor.nombre}`
        : `Deuda por entrega parcial. Cobrado: S/${montoCobrado.toFixed(2)} de S/${totalPedido.toFixed(2)}. Repartidor: ${repartidor.nombre}`

      supabase.from('creditos').insert({
        ferreteria_id: repartidor.ferreteria_id,          // TENANT AISLADO
        cliente_id:    (pedidoActual as any).cliente_id ?? null,   // vincular cliente real
        pedido_id:     pedidoId,
        monto_total:   deuda,
        monto_pagado:  0,
        fecha_limite:  fechaLimite.toISOString().slice(0, 10),
        estado:        'activo',
        notas:         notasDeuda,
        aprobado_por:  `repartidor:${repartidor.nombre}`,
      }).then(({ error: errCred }) => {
        if (errCred) console.error('[Delivery] Error creando crédito:', errCred.message)
      })
    }
  }

  // ── Notificaciones WhatsApp (fire-and-forget) ─────────────────────────────
  if (ferr?.telefono_whatsapp) {
    getYCloudApiKey(repartidor.ferreteria_id).then((apiKey) => {
      if (!apiKey) return
      const from = ferr.telefono_whatsapp.replace(/^\+/, '')

      // ── Notificación "en camino" al cliente — con link de tracking ────────
      if (accion === 'cambiar_estado' && nuevo_estado === 'enviado') {
        const telefono = (pedidoActual.clientes as any)?.telefono ?? pedidoActual.telefono_cliente
        if (telefono) {
          const etaMin = (pedidoActual as any).eta_minutos as number | null
          const etaTexto = etaMin
            ? (etaMin < 60
                ? `~${etaMin} min`
                : `~${Math.floor(etaMin / 60)}h${etaMin % 60 > 0 ? ` ${etaMin % 60}min` : ''}`)
            : 'en breve'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
          const trackingLink = entregaIdParaTracking
            ? `\n📍 Sigue tu entrega en vivo: ${appUrl}/tracking/${entregaIdParaTracking}`
            : ''
          enviarMensaje({
            from, to: telefono,
            texto: `🚚 *${ferr.nombre}*\n\nTu pedido *${pedidoActual.numero_pedido}* ya está *en camino*.\n⏱ ETA: *${etaTexto}* 🎯${trackingLink}\n\n¡Prepárate para recibirlo!`,
            apiKey,
          }).catch((e) => console.error('[Delivery] Error notif en camino:', e))
        }
      }

      if (accion === 'entregado') {
        const telefono = (pedidoActual.clientes as any)?.telefono ?? pedidoActual.telefono_cliente
        if (telefono) {
          const pagoInfo = update.estado_pago === 'pagado'
            ? `\nPago: ✅ Confirmado`
            : update.estado_pago === 'credito_activo'
            ? `\nPago: ⏳ Pendiente (cobro parcial registrado)`
            : ''
          enviarMensaje({
            from, to: telefono,
            texto: `🎉 *${ferr.nombre}*\n\nSu pedido *${pedidoActual.numero_pedido}* ha sido *entregado*. ¡Esperamos que todo sea de su agrado! 🙏${pagoInfo}`,
            apiKey,
          }).catch((e) => console.error('[Delivery] Error notificando entrega:', e))
        }
      }

      if ((accion === 'incidencia' || accion === 'retorno') && ferr?.telefono_dueno) {
        const labelInc: Record<string, string> = {
          cliente_ausente:   'Cliente no estaba',
          pedido_incorrecto: 'Pedido incorrecto',
          pago_rechazado:    'No pudo pagar',
          otro:              'Otro problema',
        }
        const tipoLabel = labelInc[incidencia_tipo ?? 'otro'] ?? incidencia_tipo ?? 'Problema'
        const emoji  = accion === 'retorno' ? '🔄' : '⚠️'
        const titulo = accion === 'retorno' ? 'RETORNO' : 'INCIDENCIA'
        enviarMensaje({
          from, to: ferr.telefono_dueno,
          texto: `${emoji} *${titulo} — ${ferr.nombre}*\n\nRepartidor: *${repartidor.nombre}*\nPedido: *${pedidoActual.numero_pedido}*\nProblema: ${tipoLabel}${incidencia_desc ? `\nDetalle: ${incidencia_desc}` : ''}`,
          apiKey,
        }).catch((e) => console.error('[Delivery] Error notificando incidencia al dueño:', e))
      }
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
