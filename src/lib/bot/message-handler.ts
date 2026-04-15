// Orquestador principal del bot
// Coordina: sesión → horario → AI → acciones → respuesta

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ferreteria, Producto, ZonaDelivery, ConfiguracionBot, DatosFlujoPedido } from '@/types/database'
import { llamarDeepSeek } from '@/lib/ai/deepseek'
import { buildSystemPrompt, buildHistorialMensajes } from '@/lib/ai/prompt'
import { procesarItemsSolicitados, formatearCotizacion } from '@/lib/bot/catalog-search'
import {
  getOrCreateSession,
  guardarMensaje,
  getHistorial,
  verificarRetomarBot,
  pausarBot,
  mensajeYaProcesado,
} from '@/lib/bot/session'
import { formatHora } from '@/lib/utils'
import { generarYEnviarComprobante } from '@/lib/pdf/generar-comprobante'
import { createAdminClient } from '@/lib/supabase/admin'

interface HandleMessageParams {
  supabase: SupabaseClient
  ferreteria: Ferreteria
  telefonoCliente: string
  textoMensaje: string
  ycloudMessageId?: string
}

interface HandleMessageResult {
  respuesta: string | null
  conversacionId: string
}

function estaEnHorario(ferreteria: Ferreteria): boolean {
  if (!ferreteria.horario_apertura || !ferreteria.horario_cierre) return true

  const ahoraLima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const diaSemana = ahoraLima
    .toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'America/Lima' })
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const diasNorm = (ferreteria.dias_atencion ?? []).map((d) =>
    d.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )
  if (!diasNorm.includes(diaSemana)) return false

  const [hAp, mAp] = ferreteria.horario_apertura.split(':').map(Number)
  const [hCi, mCi] = ferreteria.horario_cierre.split(':').map(Number)
  const minAhora = ahoraLima.getHours() * 60 + ahoraLima.getMinutes()
  return minAhora >= hAp * 60 + mAp && minAhora < hCi * 60 + mCi
}

