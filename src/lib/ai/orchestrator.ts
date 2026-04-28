// Orquestador del bot — tool-calling loop con Claude (primario) + DeepSeek (fallback)
//
// Flujo:
//   1. LLM recibe system prompt + historial + mensaje del cliente + tools disponibles
//   2. LLM responde con tool_calls / tool_use o con mensaje final
//   3. Si usa tools → ejecutamos cada una (scoped a ferreteriaId) → enviamos resultado al LLM
//   4. Repetimos hasta max 5 iteraciones o hasta que no haya más tool calls
//
// Motor primario: Claude (claude-3-5-haiku-20241022) cuando ANTHROPIC_API_KEY está presente.
// Motor fallback: DeepSeek (deepseek-chat) con OpenAI-compatible tool calling.
//
// REGLA CRÍTICA: ferretería aislada
// El ferreteriaId NUNCA se expone al modelo. Se inyecta en el executor desde
// la sesión autenticada. El modelo solo conoce IDs de productos/pedidos que
// ya están scoped al tenant correcto.

import { TOOL_SCHEMAS, TOOL_EXECUTORS, type ToolContext } from './tools'
import { withTimeout } from '@/lib/utils'

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const DEEPSEEK_MODEL = 'deepseek-chat'
const CLAUDE_MODEL   = 'claude-3-5-haiku-20241022'
const MAX_ITERATIONS = 8
const TIMEOUT_MS     = 28_000
const TOOL_TIMEOUT_MS = 9_000   // cada tool tiene 9s antes de devolver error
const RETRY_WAIT_MS   = 800    // espera antes del único reintento en 429/503

export interface OrchestratorResult {
  respuesta: string
  toolsUsadas: string[]
  iteraciones: number
  motor: 'claude' | 'deepseek'
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE tool-calling
// ─────────────────────────────────────────────────────────────────────────────

// Convert OpenAI-style tool schemas → Anthropic format (input_schema)
function toAnthropicTools(schemas: typeof TOOL_SCHEMAS) {
  return schemas.map((s) => ({
    name:         s.function.name,
    description:  s.function.description,
    input_schema: (s.function as unknown as { parameters: unknown }).parameters,
  }))
}

type AnthropicContentBlock =
  | { type: 'text';     text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type AnthropicMessage =
  | { role: 'user';      content: string | Array<{ type: 'tool_result'; tool_use_id: string; content: string }> }
  | { role: 'assistant'; content: AnthropicContentBlock[] }

interface AnthropicResponse {
  content:     AnthropicContentBlock[]
  stop_reason: 'tool_use' | 'end_turn' | string
}

async function callClaudeOnce(
  system:   string,
  messages: AnthropicMessage[],
  useTools: boolean
): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const body: Record<string, unknown> = {
    model:      CLAUDE_MODEL,
    system,
    messages,
    max_tokens: 2048,
  }
  if (useTools) {
    body.tools       = toAnthropicTools(TOOL_SCHEMAS)
    body.tool_choice = { type: 'auto' }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body:   JSON.stringify(body),
    signal: controller.signal,
  })
  clearTimeout(timer)

  if (!response.ok) {
    const txt = await response.text()
    throw new Error(`Anthropic ${response.status}: ${txt.slice(0, 300)}`)
  }

  return response.json() as Promise<AnthropicResponse>
}

// Retry único en 429/503 (rate limit o servicio temporalmente no disponible)
async function callClaude(
  system:   string,
  messages: AnthropicMessage[],
  useTools: boolean
): Promise<AnthropicResponse> {
  try {
    return await callClaudeOnce(system, messages, useTools)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('429') || msg.includes('503') || msg.includes('529')) {
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS))
      return callClaudeOnce(system, messages, useTools)
    }
    throw e
  }
}

