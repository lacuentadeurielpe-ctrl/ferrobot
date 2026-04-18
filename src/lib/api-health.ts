/**
 * Verificación de salud de las APIs externas de IA.
 * Hace un ping ligero (lista de modelos) a cada proveedor.
 * No consume créditos ni genera costos de tokens.
 */

export type ApiStatus = 'ok' | 'error' | 'no_configurado'

export interface ApiHealthResult {
  nombre:     string
  status:     ApiStatus
  latencia_ms: number | null
  detalle:    string | null
}

async function ping(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 6000
): Promise<{ ok: boolean; latencia_ms: number; detalle: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const inicio = Date.now()

  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timer)
    const latencia_ms = Date.now() - inicio

    if (res.ok) return { ok: true, latencia_ms, detalle: null }

    const text = await res.text().catch(() => res.statusText)
    return { ok: false, latencia_ms, detalle: `HTTP ${res.status}: ${text.slice(0, 120)}` }
  } catch (err: any) {
    clearTimeout(timer)
    const latencia_ms = Date.now() - inicio
    const detalle = err?.name === 'AbortError' ? 'Timeout (>6s)' : (err?.message ?? 'Error de red')
    return { ok: false, latencia_ms, detalle }
  }
}

async function checkDeepSeek(): Promise<ApiHealthResult> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return { nombre: 'DeepSeek', status: 'no_configurado', latencia_ms: null, detalle: 'DEEPSEEK_API_KEY no configurada' }

  const { ok, latencia_ms, detalle } = await ping(
    'https://api.deepseek.com/models',
    { Authorization: `Bearer ${key}` }
  )
  return { nombre: 'DeepSeek', status: ok ? 'ok' : 'error', latencia_ms, detalle }
}

async function checkOpenAI(): Promise<ApiHealthResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { nombre: 'OpenAI', status: 'no_configurado', latencia_ms: null, detalle: 'OPENAI_API_KEY no configurada' }

  const { ok, latencia_ms, detalle } = await ping(
    'https://api.openai.com/v1/models',
    { Authorization: `Bearer ${key}` }
  )
  return { nombre: 'OpenAI', status: ok ? 'ok' : 'error', latencia_ms, detalle }
}

async function checkAnthropic(): Promise<ApiHealthResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { nombre: 'Anthropic (Claude)', status: 'no_configurado', latencia_ms: null, detalle: 'ANTHROPIC_API_KEY no configurada' }

  const { ok, latencia_ms, detalle } = await ping(
    'https://api.anthropic.com/v1/models',
    {
      'x-api-key':       key,
      'anthropic-version': '2023-06-01',
    }
  )
  return { nombre: 'Anthropic (Claude)', status: ok ? 'ok' : 'error', latencia_ms, detalle }
}

export async function checkAllApis(): Promise<ApiHealthResult[]> {
  const results = await Promise.allSettled([
    checkDeepSeek(),
    checkOpenAI(),
    checkAnthropic(),
  ])

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    const nombres = ['DeepSeek', 'OpenAI', 'Anthropic (Claude)']
    return { nombre: nombres[i], status: 'error' as ApiStatus, latencia_ms: null, detalle: String(r.reason) }
  })
}
