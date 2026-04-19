// Módulo de IA para extracción inteligente de productos del catálogo
// Modo texto: deepseek-chat | Modo imagen: OCR (ocr.space) → deepseek-chat

import { UNIDADES_SUNAT, normalizarUnidad, CODIGOS_SUNAT } from '@/lib/constantes/unidades'

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
const MODEL_TEXTO = 'deepseek-chat'
const TIMEOUT_MS = 40_000
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY ?? 'helloworld'

export interface ProductoExtraido {
  nombre: string | null
  descripcion: string | null
  categoria: string | null
  precio_base: number | null    // precio de venta al cliente
  precio_compra: number | null  // costo al proveedor (si viene en factura)
  unidad: string | null
  stock: number | null
}

/** Texto de unidades para el prompt: "NIU (Unidad), BX (Caja), ..." */
const UNIDADES_PARA_PROMPT = UNIDADES_SUNAT
  .map((u) => `${u.code} (${u.label})`)
  .join(', ')

const SYSTEM_PROMPT = `Eres un asistente especializado en ferreterías peruanas.
Tu tarea es extraer información de productos desde texto o imágenes.

Responde SIEMPRE con JSON válido con esta estructura exacta:
{
  "mensaje": "descripción breve y natural de lo que entendiste (max 2 oraciones)",
  "productos": [
    {
      "nombre": "nombre del producto o null si no está claro",
      "descripcion": "descripción breve o null",
      "categoria": "categoría sugerida o null (ej: Cemento, Pinturas, Fierro, Herramientas)",
      "precio_base": número o null,
      "precio_compra": número o null,
      "unidad": "código SUNAT de la unidad (ver lista) o null si no está claro",
      "stock": número entero o null
    }
  ]
}

UNIDADES VÁLIDAS — usa EXACTAMENTE el código SUNAT (columna izquierda):
${UNIDADES_PARA_PROMPT}

Ejemplos de mapeo:
- "unidad", "und", "pieza", "pza", "varilla", "tubo", "balde", "plancha" → NIU
- "caja", "cajas" → BX
- "bolsa", "bolsas" → BG
- "saco", "sacos" → SAC
- "rollo", "rollos" → ROL
- "par", "pares" → PR
- "paquete" → PK
- "metro", "metros", "m" → MTR
- "metro cuadrado", "m2" → MTK
- "metro cúbico", "m3" → MTQ
- "kilo", "kg", "kilogramo" → KGM
- "gramo", "gr", "g" → GRM
- "tonelada", "tn" → TNE
- "litro", "lt", "l" → LTR
- "mililitro", "ml" → MLT
- "galón", "galon" → GLL
- "servicio", "serv" → ZZ
- "hora", "hr" → HUR
- "día", "dia" → DAY

REGLAS:
- Extrae TODOS los productos que identifiques
- Si un campo no está claro, pon null — no inventes datos
- precio_base es lo que el cliente paga; precio_compra es el costo al proveedor (si viene en factura)
- Los precios siempre son en soles peruanos (S/)
- Si el texto dice "actualiza" o "subió a", ese es el nuevo precio_base
- El campo "unidad" DEBE ser uno de los códigos SUNAT listados arriba o null
- Responde en español`

async function llamarDeepSeekCatalog(
  mensajes: { role: 'system' | 'user'; content: string }[]
): Promise<{ mensaje: string; productos: ProductoExtraido[] }> {
  const apiKey = process.env.DEEPSEEK_CATALOG_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_CATALOG_API_KEY no configurado')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_TEXTO,
        messages: mensajes,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`DeepSeek error ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const contenido = data.choices?.[0]?.message?.content
    if (!contenido) throw new Error('Respuesta vacía de DeepSeek')

    const parsed = JSON.parse(contenido)
    return {
      mensaje: parsed.mensaje ?? 'Analicé el contenido y encontré los siguientes productos:',
      productos: (parsed.productos ?? []).map(normalizarProducto),
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── OCR con ocr.space ─────────────────────────────────────────────────────────
async function extraerTextoDeImagen(base64: string, mimeType: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = new URLSearchParams({
      base64Image: `data:${mimeType};base64,${base64}`,
      language: 'spa',
      isOverlayRequired: 'false',
      detectOrientation: 'true',
      scale: 'true',
      OCREngine: '2',
    })

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': OCR_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) throw new Error(`OCR error ${response.status}`)

    const data = await response.json()
    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] ?? 'Error al procesar la imagen con OCR')
    }

    const texto = (data.ParsedResults ?? [])
      .map((r: { ParsedText: string }) => r.ParsedText)
      .join('\n')
      .trim()

    if (!texto) throw new Error('No se pudo extraer texto de la imagen')
    return texto
  } finally {
    clearTimeout(timer)
  }
}

function normalizarProducto(p: Partial<ProductoExtraido>): ProductoExtraido {
  // El modelo debería devolver códigos SUNAT directamente, pero por si acaso
  // devuelve un nombre en español, normalizarUnidad() lo convierte al código correcto.
  const unidadRaw = p.unidad?.trim() ?? null
  let unidadFinal: string | null = null
  if (unidadRaw) {
    const normalizada = normalizarUnidad(unidadRaw)
    // normalizarUnidad devuelve UNIDAD_DEFAULT ('NIU') si no reconoce el valor,
    // así que solo la aceptamos si el valor original ya era un código válido o
    // si la normalización cambió algo (i.e. no dejamos un 'NIU' de fallback silencioso
    // para valores completamente inválidos).
    unidadFinal = CODIGOS_SUNAT.has(unidadRaw.toUpperCase())
      ? unidadRaw.toUpperCase()
      : (normalizada !== 'NIU' || unidadRaw.toLowerCase().match(/^(unidad|und|pza|pieza|unid|plancha|varilla|tubo|balde|cilindro|bidon)$/)
          ? normalizada
          : null)
  }

  return {
    nombre: p.nombre?.trim() || null,
    descripcion: p.descripcion?.trim() || null,
    categoria: p.categoria?.trim() || null,
    precio_base: typeof p.precio_base === 'number' && p.precio_base >= 0 ? p.precio_base : null,
    precio_compra: typeof p.precio_compra === 'number' && p.precio_compra >= 0 ? p.precio_compra : null,
    unidad: unidadFinal,
    stock: typeof p.stock === 'number' && p.stock >= 0 ? Math.floor(p.stock) : null,
  }
}

// ── Modo texto libre ──────────────────────────────────────────────────────────
export async function analizarTexto(texto: string) {
  return llamarDeepSeekCatalog([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Extrae los productos de este mensaje:\n\n"${texto}"`,
    },
  ])
}

// ── Modo imagen: OCR → DeepSeek chat ─────────────────────────────────────────
export async function analizarImagen(base64: string, mimeType: string) {
  const textoOCR = await extraerTextoDeImagen(base64, mimeType)

  return llamarDeepSeekCatalog([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Extrae los productos de este texto obtenido por OCR de una imagen (puede ser factura, lista de precios, etiqueta o cualquier documento de ferretería):\n\n"${textoOCR}"`,
    },
  ])
}
