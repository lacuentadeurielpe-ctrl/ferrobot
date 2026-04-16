// Webhook principal de YCloud
// Recibe mensajes entrantes de WhatsApp y los procesa con el bot

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarFirmaWebhook, extraerMensaje, type YCloudWebhookPayload } from '@/lib/whatsapp/ycloud'
import { enviarMensaje } from '@/lib/whatsapp/ycloud'
import { handleIncomingMessage } from '@/lib/bot/message-handler'

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

  // ── 4. Identificar la ferretería por su número de WhatsApp ────────────────
  const supabase = createAdminClient()
  const telefonoNorm = telefonoFerreteria.replace(/^\+/, '')

  // ── 4b. Mensajes no-texto: responder con mensaje útil y salir ─────────────
  if (mensaje.type !== 'text' || !mensaje.text?.body?.trim()) {
    const respuestasMedia: Partial<Record<string, string>> = {
      audio:    '🎧 Escuché tu audio, pero por ahora solo proceso texto. Escríbeme qué necesitas y te atiendo al toque 🙌',
      image:    '📷 Vi tu imagen, pero por ahora solo proceso mensajes de texto. Escríbeme qué necesitas y te cotizo de inmediato 🙌',
      video:    '🎥 Recibí tu video, pero por ahora solo proceso texto. Escríbeme qué necesitas 🙌',
      document: '📄 Recibí tu documento, pero por ahora solo proceso texto. Escríbeme qué necesitas y con gusto te ayudo 🙌',
    }
    const respuesta = respuestasMedia[mensaje.type]
    if (respuesta) {
      try {
        await enviarMensaje({ from: telefonoNorm, to: telefonoCliente, texto: respuesta })
      } catch (e) {
        console.error('[Webhook] Error enviando respuesta a media:', e)
      }
    }
    return NextResponse.json({ ok: true })
  }

  const textoMensaje = mensaje.text.body.trim()
  console.log(`[Webhook] Mensaje de ${telefonoCliente}: "${textoMensaje.slice(0, 50)}"`)

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('*')
    .or(`telefono_whatsapp.eq.${telefonoNorm},telefono_whatsapp.eq.+${telefonoNorm}`)
    .eq('activo', true)
    .single()

  if (!ferreteria) {
    console.warn(`[Webhook] FERRETERIA_NO_ENCONTRADA numero=${telefonoFerreteria} norm=${telefonoNorm}`)
    return NextResponse.json({ ok: true })
  }
  console.log(`[Webhook] FERRETERIA_OK id=${ferreteria.id} nombre="${ferreteria.nombre}"`)


  // ── 5. Procesar el mensaje con el bot ─────────────────────────────────────
  console.log(`[Webhook] INICIANDO_BOT ferreteria=${ferreteria.id} cliente=${telefonoCliente} texto="${textoMensaje.slice(0, 40)}"`)
  try {
    const { respuesta } = await handleIncomingMessage({
      supabase,
      ferreteria,
      telefonoCliente,
      textoMensaje,
      ycloudMessageId,
    })

    // Si el bot no debe responder (está pausado o mensaje duplicado), terminar aquí
    if (!respuesta) {
      console.log(`[Webhook] RESPUESTA_NULA — bot pausado o mensaje duplicado para ${telefonoCliente}`)
      return NextResponse.json({ ok: true })
    }

    // ── 6. Enviar respuesta por YCloud ──────────────────────────────────────
    console.log(`[Webhook] ENVIANDO respuesta a ${telefonoCliente}: "${respuesta.slice(0, 60)}..."`)
    await enviarMensaje({
      from: telefonoNorm,
      to: telefonoCliente,
      texto: respuesta,
    })

    console.log(`[Webhook] ENVIADO OK a ${telefonoCliente} (${respuesta.length} chars)`)
    return NextResponse.json({ ok: true })

  } catch (error) {
    const mensaje_error = error instanceof Error ? error.message : String(error)
    console.error('[Webhook] ERROR_PROCESANDO:', mensaje_error)

    // Intentar enviar un mensaje de error amable al cliente
    try {
      await enviarMensaje({
        from: telefonoNorm,
        to: telefonoCliente,
        texto: 'Disculpe, tuvimos un inconveniente. Por favor intente nuevamente en un momento. 🙏',
      })
    } catch {
      // Si tampoco podemos enviar el error, ya no hay más que hacer
    }

    // Retornar 200 para que YCloud no reintente el webhook
    return NextResponse.json({ ok: true })
  }
}
