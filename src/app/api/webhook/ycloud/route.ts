// Webhook principal de YCloud
// Recibe mensajes entrantes de WhatsApp y los procesa con el bot

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarFirmaWebhook, extraerMensaje, descargarMedia, type YCloudWebhookPayload, enviarMensaje, enviarImagen } from '@/lib/whatsapp/ycloud'
import { handleIncomingMessage } from '@/lib/bot/message-handler'
import { transcribirAudio, analizarImagen, openAIDisponible } from '@/lib/ai/openai'

// Vercel: máximo 30s de ejecución para esta ruta
export const maxDuration = 30

// YCloud hace un GET para verificar el webhook al configurarlo
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get('challenge')
  if (challenge) return new Response(challenge, { status: 200 })
  return new Response('Webhook activo', { status: 200 })
}

export async function POST(request: Request) {
  let bodyText: string

  try {
    bodyText = await request.text()
  } catch {
    return NextResponse.json({ error: 'Error leyendo body' }, { status: 400 })
  }

  // ── 1. Verificar firma HMAC ────────────────────────────────────────────────
  const firma = request.headers.get('x-ycloud-signature') ??
                request.headers.get('x-ycloud-signature-256')

  const firmaValida = await verificarFirmaWebhook(bodyText, firma)
  if (!firmaValida) {
    console.warn('[Webhook] Firma inválida rechazada')
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  // ── 2. Parsear payload ─────────────────────────────────────────────────────
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

  // ── 3. Extraer mensaje ─────────────────────────────────────────────────────
  const mensaje = extraerMensaje(payload)
  if (!mensaje) {
    console.log('[Webhook] No se pudo extraer mensaje del payload')
    return NextResponse.json({ ok: true })
  }

  const telefonoCliente = mensaje.from
  const telefonoFerreteria = mensaje.to
  const ycloudMessageId = mensaje.id
  const telefonoNorm = telefonoFerreteria.replace(/^\+/, '')

  // ── 4. Procesar según tipo de mensaje ────────────────────────────────────
  let textoMensaje: string | null = null
  let notaParaBot: string | null = null  // contexto adicional para el bot

  if (mensaje.type === 'text' && mensaje.text?.body?.trim()) {
    textoMensaje = mensaje.text.body.trim()

  } else if (mensaje.type === 'audio' && mensaje.audio?.id) {
    // ── Audio: transcribir con Whisper ────────────────────────────────────
    if (openAIDisponible()) {
      console.log(`[Webhook] Procesando audio ${mensaje.audio.id} con Whisper`)
      try {
        const media = await descargarMedia(mensaje.audio.id)
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
      // Sin OpenAI: pausar bot, avisar al cliente, notificar al dueño
      try {
        const supabaseAudio = createAdminClient()

        // Identificar la ferretería por el número receptor
        const { data: ferreteriaAudio } = await supabaseAudio
          .from('ferreterias')
          .select('id, telefono_dueno')
          .or(`telefono_whatsapp.eq.${telefonoNorm},telefono_whatsapp.eq.+${telefonoNorm}`)
          .eq('activo', true)
          .single()

        if (ferreteriaAudio) {
          // Pausar la conversación
          const { data: conv } = await supabaseAudio
            .from('conversaciones')
            .select('id')
            .eq('ferreteria_id', ferreteriaAudio.id)
            .eq('telefono_cliente', telefonoCliente)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (conv) {
            await supabaseAudio
              .from('conversaciones')
              .update({ bot_pausado: true, bot_pausado_at: new Date().toISOString() })
              .eq('id', conv.id)
          }

          // Notificar al dueño si tiene teléfono configurado
          if (ferreteriaAudio.telefono_dueno) {
            await enviarMensaje({
              from: telefonoNorm, to: ferreteriaAudio.telefono_dueno,
              texto: `🎧 *Nota de voz sin procesar*\nEl cliente ${telefonoCliente} envió una nota de voz. Respóndele desde el panel o WhatsApp.\n\nEl bot está pausado para esta conversación.`,
            }).catch(() => {})
          }
        }

        // Avisar al cliente
        await enviarMensaje({
          from: telefonoNorm, to: telefonoCliente,
          texto: '🎧 Recibí tu nota de voz. Un encargado te responde en breve 🙌',
        }).catch(() => {})
      } catch (e) {
        console.error('[Webhook] Error en fallback de audio:', e)
      }
      return NextResponse.json({ ok: true })
    }

  } else if (mensaje.type === 'image' && mensaje.image?.id) {
    // ── Imagen: analizar con GPT-4o Vision ────────────────────────────────
    if (openAIDisponible()) {
      console.log(`[Webhook] Procesando imagen ${mensaje.image.id} con Vision`)
      try {
        const media = await descargarMedia(mensaje.image.id)
        if (media) {
          const analisis = await analizarImagen(media.buffer, media.mimeType)
          if (analisis) {
            console.log(`[Webhook] Imagen tipo: ${analisis.tipo}`)

            if (analisis.tipo === 'lista_productos' && analisis.productosDetectados?.length) {
              // Convertir lista detectada en texto de cotización
              const listaTexto = analisis.productosDetectados
                .map((p) => `${p.cantidad ? p.cantidad + 'x ' : ''}${p.nombre}`)
                .join(', ')
              textoMensaje = `Quiero cotizar: ${listaTexto}`
              notaParaBot = `[El cliente envió una imagen con una lista de productos. Vision detectó: ${listaTexto}]`
            } else {
              // Para producto individual, consulta, etc — usar la descripción del análisis como texto
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
      // Usar caption si lo hay, o fallback
      if (mensaje.image.caption?.trim()) {
        textoMensaje = mensaje.image.caption.trim()
      } else {
        await enviarMensaje({
          from: telefonoNorm, to: telefonoCliente,
          texto: '📷 Vi tu foto! Cuéntame qué necesitas y te ayudo con precios o consultas 🙌',
        }).catch(() => {})
        return NextResponse.json({ ok: true })
      }
    }

  } else if (mensaje.type === 'document' && mensaje.document?.id) {
    // ── Documento: intentar analizar con Vision (si es imagen-like) ──────
    const caption = mensaje.document.caption?.trim()
    const nombre = mensaje.document.filename ?? ''
    const esImagen = /\.(jpg|jpeg|png|webp)$/i.test(nombre)

    if (openAIDisponible() && esImagen) {
      try {
        const media = await descargarMedia(mensaje.document.id)
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
      // Usar caption si hay, o respuesta amable
      if (caption) {
        textoMensaje = caption
      } else {
        await enviarMensaje({
          from: telefonoNorm, to: telefonoCliente,
          texto: `📄 Recibí tu ${nombre ? `archivo "${nombre}"` : 'documento'}. Para ayudarte mejor, cuéntame por texto qué necesitas 🙌`,
        }).catch(() => {})
        return NextResponse.json({ ok: true })
      }
    }

  } else if (mensaje.type === 'sticker') {
    // Stickers: ignorar silenciosamente
    return NextResponse.json({ ok: true })

  } else {
    // Tipo no soportado
    const tipos: Partial<Record<string, string>> = {
      video: '🎥 Recibí tu video, pero por ahora solo proceso texto e imágenes. Escríbeme qué necesitas 🙌',
      location: '📍 Vi tu ubicación. Si tienes consultas, escríbeme y te atiendo de inmediato 🙌',
      contacts: '👤 Recibí el contacto. Si necesitas algo, escríbeme y te ayudo 🙌',
    }
    const respuesta = tipos[mensaje.type]
    if (respuesta) {
      await enviarMensaje({ from: telefonoNorm, to: telefonoCliente, texto: respuesta }).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  if (!textoMensaje) return NextResponse.json({ ok: true })

  console.log(`[Webhook] Mensaje de ${telefonoCliente}: "${textoMensaje.slice(0, 60)}"`)

  // ── 5. Identificar la ferretería ─────────────────────────────────────────
  const supabase = createAdminClient()

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .or(`telefono_whatsapp.eq.${telefonoNorm},telefono_whatsapp.eq.+${telefonoNorm}`)
    .eq('activo', true)
    .single()

  if (!ferreteria) {
    console.warn(`[Webhook] FERRETERIA_NO_ENCONTRADA numero=${telefonoFerreteria}`)
    return NextResponse.json({ ok: true })
  }

  // ── 6. Procesar con el bot ────────────────────────────────────────────────
  const textoCompleto = notaParaBot ? `${textoMensaje}\n\n${notaParaBot}` : textoMensaje

  try {
    const { respuesta, mensajesExtra } = await handleIncomingMessage({
      supabase,
      ferreteria,
      telefonoCliente,
      textoMensaje: textoCompleto,
      ycloudMessageId,
    })

    if (!respuesta) {
      console.log(`[Webhook] RESPUESTA_NULA — bot pausado o mensaje duplicado`)
      return NextResponse.json({ ok: true })
    }

    await enviarMensaje({ from: telefonoNorm, to: telefonoCliente, texto: respuesta })
    console.log(`[Webhook] ENVIADO OK a ${telefonoCliente} (${respuesta.length} chars)`)

    // Enviar mensajes adicionales (ej: datos de pago + QR Yape)
    if (mensajesExtra?.length) {
      for (const extra of mensajesExtra) {
        try {
          if (extra.tipo === 'texto') {
            await enviarMensaje({ from: telefonoNorm, to: telefonoCliente, texto: extra.texto })
          } else if (extra.tipo === 'imagen') {
            await enviarImagen({ from: telefonoNorm, to: telefonoCliente, imageUrl: extra.url, caption: extra.caption })
          }
        } catch (e) {
          console.error('[Webhook] Error enviando mensaje extra:', e instanceof Error ? e.message : e)
        }
      }
    }
    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('[Webhook] ERROR:', error instanceof Error ? error.message : error)
    try {
      await enviarMensaje({
        from: telefonoNorm, to: telefonoCliente,
        texto: 'Disculpe, tuvimos un inconveniente. Por favor intente nuevamente en un momento. 🙏',
      })
    } catch { /* nada más que hacer */ }
    return NextResponse.json({ ok: true })
  }
}
