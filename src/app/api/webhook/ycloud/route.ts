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

// Vercel: máximo 30s de ejecución para esta ruta
export const maxDuration = 30

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

  // Solo procesar mensajes entrantes
  const tipoEvento = payload.type ?? ''
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

  // ── 6. Procesar según tipo de mensaje ─────────────────────────────────────
  let textoMensaje: string | null = null
  let notaParaBot: string | null = null

  if (mensaje.type === 'text' && mensaje.text?.body?.trim()) {
    textoMensaje = mensaje.text.body.trim()

  } else if (mensaje.type === 'audio' && mensaje.audio?.id) {
    // Audio: transcribir con Whisper
    if (openAIDisponible()) {
      console.log(`[Webhook] Procesando audio ${mensaje.audio.id} con Whisper`)
      try {
        const media = await descargarMedia(mensaje.audio.id, tenantApiKey)
        if (media) {
          const transcripcion = await transcribirAudio(media.buffer, media.mimeType)
          if (transcripcion) {
            console.log(`[Webhook] Transcripción: "${transcripcion.slice(0, 80)}"`)
            textoMensaje = transcripcion
            notaParaBot = '[El cliente envió un audio de voz — este es el texto transcrito]'
          }
        }
      } catch (e) {
        console.error('[Webhook] Error procesando audio:', e)
      }
    }

    if (!textoMensaje) {
      // Sin transcripción: pausar bot y notificar
      try {
        const { data: conv } = await supabase
          .from('conversaciones')
          .select('id')
          .eq('ferreteria_id', ferreteria.id)
          .eq('telefono_cliente', telefonoCliente)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (conv) {
          await supabase
            .from('conversaciones')
            .update({ bot_pausado: true, bot_pausado_at: new Date().toISOString() })
            .eq('id', conv.id)
        }

        if (ferreteria.telefono_dueno) {
          await enviarMensaje({
            from: telefonoEnvio, to: ferreteria.telefono_dueno,
            texto: `🎧 *Nota de voz sin procesar*\nEl cliente ${telefonoCliente} envió una nota de voz. Respóndele desde el panel.\n\nEl bot está pausado.`,
            apiKey: tenantApiKey,
          }).catch(() => {})
        }

        await enviarMensaje({
          from: telefonoEnvio, to: telefonoCliente,
          texto: '🎧 Recibí tu nota de voz. Un encargado te responde en breve 🙌',
          apiKey: tenantApiKey,
        }).catch(() => {})
      } catch (e) {
        console.error('[Webhook] Error en fallback de audio:', e)
      }
      return NextResponse.json({ ok: true })
    }

  } else if (mensaje.type === 'image' && mensaje.image?.id) {
    // Imagen: analizar con GPT-4o Vision
    if (openAIDisponible()) {
      console.log(`[Webhook] Procesando imagen ${mensaje.image.id} con Vision`)
      try {
        const media = await descargarMedia(mensaje.image.id, tenantApiKey)
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
            } else {
              textoMensaje = mensaje.image.caption || analisis.descripcion
              notaParaBot = `[El cliente envió una imagen. Análisis Vision: tipo=${analisis.tipo}, descripción="${analisis.descripcion}"]`
            }
          }
        }
      } catch (e) {
        console.error('[Webhook] Error procesando imagen:', e)
      }
    }

    if (!textoMensaje) {
      if (mensaje.image.caption?.trim()) {
        textoMensaje = mensaje.image.caption.trim()
      } else {
        await enviarMensaje({
          from: telefonoEnvio, to: telefonoCliente,
          texto: '📷 Vi tu foto! Cuéntame qué necesitas y te ayudo con precios o consultas 🙌',
          apiKey: tenantApiKey,
        }).catch(() => {})
        return NextResponse.json({ ok: true })
      }
    }

  } else if (mensaje.type === 'document' && mensaje.document?.id) {
    const caption = mensaje.document.caption?.trim()
    const nombre = mensaje.document.filename ?? ''
    const esImagen = /\.(jpg|jpeg|png|webp)$/i.test(nombre)

    if (openAIDisponible() && esImagen) {
      try {
        const media = await descargarMedia(mensaje.document.id, tenantApiKey)
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

  } else if (mensaje.type === 'sticker') {
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
