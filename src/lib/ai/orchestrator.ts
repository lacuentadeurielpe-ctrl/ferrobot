// Orquestador del bot — tool-calling loop con DeepSeek
//
// Flujo:
//   1. LLM recibe system prompt + historial + mensaje del cliente + tools disponibles
//   2. LLM responde con tool_calls o con mensaje final
//   3. Si tool_calls → ejecutamos cada una (scoped a ferreteriaId) → enviamos resultado al LLM
//   4. Repetimos hasta max 5 iteraciones o hasta que no haya más tool_calls
//
// REGLA CRÍTICA: ferretería aislada
// El ferreteriaId NUNCA se expone al modelo. Se inyecta en el executor desde
// la sesión autenticada. El modelo solo conoce IDs de productos/pedidos que
// ya están scoped al tenant correcto.

import { TOOL_SCHEMAS, TOOL_EXECUTORS, type ToolContext } from './tools'

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const MODEL = 'deepseek-chat'
const MAX_ITERATIONS = 5
const TIMEOUT_MS = 25_000

export interface OrchestratorMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export interface OrchestratorResult {
  respuesta: string
  toolsUsadas: string[]
  iteraciones: number
}

interface DeepSeekChoice {
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
  }
  finish_reason: string
}

async function callDeepSeekWithTools(
  messages: OrchestratorMessage[],
  useTools: boolean
): Promise<DeepSeekChoice> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurado')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1500,
  }
  if (useTools) {
    body.tools = TOOL_SCHEMAS
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  clearTimeout(timer)

  if (!response.ok) {
    const txt = await response.text()
    throw new Error(`DeepSeek ${response.status}: ${txt.slice(0, 200)}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  if (!choice) throw new Error('DeepSeek respuesta vacía')
  return choice
}

export async function ejecutarOrquestador(
  systemPrompt: string,
  historial: Array<{ role: 'user' | 'assistant'; content: string }>,
  mensajeUsuario: string,
  ctx: ToolContext
): Promise<OrchestratorResult> {
  // Validación runtime: sin tenant no procedemos — defensa en profundidad
  if (!ctx.ferreteriaId) {
    throw new Error('TENANT_MISSING: orquestador invocado sin ferreteriaId')
  }

  const messages: OrchestratorMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historial.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: mensajeUsuario },
  ]

  const toolsUsadas: string[] = []
  let iteracion = 0

  while (iteracion < MAX_ITERATIONS) {
    iteracion++
    const choice = await callDeepSeekWithTools(messages, true)
    const { message, finish_reason } = choice

    // Empujar la respuesta del assistant al historial
    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
    })

    // Si no hay tool calls, el modelo terminó
    if (!message.tool_calls || message.tool_calls.length === 0) {
      const respuesta = (message.content ?? '').trim()
      if (!respuesta) {
        console.warn('[Orchestrator] Modelo terminó sin contenido; iteración=', iteracion)
        return { respuesta: 'Disculpe, ¿podría repetir su consulta?', toolsUsadas, iteraciones: iteracion }
      }
      return { respuesta, toolsUsadas, iteraciones: iteracion }
    }

    // Ejecutar cada tool_call en paralelo (todas scoped al mismo tenant)
    const toolResults = await Promise.all(
      message.tool_calls.map(async (tc) => {
        const name = tc.function.name
        toolsUsadas.push(name)
        const executor = TOOL_EXECUTORS[name]
        if (!executor) {
          return {
            tool_call_id: tc.id,
            name,
            content: JSON.stringify({ ok: false, error: `Tool "${name}" no existe` }),
          }
        }
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          return {
            tool_call_id: tc.id,
            name,
            content: JSON.stringify({ ok: false, error: 'Argumentos JSON inválidos' }),
          }
        }
        try {
          const result = await executor(ctx, args)
          return { tool_call_id: tc.id, name, content: JSON.stringify(result) }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[Orchestrator] Tool "${name}" falló:`, msg)
          return {
            tool_call_id: tc.id,
            name,
            content: JSON.stringify({ ok: false, error: msg }),
          }
        }
      })
    )

    // Empujar los resultados al historial para la siguiente iteración
    for (const r of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: r.tool_call_id,
        name: r.name,
        content: r.content,
      })
    }

    if (finish_reason === 'stop') break
  }

  // Si llegamos al límite sin respuesta final, forzar una última llamada sin tools
  console.warn('[Orchestrator] Max iteraciones alcanzadas — forzando respuesta final')
  const finalChoice = await callDeepSeekWithTools(messages, false)
  const respuesta = (finalChoice.message.content ?? '').trim()
  return {
    respuesta: respuesta || 'Disculpe, ¿podría repetir su consulta?',
    toolsUsadas,
    iteraciones: iteracion,
  }
}
