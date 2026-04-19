// Webhook principal de YCloud — recibe mensajes entrantes de WhatsApp
//
// Flujo multi-tenant (ETAPA 1):
// 1. Leer body text
// 2. Parsear JSON para extraer el campo `to` (número de la ferretería)
// 3. Identificar ferretería + cargar su configuracion_ycloud (api_key encriptada)
// 4. Desencriptar api_key y webhook_secret
// 5. Verificar firma HMAC con el webhook_secret del tenant
// 6. Procesar mensaje con el bot usando la api_key del tenant

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verificarFirmaWebhook,
  extraerMensaje,
  descargarMedia,
  type YCloudWebhookPayload,
  enviarMensaje,
  enviarImagen,
  enviarDocumento,
} from '@/lib/whatsapp/ycloud'
import { handleIncomingMessage } from '@/lib/bot/message-handler'
import { transcribirAudio, analizarImagen, openAIDisponible } from '@/lib/ai/openai'
import { desencriptar } from '@/lib/encryption'
import { pausarBotPorDueno } from '@/lib/bot/session'

// Vercel: hasta 60s para poder hacer download + Whisper + DeepSeek en secuencia
export const maxDuration = 60

// YCloud hace un GET para verificar el webhook al configurarlo
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get('challenge')
  if (challenge) return new Response(challenge, { status: 200 })
  return new Response('Webhook activo', { status: 200 })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae el número de la ferretería del payload sin necesitar la estructura completa */
function extraerTelefonoFerreteria(payload: YCloudWebhookPayload): string | null {
  const msg =
    payload.data?.whatsappInboundMessage ??
    payload.data?.whatsappMessage ??
    payload.whatsappInboundMessage ??
    payload.whatsappMessage ??
    null
  return msg?.to ?? null
}

