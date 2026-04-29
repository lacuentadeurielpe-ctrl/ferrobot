import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// ── Tipos públicos (consumidos por la página) ──────────────────────────────────

export interface DatosActualizarPrecio {
  precio_actual: number
  precio_nuevo: number
  precio_compra?: number
}
export interface DatosActualizarStock {
  stock_actual: number
  incremento: number
  stock_nuevo: number
}
export interface DatosActualizarCosto {
  precio_compra_actual: number
  precio_compra_nuevo: number
  precio_base?: number
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
  fuente?: 'vision' | 'catalogo'   // qué agente la generó
}

export interface RespuestaAgente {
  mensaje_ia: string
  acciones: AccionAgente[]
  margen_minimo?: number
  agentes_usados?: string[]
}

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface ProductoCatalogo {
  id: string
  nombre: string
  precio_base: number
  precio_compra: number
  stock: number
  activo: boolean
  categoria: string
}

interface AgentResult {
  mensaje: string
  acciones: AccionAgente[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function similitudCatalogo(a: string, b: string): number {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const ta = na.split(' ').filter(w => w.length >= 2)
  const tb = nb.split(' ').filter(w => w.length >= 2)
  if (!ta.length || !tb.length) return 0
  const comunes = ta.filter(t => tb.some(b2 => b2.includes(t) || t.includes(b2))).length
  return comunes / Math.max(ta.length, tb.length)
}

function buscarEnCatalogo(nombre: string, catalogo: ProductoCatalogo[]) {
  let mejor = 0
  let producto: ProductoCatalogo | null = null
  for (const p of catalogo) {
    const s = similitudCatalogo(nombre, p.nombre)
    if (s > mejor) { mejor = s; producto = p }
  }
  return mejor >= 0.55 ? producto : null
}

// ── Prompt del agente de catálogo (texto) ─────────────────────────────────────

function buildCatalogPrompt(catalogoCompacto: string): string {
  return `Eres el asistente de gestión de catálogo de una ferretería peruana.
El dueño te da instrucciones en español para actualizar su inventario.
Mantienes contexto de la conversación para entender referencias como "también", "ese mismo", "los de esa categoría".

CATÁLOGO ACTUAL (id | nombre | venta | costo | stock | categoría | estado):
${catalogoCompacto}

Responde SOLO con JSON válido (sin markdown) con esta estructura:
{
  "mensaje_ia": "respuesta natural en español peruano (1-3 líneas)",
  "acciones": [...]
}

Tipos de acción disponibles:

actualizar_precio → datos: { "precio_actual": number, "precio_nuevo": number, "precio_compra": number|null }
actualizar_stock  → datos: { "stock_actual": number, "incremento": number, "stock_nuevo": number }
  (incremento >0=entrada, <0=salida; "quedan X" → stock_nuevo=X, calcula incremento)
actualizar_precio_compra → datos: { "precio_compra_actual": number, "precio_compra_nuevo": number, "precio_base": number }
activar   → datos: { "estado_nuevo": true }
desactivar → datos: { "estado_nuevo": false }
nuevo_producto → datos: {
  "nombre": string, "descripcion": string|null, "categoria": string|null,
  "precio_base": number|null, "precio_compra": number|null,
  "unidad": "NIU"|"BG"|"SAC"|"MTR"|"KGM"|"LTR"|"BX"|"ROL"|"PR"|"PK"|"MTK"|"GLL"|"TNE"|"ZZ",
  "stock": number
}
bulk_precio → datos: {
  "porcentaje": number (negativo=bajada),
  "descripcion": string,
  "productos": [{ "producto_id": string, "nombre": string, "precio_actual": number, "precio_nuevo": number }]
}

REGLAS:
- Empareja con el producto más similar del catálogo (ignora tildes, mayúsculas)
- Sin coincidencia clara → nuevo_producto
- "subió/bajó/cuesta X" → precio_nuevo=X
- "llegaron/entraron X" → incremento=+X
- "quedan/ahora hay X" → stock_nuevo=X
- "sube/baja X%" → calcula precio_nuevo
- Bulk ("todos de pinturas", "toda la categoría Cemento") → bulk_precio
- Ambiguo → pregunta en mensaje_ia, acciones vacías
- INCLUYE SIEMPRE producto_id cuando existe en catálogo`
}

// ── Prompt del agente de visión (imagen) ──────────────────────────────────────

const VISION_SYSTEM_PROMPT = `Eres un especialista en análisis de documentos para ferreterías peruanas.
Analiza la imagen (puede ser factura, lista de precios, boleta, etiqueta o cualquier documento comercial).
Extrae TODOS los productos que aparezcan.

Responde SOLO con JSON (sin markdown):
{
  "mensaje": "descripción breve en español de lo que viste en la imagen (1-2 líneas)",
  "productos": [
    {
      "nombre": "nombre del producto",
      "precio_venta": number|null,
      "precio_costo": number|null,
      "cantidad": number|null,
      "unidad": "NIU|BG|SAC|MTR|KGM|LTR|BX|ROL|PR|PK|MTK|GLL|TNE|ZZ|null",
      "categoria": "categoría sugerida o null"
    }
  ]
}

REGLAS:
- precio_venta = precio de venta al cliente final
- precio_costo = precio de compra al proveedor (si está en factura/guía)
- Si hay un solo precio y parece precio de costo → precio_costo
- cantidad = stock/cantidad del ítem
- Incluye TODOS los ítems visibles, aunque tengan datos parciales
- Responde en español`

// ── Agente de visión ──────────────────────────────────────────────────────────

async function runVisionAgent(
  imagenBase64: string,
  mimeType: string,
  contextoTexto: string,
  catalogo: ProductoCatalogo[],
  apiKey: string,
): Promise<AgentResult> {
  const userContent: object[] = [
    {
      type: 'text',
      text: contextoTexto
        ? `El usuario dice: "${contextoTexto}"\n\nAnaliza la imagen adjunta y extrae todos los productos.`
        : 'Analiza esta imagen y extrae todos los productos de ferretería que puedas identificar.',
    },
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${imagenBase64}`,
        detail: 'auto',
      },
    },
  ]

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) throw new Error(`Vision agent HTTP ${res.status}`)

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content)

  const productos: {
    nombre: string
    precio_venta?: number | null
    precio_costo?: number | null
    cantidad?: number | null
    unidad?: string | null
    categoria?: string | null
  }[] = parsed.productos ?? []

  // Mapear productos extraídos a acciones
  const acciones: AccionAgente[] = productos
    .filter(p => p.nombre?.trim())
    .map((p): AccionAgente => {
      const match = buscarEnCatalogo(p.nombre, catalogo)

      if (match) {
        // Producto existe — generar acciones de actualización
        const accionesMatch: AccionAgente[] = []

        if (p.precio_venta != null && Math.abs(p.precio_venta - match.precio_base) > 0.01) {
          accionesMatch.push({
            tipo: 'actualizar_precio',
            producto_id: match.id,
            producto_nombre: match.nombre,
            datos: {
              precio_actual: match.precio_base,
              precio_nuevo: p.precio_venta,
              precio_compra: match.precio_compra || undefined,
            } satisfies DatosActualizarPrecio,
            fuente: 'vision',
          })
        }

        if (p.precio_costo != null && Math.abs(p.precio_costo - match.precio_compra) > 0.01) {
          accionesMatch.push({
            tipo: 'actualizar_precio_compra',
            producto_id: match.id,
            producto_nombre: match.nombre,
            datos: {
              precio_compra_actual: match.precio_compra,
              precio_compra_nuevo: p.precio_costo,
              precio_base: match.precio_base,
            } satisfies DatosActualizarCosto,
            fuente: 'vision',
          })
        }

        if (p.cantidad != null && p.cantidad !== match.stock) {
          accionesMatch.push({
            tipo: 'actualizar_stock',
            producto_id: match.id,
            producto_nombre: match.nombre,
            datos: {
              stock_actual: match.stock,
              incremento: p.cantidad - match.stock,
              stock_nuevo: p.cantidad,
            } satisfies DatosActualizarStock,
            fuente: 'vision',
          })
        }

        // Si el producto existe pero no hay cambios detectados, generar aviso de nuevo_producto
        if (accionesMatch.length > 0) return accionesMatch[0]
        // Si hay más de una acción, idealmente retornaríamos todas — aquí devolvemos la primera y el resto se pierde
        // Para simplicidad en este MVP retornamos solo la acción más relevante
      }

      // Producto nuevo
      return {
        tipo: 'nuevo_producto',
        producto_id: null,
        producto_nombre: p.nombre,
        datos: {
          nombre: p.nombre,
          descripcion: null,
          categoria: p.categoria ?? null,
          precio_base: p.precio_venta ?? null,
          precio_compra: p.precio_costo ?? null,
          unidad: p.unidad ?? 'NIU',
          stock: p.cantidad ?? 0,
        } satisfies DatosNuevoProducto,
        fuente: 'vision',
      }
    })

  // Expandir productos existentes con múltiples cambios
  const accionesExpandidas: AccionAgente[] = []
  for (const p of productos.filter(p => p.nombre?.trim())) {
    const match = buscarEnCatalogo(p.nombre, catalogo)
    if (!match) continue

    if (p.precio_venta != null && Math.abs(p.precio_venta - match.precio_base) > 0.01) {
      accionesExpandidas.push({
        tipo: 'actualizar_precio',
        producto_id: match.id,
        producto_nombre: match.nombre,
        datos: { precio_actual: match.precio_base, precio_nuevo: p.precio_venta, precio_compra: match.precio_compra || undefined } satisfies DatosActualizarPrecio,
        fuente: 'vision',
      })
    }
    if (p.precio_costo != null && Math.abs(p.precio_costo - match.precio_compra) > 0.01) {
      accionesExpandidas.push({
        tipo: 'actualizar_precio_compra',
        producto_id: match.id,
        producto_nombre: match.nombre,
        datos: { precio_compra_actual: match.precio_compra, precio_compra_nuevo: p.precio_costo, precio_base: match.precio_base } satisfies DatosActualizarCosto,
        fuente: 'vision',
      })
    }
    if (p.cantidad != null && p.cantidad !== match.stock) {
      accionesExpandidas.push({
        tipo: 'actualizar_stock',
        producto_id: match.id,
        producto_nombre: match.nombre,
        datos: { stock_actual: match.stock, incremento: p.cantidad - match.stock, stock_nuevo: p.cantidad } satisfies DatosActualizarStock,
        fuente: 'vision',
      })
    }
  }

  // Mezclar: primero los de la lógica expandida (productos existentes con cambios),
  // luego los nuevos productos
  const nuevos = acciones.filter(a => a.tipo === 'nuevo_producto')
  const accionesFinal = [...accionesExpandidas, ...nuevos]

  return {
    mensaje: parsed.mensaje ?? `Encontré ${accionesFinal.length} producto(s) en la imagen.`,
    acciones: accionesFinal,
  }
}

// ── Agente de catálogo (texto) ────────────────────────────────────────────────

async function runCatalogAgent(
  mensaje: string,
  historial: { role: 'user' | 'assistant'; content: string }[],
  catalogoCompacto: string,
  apiKey: string,
): Promise<AgentResult> {
  const messages = [
    { role: 'system' as const, content: buildCatalogPrompt(catalogoCompacto) },
    ...historial.slice(-8),
    { role: 'user' as const, content: mensaje },
  ]

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) throw new Error(`Catalog agent HTTP ${res.status}`)

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content) as { mensaje_ia?: string; acciones?: AccionAgente[] }

  const acciones = (parsed.acciones ?? []).map(a => ({ ...a, fuente: 'catalogo' as const }))

  return {
    mensaje: parsed.mensaje_ia ?? 'Listo.',
    acciones,
  }
}

// ── Handler principal ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const {
    mensaje       = '',
    imagen_base64,
    mime_type,
    historial     = [],
  } = body as {
    mensaje?: string
    imagen_base64?: string
    mime_type?: string
    historial?: { role: 'user' | 'assistant'; content: string }[]
  }

  const tieneTexto  = mensaje.trim().length > 0
  const tieneImagen = !!(imagen_base64 && mime_type)

  if (!tieneTexto && !tieneImagen) {
    return NextResponse.json({ error: 'Envía un mensaje o una imagen' }, { status: 400 })
  }

  // ── Cargar catálogo — FERRETERÍA AISLADA ─────────────────────────────────
  const supabase = await createClient()
  const [{ data: productos }, { data: configBot }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio_base, precio_compra, stock, activo, categorias(nombre)')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre')
      .limit(300),
    supabase
      .from('configuracion_bot')
      .select('margen_minimo_porcentaje')
      .eq('ferreteria_id', session.ferreteriaId)
      .single(),
  ])

  const margenMinimo = configBot?.margen_minimo_porcentaje ?? 10

  const catalogo: ProductoCatalogo[] = (productos ?? []).map(p => ({
    id:           p.id,
    nombre:       p.nombre,
    precio_base:  p.precio_base,
    precio_compra:p.precio_compra ?? 0,
    stock:        p.stock ?? 0,
    activo:       p.activo,
    categoria:    (p.categorias as unknown as { nombre?: string } | null)?.nombre ?? '',
  }))

  const catalogoCompacto = catalogo.map(p => {
    const costo  = p.precio_compra > 0 ? `costo:S/${p.precio_compra}` : 'sin_costo'
    const estado = p.activo ? 'activo' : 'INACTIVO'
    return `${p.id} | ${p.nombre} | venta:S/${p.precio_base} | ${costo} | stk:${p.stock} | cat:${p.categoria} | ${estado}`
  }).join('\n') || '(catálogo vacío — puedes crear nuevos productos)'

  // ── Ejecutar agentes en paralelo cuando corresponda ───────────────────────
  const agentesUsados: string[] = []
  const promesas: Promise<AgentResult>[] = []

  if (tieneImagen) {
    agentesUsados.push('vision')
    promesas.push(
      runVisionAgent(imagen_base64!, mime_type!, mensaje, catalogo, apiKey)
        .catch(err => {
          console.error('[vision agent]', err)
          return { mensaje: 'Error al analizar la imagen.', acciones: [] }
        })
    )
  }

  if (tieneTexto) {
    agentesUsados.push('catalogo')
    promesas.push(
      runCatalogAgent(mensaje, historial, catalogoCompacto, apiKey)
        .catch(err => {
          console.error('[catalog agent]', err)
          return { mensaje: 'Error al procesar el mensaje.', acciones: [] }
        })
    )
  }

  const resultados = await Promise.all(promesas)

  // ── Construir respuesta unificada ─────────────────────────────────────────
  let mensajeIA: string
  let acciones: AccionAgente[] = []

  if (resultados.length === 1) {
    mensajeIA = resultados[0].mensaje
    acciones  = resultados[0].acciones
  } else {
    // Ambos agentes corrieron — construir mensaje combinado
    const [visionResult, catalogoResult] = resultados
    const partes: string[] = []
    if (visionResult.acciones.length > 0)  partes.push(`📷 ${visionResult.mensaje}`)
    if (catalogoResult.acciones.length > 0) partes.push(`📝 ${catalogoResult.mensaje}`)
    if (partes.length === 0) partes.push(catalogoResult.mensaje)
    mensajeIA = partes.join('\n')
    acciones  = [...visionResult.acciones, ...catalogoResult.acciones]
  }

  const respuesta: RespuestaAgente = {
    mensaje_ia:    mensajeIA,
    acciones,
    margen_minimo: margenMinimo,
    agentes_usados: agentesUsados,
  }

  return NextResponse.json(respuesta)
}