async function ejecutarOrquestadorClaude(
  systemPrompt: string,
  historial:    Array<{ role: 'user' | 'assistant'; content: string }>,
  mensajeUsuario: string,
  ctx: ToolContext
): Promise<OrchestratorResult> {
  // Build initial message array (Anthropic format)
  const messages: AnthropicMessage[] = [
    ...historial.map((m): AnthropicMessage => {
      if (m.role === 'user') return { role: 'user', content: m.content }
      return { role: 'assistant', content: [{ type: 'text', text: m.content }] }
    }),
    { role: 'user', content: mensajeUsuario },
  ]

  const toolsUsadas: string[] = []
  let iteracion = 0

  while (iteracion < MAX_ITERATIONS) {
    iteracion++
    const resp = await callClaude(systemPrompt, messages, true)

    // Extract text and tool_use blocks
    const toolUseBlocks = resp.content.filter((b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> =>
      b.type === 'tool_use'
    )
    const textBlocks = resp.content.filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> =>
      b.type === 'text'
    )

    // Append assistant turn to messages
    messages.push({ role: 'assistant', content: resp.content })

    // No tools used → model finished
    if (resp.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      const respuesta = textBlocks.map((b) => b.text).join('').trim()
      if (!respuesta) {
        console.warn('[Orchestrator/Claude] Respuesta vacía; iteracion=', iteracion)
        return { respuesta: 'Disculpe, ¿podría repetir su consulta?', toolsUsadas, iteraciones: iteracion, motor: 'claude' }
      }
      return { respuesta, toolsUsadas, iteraciones: iteracion, motor: 'claude' }
    }

    // Execute tools in parallel — cada una con timeout propio de TOOL_TIMEOUT_MS
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (tc) => {
        const name = tc.name
        toolsUsadas.push(name)
        const executor = TOOL_EXECUTORS[name]
        if (!executor) {
          return { tool_use_id: tc.id, content: JSON.stringify({ ok: false, error: `Tool "${name}" no existe` }) }
        }
        try {
          const result = await withTimeout(TOOL_TIMEOUT_MS, executor(ctx, tc.input))
          return { tool_use_id: tc.id, content: JSON.stringify(result) }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const esTimeout = msg.startsWith('timeout_')
          if (esTimeout) {
            console.warn(`[Orchestrator/Claude] Tool "${name}" timeout conv=${ctx.conversacionId}`)
          } else {
            console.error(`[Orchestrator/Claude] Tool "${name}" error conv=${ctx.conversacionId}:`, msg)
          }
          return {
            tool_use_id: tc.id,
            content: JSON.stringify({
              ok: false,
              error: esTimeout
                ? `La herramienta "${name}" tardó demasiado. Intenta una consulta más simple.`
                : msg,
            }),
          }
        }
      })
    )

    // Append tool results as a single user message (Anthropic spec)
    messages.push({
      role:    'user',
      content: toolResults.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.tool_use_id, content: r.content })),
    })
  }

  // Max iteraciones alcanzadas — respuesta canned para no hacer una llamada LLM adicional
  // (esa llamada podría empujar sobre el límite de 60s de Vercel)
  console.warn(`[Orchestrator/Claude] Max iteraciones (${MAX_ITERATIONS}) conv=${ctx.conversacionId} tools=${toolsUsadas.join(',')}`)
  return {
    respuesta: 'Tuve dificultades procesando tu consulta completa. ¿Podrías preguntarme algo más específico? 🙏',
    toolsUsadas,
    iteraciones: iteracion,
    motor: 'claude',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEEPSEEK tool-calling (fallback)
// ─────────────────────────────────────────────────────────────────────────────

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

interface DeepSeekChoice {
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  }
  finish_reason: string
}

async function callDeepSeekOnce(
  messages: DeepSeekMessage[],
  useTools: boolean
): Promise<DeepSeekChoice> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurado')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: 0.3,
    max_tokens:  1500,
  }
  if (useTools) {
    body.tools       = TOOL_SCHEMAS
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:   JSON.stringify(body),
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

// Retry único en 429/503 — DeepSeek tiene rate limits frecuentes en horas pico
async function callDeepSeek(
  messages: DeepSeekMessage[],
  useTools: boolean
): Promise<DeepSeekChoice> {
  try {
    return await callDeepSeekOnce(messages, useTools)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('429') || msg.includes('503') || msg.includes('529')) {
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS))
      return callDeepSeekOnce(messages, useTools)
    }
    throw e
  }
}