export async function handleIncomingMessage({
  supabase,
  ferreteria,
  telefonoCliente,
  textoMensaje,
  ycloudMessageId,
}: HandleMessageParams): Promise<HandleMessageResult> {

  console.log(`[Bot] handleIncomingMessage INICIO — cliente=${telefonoCliente} texto="${textoMensaje.slice(0, 40)}"`)

  // ── 1. Deduplicación ──────────────────────────────────────────────────────
  if (ycloudMessageId && await mensajeYaProcesado(supabase, ycloudMessageId)) {
    console.log(`[Bot] DUPLICADO — ycloudMessageId=${ycloudMessageId} ya procesado`)
    return { respuesta: null, conversacionId: '' }
  }

  // ── 2. Config del bot ─────────────────────────────────────────────────────
  const { data: config } = await supabase
    .from('configuracion_bot').select('*').eq('ferreteria_id', ferreteria.id).single()

  const timeoutSesion = config?.timeout_sesion_minutos ?? 60
  const maxContexto = config?.max_mensajes_contexto ?? 10
  const timeoutIntervacion = (ferreteria as any).timeout_intervencion_dueno ?? config?.timeout_intervencion_dueno ?? 30

  // ── 3. Sesión ─────────────────────────────────────────────────────────────
  const { conversacion } = await getOrCreateSession(
    supabase, ferreteria.id, telefonoCliente, timeoutSesion
  )

  await guardarMensaje(supabase, conversacion.id, 'cliente', textoMensaje, ycloudMessageId)

  // ── 4. ¿Bot pausado? ──────────────────────────────────────────────────────
  if (conversacion.bot_pausado) {
    const retomado = await verificarRetomarBot(supabase, conversacion, timeoutIntervacion)
    if (!retomado) {
      console.log(`[Bot] PAUSADO — no retomado para conversacion=${conversacion.id}`)
      return { respuesta: null, conversacionId: conversacion.id }
    }
  }

  // ── 5. Horario de atención ────────────────────────────────────────────────
  console.log(`[Bot] Verificando horario — apertura=${ferreteria.horario_apertura} cierre=${ferreteria.horario_cierre} dias=${JSON.stringify(ferreteria.dias_atencion)}`)
  if (!estaEnHorario(ferreteria)) {
    const msg = ferreteria.mensaje_fuera_horario ??
      `Hola, gracias por escribir a *${ferreteria.nombre}*. ` +
      `Por el momento estamos cerrados 🙏\n\n` +
      `Atendemos de ${formatHora(ferreteria.horario_apertura)} a ${formatHora(ferreteria.horario_cierre)}, ` +
      `${ferreteria.dias_atencion?.join(', ') ?? 'lunes a viernes'}.\n\n` +
      `En cuanto abramos te respondemos. ¡Hasta luego!`
    await guardarMensaje(supabase, conversacion.id, 'bot', msg)
    return { respuesta: msg, conversacionId: conversacion.id }
  }

  // ── 6. Cargar catálogo, zonas y flujo activo ──────────────────────────────
  const [{ data: productos }, { data: zonas }, { data: convActual }] = await Promise.all([
    supabase.from('productos')
      .select('*, categorias(id,nombre), reglas_descuento(*)')
      .eq('ferreteria_id', ferreteria.id).eq('activo', true).order('nombre'),
    supabase.from('zonas_delivery')
      .select('*').eq('ferreteria_id', ferreteria.id).eq('activo', true),
    supabase.from('conversaciones')
      .select('datos_flujo').eq('id', conversacion.id).single(),
  ])

  const datosFlujo = convActual?.datos_flujo as DatosFlujoPedido | null

  // ── 7. Historial + llamada a DeepSeek ─────────────────────────────────────
  const historial = await getHistorial(supabase, conversacion.id, maxContexto)
  const historialParaAI = historial.slice(0, -1)

  const systemPrompt = buildSystemPrompt({
    ferreteria, productos: productos ?? [], zonas: zonas ?? [], config, datosFlujo,
  })

  let respuestaAI
  try {
    respuestaAI = await llamarDeepSeek([
      { role: 'system', content: systemPrompt },
      ...buildHistorialMensajes(historialParaAI),
      { role: 'user', content: textoMensaje },
    ])
  } catch (error) {
    console.error('[Bot] Error DeepSeek:', error)
    const msg = 'Disculpe, tuvimos un inconveniente técnico. Por favor intente en un momento. 🙏'
    await guardarMensaje(supabase, conversacion.id, 'bot', msg)
    return { respuesta: msg, conversacionId: conversacion.id }
  }

  // ── 8. Ejecutar acción según intent ───────────────────────────────────────
  let mensajeFinal = respuestaAI.respuesta

  switch (respuestaAI.intent) {

    // ─── Cotización ───────────────────────────────────────────────────────
    case 'cotizacion': {
      if (respuestaAI.items_solicitados?.length) {
        const resultados = procesarItemsSolicitados(
          respuestaAI.items_solicitados,
          productos ?? [],
          config?.umbral_monto_negociacion
        )

        const requiereAprobacion = resultados.some((r) => r.requiere_aprobacion)
        const disponibles = resultados.filter((r) => r.disponible && r.producto)
        const total = disponibles.reduce((sum, r) => sum + r.subtotal, 0)

        // Guardar cotización
        const { data: cotizacion } = await supabase
          .from('cotizaciones')
          .insert({
            ferreteria_id: ferreteria.id,
            conversacion_id: conversacion.id,
            cliente_id: conversacion.cliente_id,
            estado: requiereAprobacion ? 'pendiente_aprobacion' : 'enviada',
            total,
            requiere_aprobacion: requiereAprobacion,
          })
          .select().single()

        if (cotizacion) {
          const items = [
            ...disponibles.map((r) => ({
              cotizacion_id: cotizacion.id,
              producto_id: r.producto!.id,
              nombre_producto: r.producto!.nombre,
              unidad: r.producto!.unidad,
              cantidad: r.cantidad,
              precio_unitario: r.precio_unitario,
              precio_original: r.precio_original,
              subtotal: r.subtotal,
              no_disponible: false,
            })),
            ...resultados.filter((r) => !r.disponible || !r.producto).map((r) => ({
              cotizacion_id: cotizacion.id,
              producto_id: r.producto?.id ?? null,
              nombre_producto: r.producto?.nombre ?? r.nombre_buscado,
              unidad: r.producto?.unidad ?? 'unidad',
              cantidad: r.cantidad,
              precio_unitario: 0,
              precio_original: 0,
              subtotal: 0,
              no_disponible: true,
              nota_disponibilidad: r.nota,
            })),
          ]
          await supabase.from('items_cotizacion').insert(items)

          // Guardar id de cotización en el flujo para cuando quiera confirmar el pedido
          if (!requiereAprobacion && disponibles.length > 0) {
            await supabase.from('conversaciones')
              .update({ datos_flujo: { cotizacion_id: cotizacion.id, paso: 'esperando_confirmacion' } })
              .eq('id', conversacion.id)
          }
        }

        mensajeFinal = formatearCotizacion(resultados, ferreteria.nombre)
      }
      break
    }

    // ─── Cliente confirma que quiere hacer el pedido ──────────────────────
    case 'confirmar_pedido': {
      await supabase.from('conversaciones')
        .update({
          datos_flujo: {
            ...(datosFlujo ?? {}),
            paso: 'esperando_nombre',
          }
        })
        .eq('id', conversacion.id)

      mensajeFinal = `¡Perfecto! ¿Y tu nombre para el pedido?`
      break
    }

    // ─── Recopilando datos del pedido ─────────────────────────────────────
    case 'recopilar_datos_pedido': {
      const dp = respuestaAI.datos_pedido ?? {}
      const flujoActualizado: DatosFlujoPedido = {
        ...(datosFlujo ?? { paso: 'esperando_nombre' }),
        ...Object.fromEntries(Object.entries(dp).filter(([, v]) => v != null)),
      } as DatosFlujoPedido

      await supabase.from('conversaciones')
        .update({ datos_flujo: flujoActualizado })
        .eq('id', conversacion.id)

      mensajeFinal = respuestaAI.respuesta
      break
    }

    // ─── Todos los datos del pedido recopilados → crear pedido ────────────
    case 'orden_completa': {
      const dp = respuestaAI.datos_pedido
      const flujo = datosFlujo

      if (!dp?.nombre_cliente || !dp?.modalidad) {
        mensajeFinal = '¿Me puede confirmar su nombre y si prefiere delivery o recojo en tienda? 😊'
        break
      }

      // Buscar la cotización activa de esta conversación
      const { data: cotizacion } = await supabase
        .from('cotizaciones')
        .select('*, items_cotizacion(*)')
        .eq('conversacion_id', conversacion.id)
        .in('estado', ['enviada', 'aprobada'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!cotizacion) {
        mensajeFinal = 'No encontré una cotización activa. ¿Podría indicarme qué productos necesita para armar el pedido?'
        break
      }

      // Buscar zona de delivery si aplica
      let zonaId: string | null = null
      let tiempoEntrega = 60

      if (dp.modalidad === 'delivery' && dp.zona_nombre) {
        const zona = (zonas ?? []).find((z) =>
          z.nombre.toLowerCase().includes(dp.zona_nombre!.toLowerCase())
        )
        if (zona) {
          zonaId = zona.id
          tiempoEntrega = zona.tiempo_estimado_min
        }
      }

      // Generar número de pedido
      const { data: numData } = await supabase
        .rpc('generar_numero_pedido', { p_ferreteria_id: ferreteria.id })
      const numeroPedido = numData as string

      // Mapa de costo por producto para snapshot de rentabilidad
      const productoCostoMap = new Map((productos ?? []).map((p) => [p.id, p.precio_compra ?? 0]))

      // Copiar items de la cotización al pedido
      const itemsCotizacion = (cotizacion as any).items_cotizacion ?? []
      const itemsParaPedido = itemsCotizacion
        .filter((i: any) => !i.no_disponible)
        .map((i: any) => ({
          producto_id: i.producto_id,
          nombre_producto: i.nombre_producto,
          unidad: i.unidad,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.subtotal,
          costo_unitario: productoCostoMap.get(i.producto_id) ?? 0,
        }))

      const costoTotal = itemsParaPedido.reduce(
        (sum: number, i: typeof itemsParaPedido[number]) => sum + i.costo_unitario * i.cantidad, 0
      )

      // Crear el pedido
      const { data: pedido } = await supabase
        .from('pedidos')
        .insert({
          ferreteria_id: ferreteria.id,
          cotizacion_id: cotizacion.id,
          cliente_id: conversacion.cliente_id,
          numero_pedido: numeroPedido,
          nombre_cliente: dp.nombre_cliente,
          telefono_cliente: telefonoCliente,
          direccion_entrega: dp.direccion_entrega ?? null,
          zona_delivery_id: zonaId,
          modalidad: dp.modalidad,
          estado: 'pendiente',
          total: cotizacion.total,
          costo_total: costoTotal,
        })
        .select().single()

      if (!pedido) {
        mensajeFinal = 'Hubo un error al registrar su pedido. Por favor intente nuevamente.'
        break
      }

      if (itemsParaPedido.length > 0) {
        await supabase.from('items_pedido').insert(
          itemsParaPedido.map((i: typeof itemsParaPedido[number]) => ({ pedido_id: pedido.id, ...i }))
        )
      }

      // Actualizar cliente con nombre si no lo tenía
      await supabase.from('clientes')
        .update({ nombre: dp.nombre_cliente })
        .eq('id', conversacion.cliente_id)
        .is('nombre', null)

      // Limpiar flujo de la conversación
      await supabase.from('conversaciones')
        .update({ datos_flujo: null })
        .eq('id', conversacion.id)

      // Construir mensaje de confirmación
      const lineasProductos = itemsCotizacion
        .filter((i: any) => !i.no_disponible)
        .map((i: any) => `• ${i.nombre_producto}: ${i.cantidad} × S/${i.precio_unitario.toFixed(2)}`)
        .join('\n')

      const modalidadTexto = dp.modalidad === 'delivery'
        ? `Delivery → ${dp.direccion_entrega ?? 'dirección a confirmar'} (~${tiempoEntrega} min)`
        : `Recojo en tienda — ${ferreteria.direccion ?? 'consultar dirección'}`

      mensajeFinal =
        `✅ *Pedido registrado — ${numeroPedido}*\n\n` +
        `${lineasProductos}\n\n` +
        `*Total: S/${cotizacion.total.toFixed(2)}*\n` +
        `${modalidadTexto}\n\n` +
        `El encargado lo confirmará en breve. ¡Gracias, ${dp.nombre_cliente}! 🙏`
      break
    }

    // ─── Solicitar comprobante ────────────────────────────────────────────
    case 'solicitar_comprobante': {
      const admin = createAdminClient()

      // Buscar pedidos confirmados del cliente en esta ferretería
      const { data: pedidosCliente } = await admin
        .from('pedidos')
        .select('id, numero_pedido, estado, created_at')
        .eq('ferreteria_id', ferreteria.id)
        .eq('cliente_id', conversacion.cliente_id)
        .in('estado', ['confirmado', 'en_preparacion', 'enviado', 'entregado'])
        .order('created_at', { ascending: false })
        .limit(5)

      if (!pedidosCliente || pedidosCliente.length === 0) {
        // Buscar si tiene pedidos pendientes (aún no confirmados)
        const { data: pedidosPendientes } = await admin
          .from('pedidos')
          .select('numero_pedido, created_at')
          .eq('ferreteria_id', ferreteria.id)
          .eq('cliente_id', conversacion.cliente_id)
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false })
          .limit(1)

        if (pedidosPendientes && pedidosPendientes.length > 0) {
          mensajeFinal =
            `Tu pedido *${pedidosPendientes[0].numero_pedido}* todavía está pendiente de confirmación por el encargado.\n\n` +
            `En cuanto lo confirmen, te enviamos el comprobante automáticamente. ` +
            `Si tienes urgencia, puedes escribirnos nuevamente y te ayudamos 🙏`
        } else {
          mensajeFinal =
            `No encontré pedidos a tu nombre por aquí. ¿Quizás el pedido fue registrado con otro número? Si necesitas ayuda, dime y te conecto con el encargado 😊`
        }
        break
      }

      // Si el cliente mencionó un número de pedido, usarlo; si no, el más reciente
      let pedidoTarget = pedidosCliente[0]
      if (respuestaAI.numero_pedido) {
        const match = pedidosCliente.find(
          (p) => p.numero_pedido.toUpperCase() === respuestaAI.numero_pedido!.toUpperCase()
        )
        if (match) pedidoTarget = match
      }

      // Si tiene más de un pedido y no especificó cuál, preguntar
      if (pedidosCliente.length > 1 && !respuestaAI.numero_pedido) {
        const lista = pedidosCliente
          .slice(0, 3)
          .map((p) => `• *${p.numero_pedido}*`)
          .join('\n')
        mensajeFinal =
          `Tienes más de un pedido confirmado. ¿De cuál necesitas el comprobante?\n\n${lista}\n\nResponde con el número de pedido.`
        break
      }

      // Generar (o recuperar existente) y enviar el comprobante
      const resultado = await generarYEnviarComprobante({
        pedidoId: pedidoTarget.id,
        ferreteriaId: ferreteria.id,
      })

      if (resultado.ok) {
        mensajeFinal =
          `📄 Aquí va tu comprobante *${resultado.numero_comprobante}* del pedido *${pedidoTarget.numero_pedido}*. ` +
          `Si no llega o necesitas algo más, avísame 🙏`
      } else {
        mensajeFinal =
          `Tuve un problema al generar el comprobante. Escríbenos de nuevo en un momento o pide al encargado que te lo envíe directamente. 🙏`
        console.error('[Bot] Error generando comprobante:', resultado.error)
      }
      break
    }

    // ─── Estado de pedido ─────────────────────────────────────────────────
    case 'estado_pedido': {
      if (respuestaAI.numero_pedido) {
        const { data: pedido } = await supabase
          .from('pedidos')
          .select('numero_pedido, estado, modalidad')
          .eq('ferreteria_id', ferreteria.id)
          .eq('numero_pedido', respuestaAI.numero_pedido.toUpperCase())
          .single()

        if (pedido) {
          const labels: Record<string, string> = {
            pendiente: '⏳ Pendiente de confirmación',
            confirmado: '✅ Confirmado',
            en_preparacion: '📦 En preparación',
            enviado: '🚚 En camino',
            entregado: '✅ Entregado',
            cancelado: '❌ Cancelado',
          }
          mensajeFinal =
            `*Pedido ${pedido.numero_pedido}*\n` +
            `Estado: ${labels[pedido.estado] ?? pedido.estado}\n` +
            `Modalidad: ${pedido.modalidad === 'delivery' ? '🚚 Delivery' : '🏪 Recojo en tienda'}\n\n` +
            `¿Necesita algo más? Con gusto le ayudamos 😊`
        } else {
          mensajeFinal =
            `No encontré el pedido *${respuestaAI.numero_pedido}*. ` +
            `Verifique el número e intente nuevamente.`
        }
      }
      break
    }

    // ─── Cliente rechaza cotización aprobada ──────────────────────────────
    case 'rechazar_cotizacion': {
      // Marcar cotización como rechazada si hay una activa en el flujo
      if (datosFlujo?.cotizacion_id) {
        await supabase
          .from('cotizaciones')
          .update({ estado: 'rechazada' })
          .eq('id', datosFlujo.cotizacion_id)

        await supabase
          .from('conversaciones')
          .update({ datos_flujo: null })
          .eq('id', conversacion.id)
      }
      mensajeFinal = respuestaAI.respuesta
      break
    }

    // ─── Handoff al dueño ─────────────────────────────────────────────────
    case 'pedir_humano': {
      await pausarBot(supabase, conversacion.id)
      mensajeFinal = respuestaAI.respuesta
      break
    }

    // ─── Intents sin acción especial (FAQs, saludo, desconocido) ─────────
    default:
      mensajeFinal = respuestaAI.respuesta
  }

  await guardarMensaje(supabase, conversacion.id, 'bot', mensajeFinal)
  return { respuesta: mensajeFinal, conversacionId: conversacion.id }
}
