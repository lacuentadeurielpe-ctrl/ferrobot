// Orquestador principal del bot
// Coordina: sesión → horario → AI → acciones → respuesta

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ferreteria, Producto, ZonaDelivery, ConfiguracionBot, DatosFlujoPedido, TipoTareaIA, PerfilBot, AgentesActivos } from '@/types/database'
import { llamarDeepSeek, type IntentBot } from '@/lib/ai/deepseek'
import { llamarClaude, claudeDisponible, buildSystemPromptClaude } from '@/lib/ai/claude'
import { buildSystemPrompt, buildSystemPromptLite, buildHistorialMensajes } from '@/lib/ai/prompt'
import { ejecutarOrquestador } from '@/lib/ai/orchestrator'
import { buildOrchestratorSystemPrompt } from '@/lib/ai/orchestrator-prompt'
import { aplicarCompaction } from '@/lib/ai/compaction'
import { procesarItemsSolicitados, formatearCotizacion } from '@/lib/bot/catalog-search'
import {
  getOrCreateSession,
  guardarMensaje,
  getHistorial,
  verificarRetomarBot,
  pausarBot,
  mensajeYaProcesado,
  yaEnvioMensajeFueraHorario,
} from '@/lib/bot/session'
import { formatHora } from '@/lib/utils'
import { enviarMensaje as enviarWhatsApp } from '@/lib/whatsapp/ycloud'
import { generarYEnviarComprobante, eliminarComprobantePedido } from '@/lib/pdf/generar-comprobante'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  tieneCreditos,
  verificarYDescontarCreditos,
  registrarMovimiento,
  respuestaModoBasico,
  estimarCostoUsd,
} from '@/lib/credits'
import { MODELO_POR_TAREA } from '@/types/database'
import { consultarRuc, validarFormatoRuc } from '@/lib/sunat/ruc'
import { emitirBoleta, emitirFactura } from '@/lib/comprobantes/emitir'

// ── Mapeo intent → tipo de tarea IA ──────────────────────────────────────────
// Determina cuántos créditos cuesta y qué modelo corresponde usar.
// Llamado DESPUÉS de obtener el intent de DeepSeek.
function intentToTaskType(intent: IntentBot, mensajesEnContexto: number): TipoTareaIA {
  switch (intent) {
    case 'cotizacion':
      return 'cotizacion'                         // 3 créditos — GPT-4o mini (o DS fallback)

    case 'confirmar_pedido':
    case 'recopilar_datos_pedido':
    case 'orden_completa':
    case 'modificar_pedido':
      return 'pedido'                             // 3 créditos — GPT-4o mini (o DS fallback)

    case 'atencion_cliente':
      // Conversación larga sin resolución → escalar a Claude
      return mensajesEnContexto > 8 ? 'situacion_compleja' : 'crm'   // 8 ó 1 crédito

    case 'faq_horario':
    case 'faq_direccion':
    case 'faq_delivery':
    case 'faq_pagos':
    case 'solicitar_comprobante':
    case 'estado_pedido':
      return 'crm'                                // 1 crédito — DeepSeek

    default:
      return 'respuesta_simple'                   // 1 crédito — DeepSeek
  }
}

interface HandleMessageParams {
  supabase: SupabaseClient
  ferreteria: Ferreteria
  telefonoCliente: string
  textoMensaje: string
  ycloudMessageId?: string
  /** api_key del tenant para enviar WhatsApp (desencriptada) */
  ycloudApiKey?: string
}

type MensajeExtra =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagen'; url: string; caption?: string }
  | { tipo: 'documento'; url: string; filename: string; caption?: string }

interface HandleMessageResult {
  respuesta: string | null
  conversacionId: string
  mensajesExtra?: MensajeExtra[]
}

/** El catálogo siempre se incluye en el prompt.
 *  Eliminamos el filtro por keywords — era la raíz del bug donde el bot decía
 *  "no hay" para productos que sí existen porque el catálogo nunca llegaba al modelo. */