async function ejecutarOrquestadorDeepSeek(
  systemPrompt: string,
  historial:    Array<{ role: 'user' | 'assistant'; content: string }>,
  mensajeUsuario: string,
  ctx: ToolContext
): Promise<OrchestratorResult> {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historial.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: mensajeUsuario },
  ]

  const toolsUsadas: string[] = []
  let iteracion = 0

  while (iteracion < MAX_ITERATIONS) {
    iteracion++
    const choice = await callDeepSeek(messages, true)
    const { message, finish_reason } = choice

    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
    })

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const respuesta = (message.content ?? '').trim()
      if (!respuesta) return { respuesta: 'Disculpe, ¿podría repetir su consulta?', toolsUsadas, iteraciones: iteracion, motor: 'deepseek' }
      return { respuesta, toolsUsadas, iteraciones: iteracion, motor: 'deepseek' }
    }

    // Ejecutar tools con timeout propio
    const toolResults = await Promise.all(
      message.tool_calls.map(async (tc) => {
        const name = tc.function.name
        toolsUsadas.push(name)
        const executor = TOOL_EXECUTORS[name]
        if (!executor) return { tool_call_id: tc.id, name, content: JSON.stringify({ ok: false, error: `Tool "${name}" no existe` }) }
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* noop */ }
        try {
          const result = await withTimeout(TOOL_TIMEOUT_MS, executor(ctx, args))
          return { tool_call_id: tc.id, name, content: JSON.stringify(result) }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const esTimeout = msg.startsWith('timeout_')
          if (esTimeout) {
            console.warn(`[Orchestrator/DeepSeek] Tool "${name}" timeout conv=${ctx.conversacionId}`)
          } else {
            console.error(`[Orchestrator/DeepSeek] Tool "${name}" error conv=${ctx.conversacionId}:`, msg)
          }
          return {
            tool_call_id: tc.id,
            name,
            content: JSON.stringify({
              ok: false,
              error: esTimeout
                ? `La herramienta "${name}" tardó demasiado. Intenta una consulta más simple.`
                : msg,
            }),
          }
        }
      })
    )

    for (const r of toolResults) {
      messages.push({ role: 'tool', tool_call_id: r.tool_call_id, name: r.name, content: r.content })
    }

    if (finish_reason === 'stop') break
  }

  // Max iteraciones alcanzadas — respuesta canned
  console.warn(`[Orchestrator/DeepSeek] Max iteraciones (${MAX_ITERATIONS}) conv=${ctx.conversacionId} tools=${toolsUsadas.join(',')}`)
  return {
    respuesta: 'Tuve dificultades procesando tu consulta completa. ¿Podrías preguntarme algo más específico? 🙏',
    toolsUsadas,
    iteraciones: iteracion,
    motor: 'deepseek',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto de entrada principal — Claude primero, DeepSeek como fallback
// ─────────────────────────────────────────────────────────────────────────────

export async function ejecutarOrquestador(
  systemPrompt:    string,
  historial:       Array<{ role: 'user' | 'assistant'; content: string }>,
  mensajeUsuario:  string,
  ctx: ToolContext
): Promise<OrchestratorResult> {
  // Validación runtime: sin tenant no procedemos — defensa en profundidad
  if (!ctx.ferreteriaId) {
    throw new Error('TENANT_MISSING: orquestador invocado sin ferreteriaId')
  }

  const t0 = Date.now()

  // Intentar Claude cuando la API key está disponible
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await ejecutarOrquestadorClaude(systemPrompt, historial, mensajeUsuario, ctx)
      console.log(
        `[Orchestrator] motor=claude conv=${ctx.conversacionId} tools=${result.toolsUsadas.join(',') || 'ninguna'} iter=${result.iteraciones} ms=${Date.now() - t0}`
      )
      return result
    } catch (e) {
      console.error(
        `[Orchestrator] Claude error conv=${ctx.conversacionId} ms=${Date.now() - t0} — usando DeepSeek:`,
        e instanceof Error ? e.message : e
      )
    }
  }

  // Fallback a DeepSeek
  const result = await ejecutarOrquestadorDeepSeek(systemPrompt, historial, mensajeUsuario, ctx)
  console.log(
    `[Orchestrator] motor=deepseek conv=${ctx.conversacionId} tools=${result.toolsUsadas.join(',') || 'ninguna'} iter=${result.iteraciones} ms=${Date.now() - t0}`
  )
  return result
}
