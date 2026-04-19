// Diagnóstico temporal — verificar OpenAI + YCloud media download
// BORRAR después de confirmar que funciona
import { NextResponse } from 'next/server'

export async function GET() {
  const openaiKey = process.env.OPENAI_API_KEY
  const ycloudKey = process.env.YCLOUD_API_KEY

  // Test OpenAI
  let openaiStatus = 'no configurada'
  let openaiError = null
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openaiKey}` },
      })
      openaiStatus = res.ok ? `OK (HTTP ${res.status})` : `Error HTTP ${res.status}`
      if (!res.ok) openaiError = await res.text()
    } catch (e) {
      openaiStatus = 'Error de red'
      openaiError = String(e)
    }
  }

  return NextResponse.json({
    openai: {
      keyPresente: !!openaiKey,
      keyPrefix: openaiKey ? openaiKey.slice(0, 10) + '...' : null,
      status: openaiStatus,
      error: openaiError,
    },
    ycloud: {
      keyPresente: !!ycloudKey,
      keyPrefix: ycloudKey ? ycloudKey.slice(0, 8) + '...' : null,
    },
    env: process.env.NODE_ENV,
  })
}
