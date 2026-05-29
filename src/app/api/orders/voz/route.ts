import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { normalizeSearchText } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ProductoCatalogo {
  id: string
  nombre: string
  unidad: string
  precio_base: number
  precio_compra: number
  stock: number
}

export interface ItemParseado {
  nombre_buscado: string        // lo que dijo el usuario
  cantidad: number
  unidad: string
  // tras el matching con el catálogo:
  producto_id: string | null
  nombre_producto: string       // nombre oficial del catálogo (o nombre_buscado si no matchea)
  precio_unitario: number       // precio del catálogo (o 0 si no matchea)
  costo_unitario: number
  confianza: 'exacto' | 'aproximado' | 'manual'
}

export interface PedidoParseado {
  items: ItemParseado[]
  nombre_cliente: string
  telefono_cliente: string
  modalidad: 'recojo' | 'delivery'
  direccion_entrega: string | null
  notas: string | null
  advertencias: string[]
}

// ── Helpers de normalización y búsqueda difusa ────────────────────────────────

function getLevenshteinDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 999
  const tmp: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return tmp[a.length][b.length]
}

const STOP_WORDS = new Set(['de', 'con', 'en', 'para', 'un', 'la', 'el', 'los', 'las', 'y', 'x'])

function similaridad(a: string, b: string): number {
  const normA = normalizeSearchText(a)
  const normB = normalizeSearchText(b)

  if (!normA || !normB) return 0
  if (normA === normB) return 1

  const tokensA = normA.split(/\s+/).filter(t => t.length > 0)
  const tokensB = normB.split(/\s+/).filter(t => t.length > 0)

  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const filteredA = tokensA.length > 1 ? tokensA.filter(t => !STOP_WORDS.has(t)) : tokensA
  const filteredB = tokensB.length > 1 ? tokensB.filter(t => !STOP_WORDS.has(t)) : tokensB

  let matchCount = 0

  for (const tA of filteredA) {
    let bestTokenMatch = 0

    for (const tB of filteredB) {
      if (tA === tB) {
        bestTokenMatch = 1
        break
      }
      // Evita falsos positivos como que "1/2" coincida con "2"
      if (tB.startsWith(tA)) {
        bestTokenMatch = Math.max(bestTokenMatch, 0.8)
      }
      if (tA.length >= 4 && tB.length >= 4) {
        const dist = getLevenshteinDistance(tA, tB)
        if (dist <= 1) {
          bestTokenMatch = Math.max(bestTokenMatch, 0.75)
        } else if (dist <= 2 && tA.length >= 6) {
          bestTokenMatch = Math.max(bestTokenMatch, 0.6)
        }
      }
    }
    matchCount += bestTokenMatch
  }

  return matchCount / filteredA.length
}

function matchearProducto(
  nombreBuscado: string,
  catalogo: ProductoCatalogo[]
): { producto: ProductoCatalogo | null; confianza: 'exacto' | 'aproximado' | 'manual' } {
  let mejorScore = 0
  let mejorProducto: ProductoCatalogo | null = null

  for (const p of catalogo) {
    const score = similaridad(nombreBuscado, p.nombre)
    if (score > mejorScore) {
      mejorScore = score
      mejorProducto = p
    }
  }

  if (mejorScore >= 0.95) return { producto: mejorProducto, confianza: 'exacto' }
  if (mejorScore >= 0.70) return { producto: mejorProducto, confianza: 'aproximado' }
  return { producto: null, confianza: 'manual' }
}

// ── Llamada a DeepSeek ────────────────────────────────────────────────────────

interface RawItemIA {
  nombre_buscado: string
  cantidad: number
  unidad?: string
}

interface RawPedidoIA {
  items: RawItemIA[]
  nombre_cliente: string
  telefono_cliente: string
  modalidad: 'recojo' | 'delivery'
  direccion_entrega: string | null
  notas: string | null
}

async function parsearConIA(transcript: string): Promise<RawPedidoIA | null> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  if (!DEEPSEEK_API_KEY) return null

  const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'

  const systemPrompt = `Eres un asistente de punto de venta para ferreterías en Perú.
Extrae del dictado de voz los datos del pedido y responde ÚNICAMENTE con JSON válido (sin markdown).
El JSON debe tener exactamente esta estructura:
{
  "items": [
    { "nombre_buscado": "string", "cantidad": number, "unidad": "string" }
  ],
  "nombre_cliente": "string",
  "telefono_cliente": "string (solo dígitos, sin espacios ni guiones)",
  "modalidad": "recojo" | "delivery",
  "direccion_entrega": "string | null",
  "notas": "string | null"
}
Reglas:
- Si no menciona modalidad, asume "recojo"
- Si no menciona cliente, usa cadena vacía ""
- Si no menciona teléfono, usa cadena vacía ""
- Normaliza unidades: bolsa, saco, und, m, ml, kg, lt, par, caja, rollo, plancha, tubo, varilla, etc.
- Si la cantidad no está clara, asume 1
- Extrae TODOS los productos mencionados aunque sean similares`

  const res = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Dictado: "${transcript}"` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) return null

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const parsed = JSON.parse(content) as RawPedidoIA
    return parsed
  } catch {
    return null
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { transcript } = body as { transcript?: string }

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'Transcript vacío' }, { status: 400 })
  }

  // ── Cargar catálogo de ESTA ferretería únicamente (ferretería aislada) ──────
  const supabase = await createClient()
  const { data: catalogo, error: errCat } = await supabase
    .from('productos')
    .select('id, nombre, unidad, precio_base, precio_compra, stock')
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('activo', true)
    .order('nombre')

  if (errCat) {
    return NextResponse.json({ error: 'Error cargando catálogo' }, { status: 500 })
  }

  const productos = (catalogo ?? []) as ProductoCatalogo[]

  // ── Parsear transcript con IA ─────────────────────────────────────────────
  const rawPedido = await parsearConIA(transcript)

  if (!rawPedido) {
    return NextResponse.json(
      { error: 'No se pudo interpretar el dictado. Verifica que DEEPSEEK_API_KEY esté configurado.' },
      { status: 422 }
    )
  }

  // ── Hacer matching de productos con el catálogo ───────────────────────────
  const advertencias: string[] = []

  const items: ItemParseado[] = (rawPedido.items ?? []).map((rawItem) => {
    const { producto, confianza } = matchearProducto(rawItem.nombre_buscado, productos)

    if (confianza === 'manual') {
      advertencias.push(`"${rawItem.nombre_buscado}" no encontrado en el catálogo — verifica el precio`)
    }

    return {
      nombre_buscado: rawItem.nombre_buscado,
      cantidad: Math.max(1, rawItem.cantidad ?? 1),
      unidad: producto?.unidad ?? rawItem.unidad ?? 'und',
      producto_id: producto?.id ?? null,
      nombre_producto: producto?.nombre ?? rawItem.nombre_buscado,
      precio_unitario: producto?.precio_base ?? 0,
      costo_unitario: producto?.precio_compra ?? 0,
      confianza,
    }
  })

  if (items.length === 0) {
    advertencias.push('No se detectaron productos en el dictado')
  }

  const resultado: PedidoParseado = {
    items,
    nombre_cliente: rawPedido.nombre_cliente ?? '',
    telefono_cliente: rawPedido.telefono_cliente ?? '',
    modalidad: rawPedido.modalidad === 'delivery' ? 'delivery' : 'recojo',
    direccion_entrega: rawPedido.direccion_entrega ?? null,
    notas: rawPedido.notas ?? null,
    advertencias,
  }

  return NextResponse.json(resultado)
}
