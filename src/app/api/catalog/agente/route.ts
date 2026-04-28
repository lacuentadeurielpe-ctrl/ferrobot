import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface DatosActualizarPrecio {
  precio_actual: number
  precio_nuevo: number
  precio_compra?: number   // para mostrar margen en la card
}
export interface DatosActualizarStock {
  stock_actual: number
  incremento: number       // positivo = entrada, negativo = salida, 0 = seteo absoluto
  stock_nuevo: number
}
export interface DatosActualizarCosto {
  precio_compra_actual: number
  precio_compra_nuevo: number
  precio_base?: number     // para mostrar margen
}
export interface DatosToggle { estado_nuevo: boolean }
export interface DatosNuevoProducto {
  nombre: string
  descripcion: string | null
  categoria: string | null
  precio_base: number | null
  precio_compra: number | null
  unidad: string
  stock: number
}
export interface DatosBulkPrecio {
  porcentaje: number
  descripcion: string
  productos: { producto_id: string; nombre: string; precio_actual: number; precio_nuevo: number }[]
}

export type TipoAccion =
  | 'actualizar_precio'
  | 'actualizar_stock'
  | 'actualizar_precio_compra'
  | 'activar'
  | 'desactivar'
  | 'nuevo_producto'
  | 'bulk_precio'

export interface AccionAgente {
  tipo: TipoAccion
  producto_id?: string | null
  producto_nombre: string
  datos: DatosActualizarPrecio | DatosActualizarStock | DatosActualizarCosto | DatosToggle | DatosNuevoProducto | DatosBulkPrecio
}

export interface RespuestaAgente {
  mensaje_ia: string
  acciones: AccionAgente[]
  margen_minimo?: number
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(catalogoCompacto: string): string {
  return `Eres el asistente de gestión de catálogo de una ferretería peruana (Byignis).
El dueño te da instrucciones en español para actualizar su inventario.

CATÁLOGO ACTUAL (id | nombre | venta | costo | stock | categoría | estado):
${catalogoCompacto}

Responde SIEMPRE con JSON válido con esta estructura exacta — sin texto adicional:
{
  "mensaje_ia": "confirmación breve en español peruano (1-2 líneas máximo)",
  "acciones": [ ... ]
}

Cada acción tiene la forma:
{
  "tipo": "<ver tipos abajo>",
  "producto_id": "uuid si existe en catálogo, null si es nuevo",
  "producto_nombre": "nombre legible para mostrar",
  "datos": { ... según tipo ... }
}

TIPOS Y SUS "datos":

actualizar_precio → { "precio_actual": number, "precio_nuevo": number, "precio_compra": number|null }
actualizar_stock  → { "stock_actual": number, "incremento": number, "stock_nuevo": number }
  (incremento >0 = entrada, <0 = salida; si dice "quedan X" → incremento = X - stock_actual)
actualizar_precio_compra → { "precio_compra_actual": number, "precio_compra_nuevo": number, "precio_base": number }
activar   → { "estado_nuevo": true }
desactivar → { "estado_nuevo": false }
nuevo_producto → {
  "nombre": string, "descripcion": string|null, "categoria": string|null,
  "precio_base": number|null, "precio_compra": number|null,
  "unidad": "NIU"|"BG"|"SAC"|"MTR"|"KGM"|"LTR"|"BX"|"ROL"|"PR"|"PK",
  "stock": number
}
bulk_precio → {
  "porcentaje": number (negativo = bajada),
  "descripcion": "ej: +10% categoría Pinturas",
  "productos": [{ "producto_id": string, "nombre": string, "precio_actual": number, "precio_nuevo": number }]
}

UNIDADES — usa el código SUNAT:
NIU=unidad/pieza/varilla/tubo, BG=bolsa, SAC=saco, MTR=metro, MTK=m2, KGM=kilo/kg,
LTR=litro/galón, BX=caja, ROL=rollo, PR=par, PK=paquete

REGLAS:
- Empareja el producto del usuario con el más similar en el catálogo (ignora tildes, mayúsculas)
- Si no hay coincidencia → tipo "nuevo_producto"
- "llegaron X" / "entraron X" → incremento = +X
- "quedan X" / "ahora hay X" → stock_nuevo = X (calcula incremento)
- "subió a X" / "bajó a X" / "cuesta X" → precio_nuevo = X
- "sube/baja X%" → calcula precio_nuevo con ese porcentaje
- Para bulk ("todos los de pinturas", "toda la categoría") → tipo bulk_precio con lista de productos
- Si la acción es ambigua → prefiere preguntar en mensaje_ia y devuelve acciones vacías
- SIEMPRE incluye producto_id cuando el producto existe en el catálogo`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const mensaje: string = body.mensaje ?? ''
  if (!mensaje.trim()) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })

  const supabase = await createClient()

  const [{ data: productos }, { data: configBot }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio_base, precio_compra, stock, activo, categorias(nombre)')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', session.ferreteriaId)
      .single(),
  ])

  const margenMinimo = configBot?.margen_minimo_porcentaje ?? 10

  if (!productos?.length) {
    return NextResponse.json({
      mensaje_ia: '¡Tu catálogo está vacío! Agrega productos primero desde "Nuevo producto" o "Extracción IA".',
      acciones: [],
      margen_minimo: margenMinimo,
    })
  }

  // Catálogo compacto para el contexto del modelo
  const catalogoCompacto = productos.map((p) => {
    const cat    = (p.categorias as unknown as { nombre?: string } | null)?.nombre ?? ''
    const costo  = p.precio_compra > 0 ? `costo:S/${p.precio_compra}` : 'sin_costo'
    const estado = p.activo ? 'activo' : 'INACTIVO'
    return `${p.id} | ${p.nombre} | venta:S/${p.precio_base} | ${costo} | stk:${p.stock} | cat:${cat} | ${estado}`
  }).join('\n')

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(catalogoCompacto) },
        { role: 'user',   content: mensaje },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.error('[agente] OpenAI error:', err)
    return NextResponse.json({ error: 'Error al procesar con IA' }, { status: 502 })
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'

  let parsed: RespuestaAgente
  try {
    parsed = JSON.parse(content)
  } catch {
    return NextResponse.json({ error: 'La IA devolvió una respuesta inválida' }, { status: 500 })
  }

  parsed.margen_minimo = margenMinimo
  return NextResponse.json(parsed)
}