function mensajeNecesitaCatalogo(_texto: string): boolean {
  return true
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
  ycloudApiKey,
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
  // F3: Perfil del bot — tipo_negocio, descripcion_negocio, tono_bot, nombre_bot
  const perfilBot: PerfilBot = (config as unknown as { perfil_bot?: PerfilBot } | null)?.perfil_bot ?? {}
  // F4: Agentes configurables — semántica opt-out (undefined = todo activo)
  const agentesActivos = (config as unknown as { agentes_activos?: AgentesActivos } | null)?.agentes_activos
  // F5: Profit engine
  const cierreCotizacionActivo = (config as unknown as { cierre_cotizacion_activo?: boolean } | null)?.cierre_cotizacion_activo !== false
  const umbralUpsellSoles      = (config as unknown as { umbral_upsell_soles?: number } | null)?.umbral_upsell_soles ?? 0

  // ── 3. Sesión ─────────────────────────────────────────────────────────────
  const { conversacion, cliente } = await getOrCreateSession(
    supabase, ferreteria.id, telefonoCliente, timeoutSesion
  )

  // Nombre guardado del cliente (para no volver a pedírselo)
  const nombreClienteGuardado = cliente.nombre ?? null

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
    // Evitar spam: solo responder una vez por hora fuera de horario
    const yaRespondi = await yaEnvioMensajeFueraHorario(supabase, conversacion.id)
    if (yaRespondi) {
      return { respuesta: null, conversacionId: conversacion.id }
    }
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

  // ── 7. Verificar créditos mínimos (1) sin descontar aún ─────────────────
  // No sabemos el tipo de tarea hasta obtener el intent de DeepSeek.
  // Verificamos que haya al menos 1 crédito antes de llamar al modelo.
  const hayCreditos = await tieneCreditos(ferreteria.id, 'respuesta_simple')
  if (!hayCreditos) {
    console.warn(`[Bot] Sin créditos mínimos para ferreteria=${ferreteria.id}`)
    const msg = respuestaModoBasico()
    await guardarMensaje(supabase, conversacion.id, 'bot', msg)
    return { respuesta: msg, conversacionId: conversacion.id }
  }

  // ── 8. Historial + llamada a DeepSeek (intent + respuesta) ────────────────
  const necesitaCatalogo = mensajeNecesitaCatalogo(textoMensaje) || !!datosFlujo
  const limiteHistorial = necesitaCatalogo ? maxContexto : Math.min(maxContexto, 4)
  const historial = await getHistorial(supabase, conversacion.id, limiteHistorial)
  const historialParaAI = historial.slice(0, -1)

  // ── 8a. F1: Orquestador v2 (tool-calling) — activo por defecto ──────────
  // El orquestador v2 es ahora el flujo principal para todos los tenants.
  // Se puede desactivar explícitamente con usar_orquestador_v2 = false.
  // Motor: Claude (si ANTHROPIC_API_KEY está presente) o DeepSeek como fallback.
  const usarOrquestador =
    (config as any)?.usar_orquestador_v2 !== false
  if (usarOrquestador) {
    try {
      console.log(`[Bot] Usando orquestador v2 — ferreteria=${ferreteria.id}`)
      // Descontamos crédito mínimo — cualquier respuesta del orquestador cuesta
      // al menos 1 crédito. (F2 refinará este costo según tools usadas.)
      const creditosOk = await verificarYDescontarCreditos(ferreteria.id, 'respuesta_simple')
      if (!creditosOk.ok) {
        const msg = respuestaModoBasico()
        await guardarMensaje(supabase, conversacion.id, 'bot', msg)
        return { respuesta: msg, conversacionId: conversacion.id }
      }

      // Cargar perfil del cliente y resumen previo de contexto
      const [{ data: clienteFull }, { data: convFull }] = await Promise.all([
        supabase
          .from('clientes')
          .select('perfil')
          .eq('id', conversacion.cliente_id)
          .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
          .single(),
        supabase
          .from('conversaciones')
          .select('resumen_contexto')
          .eq('id', conversacion.id)
          .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
          .single(),
      ])
      const perfilCliente = (clienteFull?.perfil as Record<string, unknown> | null) ?? null
      const resumenPrevio = (convFull?.resumen_contexto as string | null) ?? null

      // Compaction: si el historial es largo, resumir los viejos.
      // Si falla (p.ej. DeepSeek caído), continuar con el historial crudo — nunca bloquear.
      let mensajesRecientes = historialParaAI
      let resumenContexto   = resumenPrevio
      try {
        const compact = await aplicarCompaction(
          supabase,
          conversacion.id,
          ferreteria.id,
          historialParaAI,
          resumenPrevio
        )
        mensajesRecientes = compact.mensajesRecientes
        resumenContexto   = compact.resumenContexto
      } catch (eCompact) {
        console.error(
          `[Bot] Compaction error — usando historial crudo conv=${conversacion.id}:`,
          eCompact instanceof Error ? eCompact.message : eCompact
        )
      }

      const systemPromptOrq = buildOrchestratorSystemPrompt({
        ferreteria,
        productos: productos ?? [],
        zonas: zonas ?? [],
        config,
        nombreCliente: nombreClienteGuardado,
        perfilCliente,
        resumenContexto,
        datosFlujo,
        perfilBot,
        cierreCotizacionActivo,     // F5
      })

      const resultado = await ejecutarOrquestador(
        systemPromptOrq,
        mensajesRecientes.map((m) => ({
          role: m.role === 'cliente' ? 'user' : 'assistant',
          content: m.contenido,
        })),
        textoMensaje,
        {
          supabase,
          ferreteriaId:    ferreteria.id,       // FERRETERÍA AISLADA
          conversacionId:  conversacion.id,
          clienteId:       conversacion.cliente_id,
          telefonoCliente,                       // para crear_pedido
          productos:       productos ?? [],
          zonas:           zonas ?? [],          // para crear_pedido (zona lookup)
          datosFlujo,                            // cotización activa y paso actual
          ventanaGraciaMinutos: (config as unknown as { ventana_gracia_minutos?: number } | null)?.ventana_gracia_minutos ?? 30,
          ycloudApiKey,
          agentesActivos,                        // F4: tools habilitadas por tenant
          umbralUpsellSoles,                     // F5: mínimo para activar upsell
        }
      )

      // Registrar crédito según lo que el orquestador realmente hizo
      const tipoTareaOrq = resultado.toolsUsadas.includes('guardar_cotizacion') ? 'cotizacion'
        : resultado.toolsUsadas.includes('crear_pedido') ? 'pedido'
        : 'respuesta_simple'

      console.log(`[Orchestrator] motor=${resultado.motor} tools=${resultado.toolsUsadas.join(',') || 'ninguna'} iter=${resultado.iteraciones} tarea=${tipoTareaOrq}`)

      registrarMovimiento({
        ferreteriaId:   ferreteria.id,
        tipoTarea:      tipoTareaOrq,
        conversacionId: conversacion.id,
        origen: 'bot',
      }).catch(() => {})

      await guardarMensaje(supabase, conversacion.id, 'bot', resultado.respuesta)
      return { respuesta: resultado.respuesta, conversacionId: conversacion.id }
    } catch (e) {
      // ── MODO DEGRADADO: orquestador v2 falló → flujo clásico como safety net ──
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error(
        `[DEGRADED] orquestador→clásico ferreteria=${ferreteria.id} conv=${conversacion.id} err="${errMsg.slice(0, 200)}"`
      )

      // Alertar al dueño si tiene teléfono configurado y la última alerta fue hace >1h
      // (evitar spam: el campo ultimo_error_at en configuracion_ycloud sirve como throttle)
      if (ycloudApiKey && ferreteria.telefono_dueno && ferreteria.telefono_whatsapp) {
        try {
          const { data: ycConf } = await supabase
            .from('configuracion_ycloud')
            .select('ultimo_error_at')
            .eq('ferreteria_id', ferreteria.id)
            .single()

          const ultimoError = ycConf?.ultimo_error_at ? new Date(ycConf.ultimo_error_at).getTime() : 0
          const pasaronMs   = Date.now() - ultimoError
          const UNA_HORA_MS = 60 * 60 * 1000

          if (pasaronMs > UNA_HORA_MS) {
            // Marcar antes de enviar para no duplicar si el send tarda
            void supabase.from('configuracion_ycloud')
              .update({ ultimo_error_at: new Date().toISOString(), ultimo_error: `[DEGRADED] ${errMsg.slice(0, 300)}` })
              .eq('ferreteria_id', ferreteria.id)

            enviarWhatsApp({
              from:   ferreteria.telefono_whatsapp,
              to:     ferreteria.telefono_dueno,
              texto:  `⚠️ *FerroBot — Alerta técnica*\nEl bot tuvo un problema y está en modo básico por ahora.\n\nError: ${errMsg.slice(0, 150)}\n\nTu bot sigue respondiendo pero con funciones reducidas. Revisa los logs si persiste.`,
              apiKey: ycloudApiKey,
            }).catch(() => {})
          }
        } catch { /* no bloquear el flujo por fallo en la alerta */ }
      }
    }
  }

  // Siempre incluir catálogo completo — mensajeNecesitaCatalogo() siempre retorna true
  const systemPrompt = buildSystemPrompt({
    ferreteria,
    productos: productos ?? [],
    zonas:     zonas ?? [],
    config,
    datosFlujo,
    nombreCliente: nombreClienteGuardado,
    perfilBot,
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

  // ── 9. Routing de créditos y modelo según el intent detectado ────────────
  const tareaIA = intentToTaskType(respuestaAI.intent, historialParaAI.length)
  const modeloUsado = MODELO_POR_TAREA[tareaIA]

  console.log(`[Bot] intent=${respuestaAI.intent} → tarea=${tareaIA} modelo=${modeloUsado}`)

  // Descontar los créditos reales de la tarea (atómico)
  const creditosOk = await verificarYDescontarCreditos(ferreteria.id, tareaIA)
  if (!creditosOk.ok) {
    // Ya consumimos la llamada a DeepSeek — igual respondemos, pero no descontamos más
    console.warn(`[Bot] Créditos insuficientes para ${tareaIA} (necesitaba más de 1)`)
    // Registrar al menos 1 crédito consumido (lo mínimo que teníamos)
    registrarMovimiento({
      ferreteriaId: ferreteria.id,
      tipoTarea:    'respuesta_simple',
      conversacionId: conversacion.id,
      origen: 'bot',
    }).catch(() => {})
  } else {
    // Registrar movimiento con datos reales (fire-and-forget)
    registrarMovimiento({
      ferreteriaId:   ferreteria.id,
      tipoTarea:      tareaIA,
      conversacionId: conversacion.id,
      origen:         'bot',
    }).catch(() => {})
  }

  // ── 10. Si la tarea es situacion_compleja y Claude está disponible ─────────
  // Claude reemplaza la respuesta de DeepSeek con una más elaborada y empática.
  if (tareaIA === 'situacion_compleja' && claudeDisponible()) {
    try {
      console.log(`[Bot] Escalando a Claude para situacion_compleja (${historialParaAI.length} mensajes)`)

      const contextoResumen = historialParaAI
        .slice(-6) // últimos 6 mensajes para el contexto de Claude
        .map((m) => `${m.role === 'cliente' ? 'Cliente' : 'Bot'}: ${m.contenido}`)
        .join('\n')

      const systemPromptClaude = buildSystemPromptClaude({
        nombreFerreteria: ferreteria.nombre,
        tipoNegocio:      perfilBot.tipo_negocio ?? null,
        nombreCliente:    nombreClienteGuardado,
        contextoResumen,
      })

      const mensajesParaClaude = [
        ...buildHistorialMensajes(historialParaAI.slice(-6)),
        { role: 'user' as const, content: textoMensaje },
      ]

      const respuestaClaude = await llamarClaude(systemPromptClaude, mensajesParaClaude)

      // Reemplazar la respuesta de DeepSeek con la de Claude
      respuestaAI = { ...respuestaAI, respuesta: respuestaClaude }

      console.log(`[Bot] Claude respondió (${respuestaClaude.length} chars)`)
    } catch (e) {
      console.error('[Bot] Error llamando a Claude — usando respuesta de DeepSeek:', e)
      // Fallback: usar la respuesta de DeepSeek (ya está en respuestaAI)
    }
  }

  // ── 11. Ejecutar acción según intent ─────────────────────────────────────
  let mensajeFinal = respuestaAI.respuesta
  const mensajesExtra: MensajeExtra[] = []

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
      // Si ya tenemos el nombre guardado, saltar directamente a pedir modalidad
      const pasoSiguiente = nombreClienteGuardado ? 'esperando_modalidad' : 'esperando_nombre'
      await supabase.from('conversaciones')
        .update({
          datos_flujo: {
            ...(datosFlujo ?? {}),
            paso: pasoSiguiente,
            ...(nombreClienteGuardado ? { nombre_cliente: nombreClienteGuardado } : {}),
          }
        })
        .eq('id', conversacion.id)

      mensajeFinal = nombreClienteGuardado
        ? `¡Perfecto, ${nombreClienteGuardado}! ¿Lo vienes a recoger o te lo llevamos?`
        : `¡Perfecto! ¿Y tu nombre para el pedido?`
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

      // Usar nombre guardado como fallback si la IA no lo capturó
      const nombreFinal = dp?.nombre_cliente ?? nombreClienteGuardado
      if (!nombreFinal || !dp?.modalidad) {
        mensajeFinal = '¿Me confirmas tu nombre y si prefieres delivery o recojo en tienda? 😊'
        break
      }
      if (dp) dp.nombre_cliente = nombreFinal

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

      // Crear el pedido — nace directamente en 'confirmado' (el cliente ya confirmó por WhatsApp)
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
          estado: 'confirmado',
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

      // Descontar stock (el pedido nace confirmado, no pasa por la API de dashboard)
      supabase.rpc('reducir_stock_pedido', { p_pedido_id: pedido.id })
        .then(({ error: e }) => {
          if (e) console.error('[Bot] Error descontando stock:', e.message)
          else console.log(`[Bot] Stock descontado para pedido ${pedido.id}`)
        })

      // Marcar la cotización como aprobada (limpia la alerta del dashboard)
      await supabase
        .from('cotizaciones')
        .update({ estado: 'aprobada' })
        .eq('id', cotizacion.id)

      // Generar y enviar comprobante automáticamente (fire-and-forget)
      generarYEnviarComprobante({
        pedidoId: pedido.id,
        ferreteriaId: ferreteria.id,
        ycloudApiKey,
      }).catch((err) => {
        console.error('[Bot] Error generando comprobante:', err)
      })

      // Actualizar cliente con nombre si no lo tenía
      await supabase.from('clientes')
        .update({ nombre: dp.nombre_cliente })
        .eq('id', conversacion.cliente_id)
        .is('nombre', null)

      // F2: actualizar perfil del cliente con datos inferidos del pedido real
      // Solo agregamos lo que efectivamente ocurrió — nunca inventamos.
      try {
        const { data: clienteActual } = await supabase
          .from('clientes')
          .select('perfil')
          .eq('id', conversacion.cliente_id)
          .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
          .single()

        const perfilBase = (clienteActual?.perfil as Record<string, unknown> | null) ?? {}
        const comprasPrevias = Array.isArray(perfilBase.compras_frecuentes)
          ? (perfilBase.compras_frecuentes as string[])
          : []
        const nombresNuevos = itemsParaPedido
          .map((i: typeof itemsParaPedido[number]) => i.nombre_producto as string)
          .filter(Boolean)
        // Mantener únicos, con tope de 20
        const comprasUnicas = Array.from(new Set([...nombresNuevos, ...comprasPrevias])).slice(0, 20)

        const perfilNuevo: Record<string, unknown> = {
          ...perfilBase,
          compras_frecuentes: comprasUnicas,
          modalidad_preferida: dp.modalidad,
        }
        if (dp.modalidad === 'delivery' && dp.zona_nombre) {
          perfilNuevo.zona_habitual = dp.zona_nombre
        }

        await supabase
          .from('clientes')
          .update({ perfil: perfilNuevo })
          .eq('id', conversacion.cliente_id)
          .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
      } catch (e) {
        // No bloquear la confirmación del pedido si falla el perfil
        console.error('[F2] Error actualizando perfil cliente:', e)
      }

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
        `✅ *Pedido confirmado — ${numeroPedido}*\n\n` +
        `${lineasProductos}\n\n` +
        `*Total: S/${cotizacion.total.toFixed(2)}*\n` +
        `${modalidadTexto}\n\n` +
        `¡Tu pedido ya está confirmado y lo estamos preparando! Gracias, ${dp.nombre_cliente} 🙏`

      // ── Enviar instrucciones de pago si hay métodos digitales configurados
      const metodosActivos: string[] = (ferreteria as any).metodos_pago_activos ?? []
      const datosYape = (ferreteria as any).datos_yape ?? null
      const datosTransferencia = (ferreteria as any).datos_transferencia ?? null

      const lineasPago: string[] = []

      if (metodosActivos.includes('yape') && datosYape?.numero) {
        lineasPago.push(`💚 *Yape:* ${datosYape.numero}`)
      }
      if (metodosActivos.includes('transferencia') && datosTransferencia?.banco) {
        lineasPago.push(
          `🏦 *Transferencia (${datosTransferencia.banco}):*\n` +
          `  Cuenta: ${datosTransferencia.cuenta}\n` +
          (datosTransferencia.cci ? `  CCI: ${datosTransferencia.cci}\n` : '') +
          `  Titular: ${datosTransferencia.titular}`
        )
      }
      if (metodosActivos.includes('efectivo')) {
        lineasPago.push(`💵 *Efectivo* al momento de la entrega`)
      }

      if (lineasPago.length > 0) {
        const textoPago =
          `💳 *Formas de pago disponibles:*\n\n` +
          lineasPago.join('\n\n') +
          `\n\nSi pagas por Yape o transferencia, envía el comprobante y lo confirmaremos. 🙏`
        mensajesExtra.push({ tipo: 'texto', texto: textoPago })
      }

      // Enviar QR de Yape si está disponible
      if (metodosActivos.includes('yape') && datosYape?.qr_url) {
        mensajesExtra.push({
          tipo: 'imagen',
          url: datosYape.qr_url,
          caption: `QR de Yape — ${datosYape.numero}`,
        })
      }
      break
    }

    // ─── Modificar pedido pendiente ───────────────────────────────────────
    case 'modificar_pedido': {
      if (!respuestaAI.items_solicitados?.length) {
        mensajeFinal = respuestaAI.respuesta
        break
      }

      const admin = createAdminClient()

      // Buscar el pedido pendiente más reciente del cliente
      const { data: pedidoMod } = await admin
        .from('pedidos')
        .select('id, numero_pedido, total, items_pedido(*)')
        .eq('ferreteria_id', ferreteria.id)
        .eq('cliente_id', conversacion.cliente_id)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!pedidoMod) {
        mensajeFinal = `No tengo un pedido pendiente tuyo para modificar. ¿Quieres hacer uno nuevo?`
        break
      }

      const itemsActuales: any[] = (pedidoMod as any).items_pedido ?? []
      const productoCostoMap = new Map((productos ?? []).map((p) => [p.id, p.precio_compra ?? 0]))

      // ── Quitar items (cantidad = 0) ──────────────────────────────────────
      const itemsQuitar = respuestaAI.items_solicitados.filter((i) => i.cantidad === 0)
      for (const req of itemsQuitar) {
        const nombre = req.nombre_buscado.toLowerCase()
        const match = itemsActuales.find((ia) =>
          ia.nombre_producto.toLowerCase().includes(nombre) ||
          nombre.includes(ia.nombre_producto.toLowerCase().split(' ')[0])
        )
        if (match) {
          await admin.from('items_pedido').delete().eq('id', match.id)
        }
      }

      // ── Agregar / actualizar items (cantidad > 0) ────────────────────────
      const itemsModificar = respuestaAI.items_solicitados.filter((i) => i.cantidad > 0)
      if (itemsModificar.length > 0) {
        const resultados = procesarItemsSolicitados(
          itemsModificar,
          productos ?? [],
          config?.umbral_monto_negociacion
        )

        for (const r of resultados) {
          if (!r.disponible || !r.producto) continue

          const existente = itemsActuales.find((ia) => ia.producto_id === r.producto!.id)
          if (existente) {
            await admin.from('items_pedido').update({
              cantidad: r.cantidad,
              precio_unitario: r.precio_unitario,
              subtotal: r.subtotal,
              costo_unitario: productoCostoMap.get(r.producto.id) ?? 0,
            }).eq('id', existente.id)
          } else {
            await admin.from('items_pedido').insert({
              pedido_id: pedidoMod.id,
              producto_id: r.producto.id,
              nombre_producto: r.producto.nombre,
              unidad: r.producto.unidad,
              cantidad: r.cantidad,
              precio_unitario: r.precio_unitario,
              subtotal: r.subtotal,
              costo_unitario: productoCostoMap.get(r.producto.id) ?? 0,
            })
          }
        }
      }

      // ── Recalcular total del pedido ──────────────────────────────────────
      const { data: itemsFinal } = await admin
        .from('items_pedido')
        .select('subtotal, cantidad, costo_unitario')
        .eq('pedido_id', pedidoMod.id)

      if (!itemsFinal || itemsFinal.length === 0) {
        mensajeFinal =
          `Tu pedido *${pedidoMod.numero_pedido}* quedó sin productos. ` +
          `¿Lo cancelo o quieres agregar algo?`
        break
      }

      const nuevoTotal = itemsFinal.reduce((s, i) => s + i.subtotal, 0)
      const nuevoCosto = itemsFinal.reduce((s, i) => s + (i.costo_unitario ?? 0) * i.cantidad, 0)
      await admin.from('pedidos')
        .update({ total: nuevoTotal, costo_total: nuevoCosto })
        .eq('id', pedidoMod.id)

      // ── Borrar comprobante anterior si existe ────────────────────────────
      await eliminarComprobantePedido(pedidoMod.id, ferreteria.id)

      // ── Mensaje de confirmación al cliente ───────────────────────────────
      const { data: itemsMostrar } = await admin
        .from('items_pedido')
        .select('nombre_producto, cantidad, precio_unitario')
        .eq('pedido_id', pedidoMod.id)
        .order('nombre_producto')

      const lineas = (itemsMostrar ?? [])
        .map((i) => `• ${i.nombre_producto}: ${i.cantidad} × S/${i.precio_unitario.toFixed(2)}`)
        .join('\n')

      mensajeFinal =
        `✅ *Pedido ${pedidoMod.numero_pedido} actualizado*\n\n` +
        `${lineas}\n\n` +
        `*Total: S/${nuevoTotal.toFixed(2)}*\n\n` +
        `Si necesitas la proforma actualizada, pídemela y te la envío 🙏`
      break
    }

    // ─── Solicitar comprobante ────────────────────────────────────────────
    case 'solicitar_comprobante': {
      const admin = createAdminClient()
      const tipoRucTenant = (ferreteria as any).tipo_ruc ?? 'sin_ruc'
      const nubefactConfigurado = !!(ferreteria as any).nubefact_ruta && !!(ferreteria as any).nubefact_token_enc

      // ── F2: Si el cliente proveyó su RUC para factura, validar y guardar ─
      // Solo aplica para tenants ruc20 (que pueden emitir facturas)
      if (tipoRucTenant === 'ruc20' && respuestaAI.ruc_cliente) {
        const rucClienteLimpio = respuestaAI.ruc_cliente.replace(/\D/g, '')
        if (validarFormatoRuc(rucClienteLimpio)) {
          const consultaRuc = await consultarRuc(rucClienteLimpio)
          if (consultaRuc.ok && consultaRuc.data) {
            const info = consultaRuc.data
            // Guardar RUC en el registro del cliente — FERRETERÍA AISLADA
            await supabase
              .from('clientes')
              .update({
                ruc_cliente:  rucClienteLimpio,
                tipo_persona: info.tipoPersona,
              })
              .eq('id', conversacion.cliente_id)
              .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA

            if (!info.activo) {
              mensajeFinal =
                `⚠️ El RUC *${rucClienteLimpio}* figura como *${info.estado} / ${info.condicion}* en SUNAT.\n\n` +
                `¿Deseas continuar con este RUC de todos modos, o prefieres que te enviemos una nota de venta? 🙏`
              await guardarMensaje(supabase, conversacion.id, 'bot', mensajeFinal)
              return { respuesta: mensajeFinal, conversacionId: conversacion.id }
            }
            console.log(`[Bot] RUC cliente ${rucClienteLimpio} validado: ${info.razonSocial}`)
          } else {
            // RUC no encontrado en SUNAT — avisar pero no bloquear
            mensajeFinal =
              `No pude verificar el RUC *${rucClienteLimpio}* en SUNAT (${consultaRuc.error ?? 'no encontrado'}).\n\n` +
              `¿Puedes confirmar el RUC nuevamente? También podría enviarte una nota de venta sin RUC si lo prefieres 🙏`
            await guardarMensaje(supabase, conversacion.id, 'bot', mensajeFinal)
            return { respuesta: mensajeFinal, conversacionId: conversacion.id }
          }
        }
      }

      // ── Buscar pedido del cliente — incluir estado_pago ───────────────────
      const { data: pedidosCliente } = await admin
        .from('pedidos')
        .select('id, numero_pedido, estado, estado_pago, nombre_cliente, created_at')
        .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
        .eq('cliente_id', conversacion.cliente_id)
        .in('estado', ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado'])
        .order('created_at', { ascending: false })
        .limit(5)

      if (!pedidosCliente || pedidosCliente.length === 0) {
        mensajeFinal =
          `No encontré pedidos a tu nombre por aquí. ¿Quizás el pedido fue registrado con otro número? Si necesitas ayuda, dime y te conecto con el encargado 😊`
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
          .map((p) => `• *${p.numero_pedido}* (${p.estado})`)
          .join('\n')
        mensajeFinal =
          `Tienes más de un pedido. ¿De cuál necesitas el comprobante?\n\n${lista}\n\nResponde con el número de pedido.`
        break
      }

      const pagado = (pedidoTarget as any).estado_pago === 'pagado'
      const pidioFactura = respuestaAI.tipo_comprobante_solicitado === 'factura' || !!respuestaAI.ruc_cliente
      const pidioBoletaOFactura = respuestaAI.tipo_comprobante_solicitado === 'boleta' || pidioFactura

      // ── Caso 1: no pagado → nota de venta siempre ─────────────────────────
      if (!pagado) {
        const esProforma = pedidoTarget.estado === 'pendiente'
        const resultadoNV = await generarYEnviarComprobante({
          pedidoId:     pedidoTarget.id,
          ferreteriaId: ferreteria.id,
          esProforma,
          ycloudApiKey,
        })

        if (resultadoNV.ok) {
          if (esProforma) {
            mensajeFinal =
              `📋 Te envío la proforma *${resultadoNV.numero_comprobante}* del pedido *${pedidoTarget.numero_pedido}*.\n\n` +
              `Recuerda que es un documento provisional — cuando el encargado confirme el pedido recibirás el documento final. 🙏`
          } else {
            mensajeFinal = `🧾 Aquí va tu *nota de venta ${resultadoNV.numero_comprobante}* del pedido *${pedidoTarget.numero_pedido}*.`
            if (pidioBoletaOFactura) {
              mensajeFinal += `\n\n⚠️ Para emitir ${pidioFactura ? 'factura' : 'boleta'} electrónica primero necesitas completar el pago. Una vez confirmado el pago, escríbeme y te la genero de inmediato 🙏`
            }
          }
        } else {
          mensajeFinal = 'Tuve un problema al generar el documento. Avísame y lo revisamos 🙏'
          console.error('[Bot] Error generando comprobante:', resultadoNV.error)
        }
        break
      }

      // ── Caso 2: pagado pero sin Nubefact o sin_ruc → nota de venta ────────
      if (!nubefactConfigurado || tipoRucTenant === 'sin_ruc') {
        const resultadoNV = await generarYEnviarComprobante({
          pedidoId:     pedidoTarget.id,
          ferreteriaId: ferreteria.id,
          esProforma:   false,
          ycloudApiKey,
        })
        if (resultadoNV.ok) {
          mensajeFinal =
            `🧾 Aquí va tu *nota de venta ${resultadoNV.numero_comprobante}* del pedido *${pedidoTarget.numero_pedido}*. Si necesitas algo más avísame 🙏`
        } else {
          mensajeFinal = 'Tuve un problema al generar el documento. Avísame y lo revisamos 🙏'
          console.error('[Bot] Error generando comprobante:', resultadoNV.error)
        }
        break
      }

      // ── Caso 3: pagado + Nubefact configurado → boleta o factura ──────────

      // Si pide factura, verificar que tengamos RUC del cliente
      if (pidioFactura) {
        // Buscar RUC guardado del cliente
        const { data: clienteData } = await admin
          .from('clientes')
          .select('ruc_cliente')
          .eq('id', conversacion.cliente_id)
          .eq('ferreteria_id', ferreteria.id)  // FERRETERÍA AISLADA
          .single()

        const rucParaFactura = respuestaAI.ruc_cliente?.replace(/\D/g, '') || clienteData?.ruc_cliente || ''

        if (!rucParaFactura || rucParaFactura.length !== 11) {
          // No tenemos RUC → pedir y emitir boleta como fallback
          mensajeFinal = `Para emitir factura necesito tu *RUC* (11 dígitos). ¿Me lo puedes indicar?\n\nMientras tanto te envío tu boleta electrónica 🙏`
          // Continúa abajo a emitir boleta
        } else {
          // Tenemos RUC → emitir factura
          console.log(`[Bot F6] Emitiendo factura para pedido=${pedidoTarget.id} ruc=${rucParaFactura}`)
          const resultFact = await emitirFactura({
            pedidoId:      pedidoTarget.id,
            ferreteriaId:  ferreteria.id,  // FERRETERÍA AISLADA
            clienteNombre: (pedidoTarget as any).nombre_cliente || 'CLIENTE',
            clienteRuc:    rucParaFactura,
            emitidoPor:    'bot',
          })

          if (resultFact.ok && resultFact.pdfUrl) {
            mensajeFinal = `🧾 ¡Aquí está tu *factura ${resultFact.numeroCompleto}* del pedido *${pedidoTarget.numero_pedido}*! Este comprobante ya fue registrado ante SUNAT. 📋`
            mensajesExtra.push({
              tipo:     'documento',
              url:      resultFact.pdfUrl,
              filename: `${resultFact.numeroCompleto ?? 'factura'}.pdf`,
              caption:  `Factura ${resultFact.numeroCompleto} — Pedido ${pedidoTarget.numero_pedido}`,
            })
          } else if (resultFact.tokenInvalido) {
            mensajeFinal = 'Hubo un problema con la emisión electrónica. El encargado te enviará el comprobante directamente 🙏'
          } else {
            console.error(`[Bot F6] Error Nubefact factura: ${resultFact.error}`)
            mensajeFinal = `Hubo un inconveniente al generar la factura (${resultFact.error ?? 'error desconocido'}). El encargado te la envía en breve 🙏`
          }
          break
        }
      }

      // Emitir BOLETA (caso default o fallback de factura sin RUC)
      console.log(`[Bot F6] Emitiendo boleta para pedido=${pedidoTarget.id}`)
      const resultBol = await emitirBoleta({
        pedidoId:      pedidoTarget.id,
        ferreteriaId:  ferreteria.id,  // FERRETERÍA AISLADA
        tipoBoleta:    'boleta',
        clienteNombre: (pedidoTarget as any).nombre_cliente || 'CLIENTES VARIOS',
        clienteDni:    '',
        emitidoPor:    'bot',
      })

      if (resultBol.ok && resultBol.pdfUrl) {
        mensajeFinal = `🧾 ¡Aquí está tu *boleta ${resultBol.numeroCompleto}* del pedido *${pedidoTarget.numero_pedido}*! Este comprobante ya fue registrado ante SUNAT. ✅`
        mensajesExtra.push({
          tipo:     'documento',
          url:      resultBol.pdfUrl,
          filename: `${resultBol.numeroCompleto ?? 'boleta'}.pdf`,
          caption:  `Boleta ${resultBol.numeroCompleto} — Pedido ${pedidoTarget.numero_pedido}`,
        })
      } else if (resultBol.tokenInvalido) {
        // Token Nubefact inválido — fallback a nota de venta
        const resultNV = await generarYEnviarComprobante({ pedidoId: pedidoTarget.id, ferreteriaId: ferreteria.id, ycloudApiKey })
        mensajeFinal = resultNV.ok
          ? `🧾 Tu *nota de venta ${resultNV.numero_comprobante}* del pedido *${pedidoTarget.numero_pedido}*. (La boleta electrónica está temporalmente no disponible, el encargado te la envía 🙏)`
          : 'Tuve un problema generando el comprobante. El encargado te lo enviará directamente 🙏'
      } else {
        // Error de Nubefact (ej: serie incorrecta, SUNAT caída) — no reintentar, avisar
        console.error(`[Bot F6] Error Nubefact boleta: ${resultBol.error}`)
        mensajeFinal = `Tuve un inconveniente al emitir la boleta electrónica. El encargado te la enviará directamente 🙏`
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
  return { respuesta: mensajeFinal, conversacionId: conversacion.id, mensajesExtra: mensajesExtra.length > 0 ? mensajesExtra : undefined }
}