export async function POST(request: Request) {
  let bodyText: string

  try {
    bodyText = await request.text()
  } catch {
    return NextResponse.json({ error: 'Error leyendo body' }, { status: 400 })
  }

  // ── 1. Parsear payload para identificar tenant ────────────────────────────
  let payload: YCloudWebhookPayload
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const tipoEvento = payload.type ?? ''

  // Bug 3 fix: detectar mensajes salientes manuales del dueño → pausar bot
  const esOutbound = tipoEvento.includes('outbound') || tipoEvento.includes('message.sending') ||
    tipoEvento === 'whatsapp.message.sent' || tipoEvento === 'message.sent'
  if (esOutbound) {
    // El dueño escribió manualmente desde YCloud → pausar bot para esa conversación
    const msgOut = extraerMensaje(payload)
    if (msgOut?.to) {
      // Identify tenant first for outbound
      const telefonoRawOut = extraerTelefonoFerreteria(payload)
      const telefonoNormOut = telefonoRawOut?.replace(/^\+/, '') ?? ''
      const supabaseOut = createAdminClient()
      const { data: ferreteriaOut } = await supabaseOut
        .from('ferreterias')
        .select('id')
        .or(`telefono_whatsapp.eq.${telefonoNormOut},telefono_whatsapp.eq.+${telefonoNormOut}`)
        .eq('activo', true)
        .single()
      if (ferreteriaOut) {
        const telefonoDestino = msgOut.to.replace(/^\+/, '')
        console.log(`[Webhook] Mensaje manual del dueño → pausar bot para ${telefonoDestino}`)
        pausarBotPorDueno(supabaseOut, ferreteriaOut.id, telefonoDestino).catch(() => {})
      }
    }
    return NextResponse.json({ ok: true })
  }

  // Solo procesar mensajes entrantes reales
  if (!tipoEvento.includes('inbound_message') && !tipoEvento.includes('message.received')) {
    return NextResponse.json({ ok: true })
  }

  // ── 2. Identificar tenant por número receptor ─────────────────────────────
  const telefonoRaw = extraerTelefonoFerreteria(payload)
  const telefonoNorm = telefonoRaw?.replace(/^\+/, '') ?? ''

  const supabase = createAdminClient()

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .or(`telefono_whatsapp.eq.${telefonoNorm},telefono_whatsapp.eq.+${telefonoNorm}`)
    .eq('activo', true)
    .single()

  if (!ferreteria) {
    console.warn(`[Webhook] FERRETERIA_NO_ENCONTRADA numero=${telefonoRaw ?? 'desconocido'}`)
    // Devolver 200 para que YCloud no reintente indefinidamente
    return NextResponse.json({ ok: true })
  }

  // ── 3. Cargar credenciales YCloud del tenant ──────────────────────────────
  const { data: ycloudConfig } = await supabase
    .from('configuracion_ycloud')
    .select('api_key_enc, webhook_secret_enc')
    .eq('ferreteria_id', ferreteria.id)
    .single()

  // Desencriptar api_key del tenant (fallback al env var para compatibilidad)
  let tenantApiKey: string | undefined
  let tenantWebhookSecret: string | undefined

  if (ycloudConfig?.api_key_enc) {
    try {
      tenantApiKey = await desencriptar(ycloudConfig.api_key_enc)
    } catch (e) {
      console.error(`[Webhook] Error desencriptando api_key para ferreteria ${ferreteria.id}:`, e)
    }
  }

  if (ycloudConfig?.webhook_secret_enc) {
    try {
      tenantWebhookSecret = await desencriptar(ycloudConfig.webhook_secret_enc)
    } catch (e) {
      console.error(`[Webhook] Error desencriptando webhook_secret para ferreteria ${ferreteria.id}:`, e)
    }
  }

  // ── 4. Verificar firma HMAC con el secret del tenant ─────────────────────
  // YCloud no siempre envía firma HMAC. Solo verificamos si la firma está presente.
  // Si no viene firma, dejamos pasar (YCloud usa URL secreta o no firma sus webhooks).
  const firma = request.headers.get('x-ycloud-signature') ??
                request.headers.get('x-ycloud-signature-256')

  if (firma) {
    // Solo verificamos HMAC si YCloud envió una firma
    const firmaValida = await verificarFirmaWebhook(bodyText, firma, tenantWebhookSecret)
    if (!firmaValida) {
      console.warn(`[Webhook] Firma inválida rechazada (ferreteria=${ferreteria.id})`)
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }
  }

  // ── 5. Extraer mensaje ────────────────────────────────────────────────────
  const mensaje = extraerMensaje(payload)
  if (!mensaje) {
    console.log('[Webhook] No se pudo extraer mensaje del payload')
    return NextResponse.json({ ok: true })
  }

  const telefonoCliente = mensaje.from
  const telefonoFerreteria = mensaje.to
  const ycloudMessageId = mensaje.id
  const telefonoEnvio = telefonoFerreteria.replace(/^\+/, '')

  // Bug 1 fix: ignorar si el remitente es la propia ferretería (eco del bot)
  const clienteNorm = telefonoCliente.replace(/^\+/, '')
  const ferrNorm = telefonoFerreteria.replace(/^\+/, '')
  if (clienteNorm === ferrNorm || clienteNorm === ferreteria.telefono_whatsapp?.replace(/^\+/, '')) {
    console.log(`[Webhook] Mensaje propio ignorado (from=${telefonoCliente})`)
    return NextResponse.json({ ok: true })
  }

  // ── 6. Procesar según tipo de mensaje ─────────────────────────────────────
  let textoMensaje: string | null = null
  let notaParaBot: string | null = null

  // Diagnóstico de campos de media (corto para ser visible en Vercel logs)
  if (mensaje.type !== 'text') {
    const mo = (mensaje as any)[mensaje.type] ?? {}
    const keys = Object.keys(mo).join(',') || 'VACIO'
    const id = mo.id ?? 'N'
    const link = mo.link ?? 'N'
    const url = mo.url ?? 'N'
    const mediaUrl = mo.mediaUrl ?? mo.media_url ?? 'N'
    const fileId = mo.fileId ?? mo.file_id ?? 'N'
    console.log(`[MF] t=${mensaje.type} keys=${keys} id=${id} link=${link} url=${url} murl=${mediaUrl} fid=${fileId} wamid=${mensaje.wamid ?? 'N'} mid=${mensaje.id ?? 'N'}`)
  } else {
    console.log(`[Webhook] tipo=text from=${telefonoCliente}`)
  }

  if (mensaje.type === 'text' && mensaje.text?.body?.trim()) {
    textoMensaje = mensaje.text.body.trim()

  } else if (mensaje.type === 'audio' || (mensaje as any).type === 'voice') {
    // Audio/voz: intentar extraer el media ID desde múltiples campos posibles que YCloud puede enviar
    // En n8n el usuario hacía un HTTP Request con algún ID del mensaje — probamos todos los candidatos
    const audioObj: Record<string, unknown> = mensaje.audio ?? (mensaje as any).voice ?? {}
    // Orden: audio.id → audio.link/url → wamid (WhatsApp msg ID) → mensaje.id (YCloud msg ID)
    const audioId: string | null =
      (audioObj.id as string) || (audioObj.link as string) || (audioObj.url as string) ||
      mensaje.wamid || mensaje.id || null
    const audioMime = (audioObj.mimeType as string) || (audioObj.mime_type as string) || 'audio/ogg'
    console.log(`[Webhook] Audio/Voice — mediaId=${audioId ?? 'NULL'}, mime=${audioMime}, openAI=${openAIDisponible()}`)
    if (openAIDisponible() && audioId) {
      try {
        const media = await descargarMedia(audioId, tenantApiKey)
        if (media) {
          console.log(`[Webhook] Audio descargado ${media.buffer.length}b mimeType=${media.mimeType} — enviando a Whisper`)
          const transcripcion = await transcribirAudio(media.buffer, media.mimeType)
          if (transcripcion) {
            console.log(`[Webhook] Transcripción OK: "${transcripcion.slice(0, 80)}"`)
            textoMensaje = transcripcion
            notaParaBot = '[El cliente envió un audio de voz — este es el texto transcrito]'
          } else {
            console.warn('[Webhook] Whisper devolvió null — sin transcripción')
          }
        } else {
          console.warn(`[Webhook] descargarMedia devolvió null para audioId=${audioId}`)
        }
      } catch (e) {
        console.error('[Webhook] Error procesando audio:', e)
      }
    } else if (!openAIDisponible()) {
      console.warn('[Webhook] OpenAI no disponible — OPENAI_API_KEY no configurada')
    } else {
      console.warn('[Webhook] audioId es null — YCloud no envió media ID en este mensaje')
    }

    if (!textoMensaje) {
      // Sin transcripción: responder al cliente sin pausar el bot
      // (pausar bloquearía los mensajes de texto posteriores)
      try {
        await enviarMensaje({
          from: telefonoEnvio, to: telefonoCliente,
          texto: '🎧 Recibí tu nota de voz. Escríbeme tu consulta por texto y te ayudo enseguida 🙌',
          apiKey: tenantApiKey,
        }).catch(() => {})
      } catch (e) {
        console.error('[Webhook] Error en fallback de audio:', e)
      }
      return NextResponse.json({ ok: true })
    }

  } else if (mensaje.type === 'image') {
    // Imagen: analizar con GPT-4o-mini Vision
    const imageObj: Record<string, unknown> = mensaje.image ?? {}
    const imageId: string | null =
      (imageObj.id as string) || (imageObj.link as string) || (imageObj.url as string) ||
      mensaje.wamid || mensaje.id || null
    const imageMime = (imageObj.mimeType as string) || 'image/jpeg'
    console.log(`[Webhook] Imagen — mediaId=${imageId ?? 'NULL'}, mime=${imageMime}, openAI=${openAIDisponible()}`)
    if (openAIDisponible() && imageId) {
      try {
        const media = await descargarMedia(imageId, tenantApiKey)
        if (media) {
          const analisis = await analizarImagen(media.buffer, media.mimeType)
          if (analisis) {
            console.log(`[Webhook] Imagen tipo: ${analisis.tipo}`)
            if (analisis.tipo === 'lista_productos' && analisis.productosDetectados?.length) {
              const listaTexto = analisis.productosDetectados
                .map((p) => `${p.cantidad ? p.cantidad + 'x ' : ''}${p.nombre}`)
                .join(', ')
              textoMensaje = `Quiero cotizar: ${listaTexto}`
              notaParaBot = `[El cliente envió una imagen con una lista de productos. Vision detectó: ${listaTexto}]`
            } else if (analisis.tipo === 'comprobante_pago' && analisis.pago) {
              // Verificación de pago por foto
              const p = analisis.pago
              console.log(`[Webhook] Comprobante de pago detectado — monto=${p.monto} dest=${p.destinatario}`)

              // Buscar pedido pendiente del cliente — FILTRADO por cliente_id (ferretería aislada)
              const telefonoClienteNorm = telefonoCliente.replace(/^\+/, '')
              const { data: clienteData } = await supabase
                .from('clientes')
                .select('id')
                .eq('ferreteria_id', ferreteria.id)
                .eq('telefono', telefonoClienteNorm)
                .maybeSingle()

              const { data: pedidoPendiente } = await supabase
                .from('pedidos')
                .select('id, numero_pedido, total, estado_pago')
                .eq('ferreteria_id', ferreteria.id)
                .eq('cliente_id', clienteData?.id ?? '')
                .in('estado', ['pendiente', 'confirmado', 'en_preparacion'])
                .neq('estado_pago', 'pagado')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

              if (pedidoPendiente && p.monto !== null) {
                const diferencia = Math.abs(p.monto - pedidoPendiente.total)
                const tolerancia = pedidoPendiente.total * 0.05 // 5%

                if (diferencia <= tolerancia) {
                  // Monto coincide → marcar como verificando y notificar dueño
                  await supabase
                    .from('pedidos')
                    .update({ estado_pago: 'verificando' })
                    .eq('id', pedidoPendiente.id)

                  // Notificar al dueño
                  if (ferreteria.telefono_dueno) {
                    await enviarMensaje({
                      from: telefonoEnvio,
                      to: ferreteria.telefono_dueno,
                      texto: `💳 *Pago recibido para verificar*\nCliente: ${telefonoCliente}\nPedido: *${pedidoPendiente.numero_pedido}*\nMonto detectado: S/ ${p.monto.toFixed(2)}\nTotal pedido: S/ ${pedidoPendiente.total.toFixed(2)}\n${p.operacion_id ? `Op: ${p.operacion_id}` : ''}\n\nConfirma el pago desde el panel.`,
                      apiKey: tenantApiKey,
                    }).catch(() => {})
                  }

                  textoMensaje = `[COMPROBANTE_PAGO_RECIBIDO: monto=S/${p.monto.toFixed(2)} pedido=${pedidoPendiente.numero_pedido} estado=verificando]`
                  notaParaBot = `[El cliente envió comprobante de pago. Monto S/${p.monto.toFixed(2)} coincide con el pedido ${pedidoPendiente.numero_pedido} (S/${pedidoPendiente.total.toFixed(2)}). El pago está en revisión.]`
                } else {
                  // Monto no coincide
                  textoMensaje = `[COMPROBANTE_PAGO_MONTO_INCORRECTO: monto_detectado=S/${p.monto.toFixed(2)} total_pedido=S/${pedidoPendiente.total.toFixed(2)}]`
                  notaParaBot = `[El cliente envió comprobante de pago pero el monto S/${p.monto.toFixed(2)} NO coincide con el pedido ${pedidoPendiente.numero_pedido} (S/${pedidoPendiente.total.toFixed(2)}).]`
                }
              } else {
                // No hay pedido pendiente o no se pudo leer el monto
                textoMensaje = (imageObj.caption as string) || `[COMPROBANTE_PAGO_SIN_PEDIDO]`
                notaParaBot = `[El cliente envió lo que parece un comprobante de pago${p.monto !== null ? ` de S/${p.monto.toFixed(2)}` : ''}, pero no tiene pedido pendiente.]`
              }
            } else {
              textoMensaje = (imageObj.caption as string) || analisis.descripcion
              notaParaBot = `[El cliente envió una imagen. Análisis Vision: tipo=${analisis.tipo}, descripción="${analisis.descripcion}"]`
            }
          }
        }
      } catch (e) {
        console.error('[Webhook] Error procesando imagen:', e)
      }
    }

    if (!textoMensaje) {
      const captionImg = (imageObj.caption as string)?.trim()
      if (captionImg) {
        textoMensaje = captionImg
      } else {
        await enviarMensaje({
          from: telefonoEnvio, to: telefonoCliente,
          texto: '📷 Vi tu foto! Cuéntame qué necesitas y te ayudo con precios o consultas 🙌',
          apiKey: tenantApiKey,
        }).catch(() => {})
        return NextResponse.json({ ok: true })
      }
    }

  } else if (mensaje.type === 'document') {
    const docObj: Record<string, unknown> = mensaje.document ?? {}
    const docId: string | null =
      (docObj.id as string) || (docObj.link as string) || (docObj.url as string) ||
      mensaje.wamid || mensaje.id || null
    const caption = (docObj.caption as string)?.trim()
    const nombre = (docObj.filename as string) ?? ''
    const esImagen = /\.(jpg|jpeg|png|webp)$/i.test(nombre)

    if (openAIDisponible() && esImagen && docId) {
      try {
        const media = await descargarMedia(docId, tenantApiKey)
        if (media) {
          const analisis = await analizarImagen(media.buffer, media.mimeType)
          if (analisis) {
            textoMensaje = analisis.tipo === 'lista_productos' && analisis.productosDetectados?.length
              ? `Quiero cotizar: ${analisis.productosDetectados.map(p => `${p.cantidad ? p.cantidad + 'x ' : ''}${p.nombre}`).join(', ')}`
              : (caption || analisis.descripcion)
            notaParaBot = `[El cliente envió un documento imagen "${nombre}". Análisis: tipo=${analisis.tipo}]`
          }
        }
      } catch (e) {
        console.error('[Webhook] Error procesando documento:', e)
      }
    }

    if (!textoMensaje) {
      if (caption) {
        textoMensaje = caption
      } else {
        await enviarMensaje({
          from: telefonoEnvio, to: telefonoCliente,
          texto: `📄 Recibí tu ${nombre ? `archivo "${nombre}"` : 'documento'}. Para ayudarte mejor, cuéntame por texto qué necesitas 🙌`,
          apiKey: tenantApiKey,
        }).catch(() => {})
        return NextResponse.json({ ok: true })
      }
    }

  } else if (['sticker', 'reaction', 'ephemeral', 'order', 'unsupported'].includes(mensaje.type ?? '')) {
    return NextResponse.json({ ok: true })

  } else {
    const tipos: Partial<Record<string, string>> = {
      video: '🎥 Recibí tu video, pero por ahora solo proceso texto e imágenes. Escríbeme qué necesitas 🙌',
      location: '📍 Vi tu ubicación. Si tienes consultas, escríbeme y te atiendo de inmediato 🙌',
      contacts: '👤 Recibí el contacto. Si necesitas algo, escríbeme y te ayudo 🙌',
    }
    const respuesta = tipos[mensaje.type]
    if (respuesta) {
      await enviarMensaje({ from: telefonoEnvio, to: telefonoCliente, texto: respuesta, apiKey: tenantApiKey }).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  if (!textoMensaje) return NextResponse.json({ ok: true })

  console.log(`[Webhook] Mensaje de ${telefonoCliente}: "${textoMensaje.slice(0, 60)}"`)

  // ── 7. Procesar con el bot ─────────────────────────────────────────────────
  const textoCompleto = notaParaBot ? `${textoMensaje}\n\n${notaParaBot}` : textoMensaje

  try {
    const { respuesta, mensajesExtra } = await handleIncomingMessage({
      supabase,
      ferreteria,
      telefonoCliente,
      textoMensaje: textoCompleto,
      ycloudMessageId,
      ycloudApiKey: tenantApiKey,
    })

    if (!respuesta) {
      console.log(`[Webhook] RESPUESTA_NULA — bot pausado o mensaje duplicado`)
      return NextResponse.json({ ok: true })
    }

    await enviarMensaje({ from: telefonoEnvio, to: telefonoCliente, texto: respuesta, apiKey: tenantApiKey })
    console.log(`[Webhook] ENVIADO OK a ${telefonoCliente} (${respuesta.length} chars)`)

    // Marcar conexión YCloud como activa (fire & forget)
    void supabase.from('configuracion_ycloud')
      .update({ estado_conexion: 'activo', ultimo_mensaje_at: new Date().toISOString() })
      .eq('ferreteria_id', ferreteria.id)

    if (mensajesExtra?.length) {
      for (const extra of mensajesExtra) {
        try {
          if (extra.tipo === 'texto') {
            await enviarMensaje({ from: telefonoEnvio, to: telefonoCliente, texto: extra.texto, apiKey: tenantApiKey })
          } else if (extra.tipo === 'imagen') {
            await enviarImagen({ from: telefonoEnvio, to: telefonoCliente, imageUrl: extra.url, caption: extra.caption, apiKey: tenantApiKey })
          } else if (extra.tipo === 'documento') {
            await enviarDocumento({ from: telefonoEnvio, to: telefonoCliente, pdfUrl: extra.url, filename: extra.filename, caption: extra.caption, apiKey: tenantApiKey })
          }
        } catch (e) {
          console.error('[Webhook] Error enviando mensaje extra:', e instanceof Error ? e.message : e)
        }
      }
    }
    return NextResponse.json({ ok: true })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Webhook] ERROR:', errMsg)

    // Registrar error en configuracion_ycloud (fire & forget)
    void supabase.from('configuracion_ycloud')
      .update({
        estado_conexion: 'error',
        ultimo_error: errMsg.slice(0, 500),
        ultimo_error_at: new Date().toISOString(),
      })
      .eq('ferreteria_id', ferreteria.id)

    try {
      await enviarMensaje({
        from: telefonoEnvio, to: telefonoCliente,
        texto: 'Disculpe, tuvimos un inconveniente. Por favor intente nuevamente en un momento. 🙏',
        apiKey: tenantApiKey,
      })
    } catch { /* nada más que hacer */ }
    return NextResponse.json({ ok: true })
  }
}
