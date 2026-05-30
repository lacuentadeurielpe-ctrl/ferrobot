import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

// ── Mime types de Excel ────────────────────────────────────────────────────────
const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/excel',
  'application/x-excel',
  'application/x-msexcel',
])

// ── Convierte un buffer de Excel en texto tabular ──────────────────────────────
async function excelToText(buffer: Buffer<ArrayBufferLike>, nombreArchivo: string): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(ab as any)
  const lineas: string[] = [`[Archivo: ${nombreArchivo}]`]

  wb.eachSheet(sheet => {
    if (sheet.rowCount === 0) return
    lineas.push(`\n[Hoja: ${sheet.name}]`)
    sheet.eachRow({ includeEmpty: false }, row => {
      const celdas: string[] = []
      row.eachCell({ includeEmpty: false }, cell => {
        const v = cell.value
        if (v === null || v === undefined) { celdas.push(''); return }
        if (typeof v === 'object' && 'text' in v)   { celdas.push(String((v as {text:unknown}).text ?? '')); return }
        if (typeof v === 'object' && 'result' in v) { celdas.push(String((v as {result:unknown}).result ?? '')); return }
        if (v instanceof Date) { celdas.push(v.toLocaleDateString('es-PE')); return }
        celdas.push(String(v))
      })
      if (celdas.some(c => c.trim())) lineas.push(celdas.join(' | '))
    })
  })

  return lineas.join('\n')
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// ── Tipos públicos ─────────────────────────────────────────────────────────────

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

export interface OpcionCandidato {
  id: string
  nombre: string
  precio_base: number
  stock: number
}

export interface AccionAgente {
  tipo: TipoAccion
  producto_id?: string | null
  producto_nombre: string
  datos: DatosActualizarPrecio | DatosActualizarStock | DatosActualizarCosto | DatosToggle | DatosNuevoProducto | DatosBulkPrecio
  fuente?: 'vision' | 'catalogo'
  opciones?: OpcionCandidato[] // <-- Nuevo: Opciones para desambiguar
}

export interface RespuestaAgente {
  mensaje_ia: string
  acciones: AccionAgente[]
  margen_minimo?: number
  agentes_usados?: string[]
}

interface AgentResult {
  mensaje: string
  acciones: AccionAgente[]
}

// ── Búsqueda de Productos (Tool) ───────────────────────────────────────────────
async function buscarProductosTool(ferreteriaId: string, consultas: string[]) {
  const supabase = await createClient()
  const resultados: Record<string, OpcionCandidato[]> = {}
  
  for (const q of consultas) {
    if (!q.trim()) continue
    // Buscar difusamente en el nombre
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, precio_base, stock')
      .eq('ferreteria_id', ferreteriaId)
      .ilike('nombre', `%${q}%`)
      .limit(5)
    
    resultados[q] = data ?? []
  }
  return resultados
}

// ── Prompt del Agente de Catálogo ──────────────────────────────────────────────
const CATALOG_SYSTEM_PROMPT = `Eres el asistente de inventario de una ferretería peruana.
Tu objetivo es interpretar lo que el usuario pide y convertirlo en acciones estructuradas de catálogo.

FLUJO DE TRABAJO (Multiagente):
1. Si el usuario te pide modificar, buscar o actualizar productos, TIENES que llamar a la herramienta \`buscar_productos_db\` pasando una lista de términos de búsqueda ("consultas") clave extraídos de su mensaje o documento. Por ejemplo si dice "el cemento sol bajó a 25 y el clavo a 4", tus consultas deben ser ["cemento sol", "clavo"].
2. Si el usuario pide crear algo nuevo y es OVBIO que es nuevo ("agrega un martillo truper azul a 30 soles"), puedes llamar a la herramienta de todas formas para verificar si ya existe.
3. Tras recibir el resultado de la herramienta, debes armar el JSON final.

FORMATO FINAL (Responde SIEMPRE con JSON sin markdown cuando termines tu flujo):
{
  "mensaje_ia": "respuesta natural en español peruano (1-3 líneas)",
  "acciones": [...]
}

IMPORTANTE:
Si hay ambigüedad (la herramienta encontró varios productos parecidos y no estás seguro cuál es), pon el \`producto_id\` como nulo (o escoge el mejor si es obvio) y LLENA el arreglo \`opciones\` dentro de la acción con los candidatos devueltos por la herramienta, para que el usuario pueda elegir en la interfaz.

TIPOS DE ACCIÓN PERMITIDOS: actualizar_precio, actualizar_stock, actualizar_precio_compra, activar, desactivar, nuevo_producto, bulk_precio.
`

// ── Agente de Catálogo (Texto con Herramientas) ──────────────────────────────
async function runCatalogAgent(
  mensaje: string,
  historial: { role: 'user' | 'assistant'; content: string }[],
  ferreteriaId: string,
  apiKey: string,
): Promise<AgentResult> {
  let currentMessages: any[] = [
    { role: 'system', content: CATALOG_SYSTEM_PROMPT },
    ...historial.slice(-8),
    { role: 'user', content: mensaje },
  ]

  let turnos = 0
  while (turnos < 4) {
    turnos++
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: currentMessages,
        temperature: 0.1,
        max_tokens: 2500,
        tools: [
          {
            type: 'function',
            function: {
              name: 'buscar_productos_db',
              description: 'Busca productos en la base de datos de la ferretería por nombre.',
              parameters: {
                type: 'object',
                properties: {
                  consultas: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista de nombres cortos o palabras clave para buscar.'
                  }
                },
                required: ['consultas']
              }
            }
          }
        ],
        tool_choice: 'auto'
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new Error(`Catalog agent HTTP ${res.status}`)
    const data = await res.json()
    const message = data.choices[0].message
    currentMessages.push(message)

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'buscar_productos_db') {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            const result = await buscarProductosTool(ferreteriaId, args.consultas || [])
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            })
          } catch (e: any) {
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: 'Tool parsing failed' })
            })
          }
        }
      }
      continue // Next iteration of loop to let model use the tool result
    }

    // No tool calls = final JSON
    let parsed: any = {}
    try {
      // Sometimes the model might wrap it in markdown despite instructions
      let text = message.content ?? '{}'
      text = text.replace(/^```json/g, '').replace(/```$/g, '').trim()
      parsed = JSON.parse(text)
    } catch {
      return { mensaje: 'Error al interpretar la respuesta de la IA.', acciones: [] }
    }

    const TIPOS_VALIDOS: TipoAccion[] = [
      'actualizar_precio', 'actualizar_stock', 'actualizar_precio_compra',
      'activar', 'desactivar', 'nuevo_producto', 'bulk_precio',
    ]
    const acciones = (parsed.acciones ?? [])
      .filter((a: any) => TIPOS_VALIDOS.includes(a.tipo))
      .map((a: any) => ({ ...a, fuente: 'catalogo' as const }))

    return { mensaje: parsed.mensaje_ia ?? 'Listo.', acciones }
  }

  return { mensaje: 'El agente tardó demasiado en pensar.', acciones: [] }
}

// ── Agente de Visión (Simplificado para integrarse) ───────────────────────────
async function runVisionAgent(
  imagenBase64: string,
  mimeType: string,
  contextoTexto: string,
  ferreteriaId: string,
  apiKey: string,
): Promise<AgentResult> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Extrae todos los productos de la imagen en formato JSON: { "productos": [{ "nombre": string, "precio": number }] }` },
        {
          role: 'user', content: [
            { type: 'text', text: contextoTexto ? `El usuario dice: "${contextoTexto}"` : 'Extrae productos' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imagenBase64}`, detail: 'auto' } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(30_000)
  })

  if (!res.ok) throw new Error('Vision error')
  const data = await res.json()
  const content = JSON.parse(data.choices[0].message.content ?? '{}')
  const productos = content.productos ?? []

  // Pasar el resultado al agente de catálogo principal para que use la herramienta de DB y busque esos productos extraídos
  const queryToCatalog = `He extraído esta lista de productos de una imagen, por favor búscalos en BD y crea las acciones correspondientes:\n` + JSON.stringify(productos, null, 2)
  return runCatalogAgent(queryToCatalog, [], ferreteriaId, apiKey)
}

// ── Handler principal ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const {
    mensaje        = '',
    imagen_base64,
    mime_type,
    texto_documento,
    nombre_archivo  = 'archivo',
    historial      = [],
  } = body

  const esImagen = !!(imagen_base64 && mime_type && mime_type.startsWith('image/'))
  const esExcel  = !!(imagen_base64 && mime_type && EXCEL_MIMES.has(mime_type))
  let textoDocumento = texto_documento?.trim() ?? ''

  if (esExcel && imagen_base64) {
    try {
      const buffer  = Buffer.from(imagen_base64, 'base64')
      const parsed  = await excelToText(buffer, nombre_archivo)
      textoDocumento = parsed + (textoDocumento ? '\n\n' + textoDocumento : '')
    } catch (err) {
      console.error('[excel parse]', err)
      textoDocumento = `[No se pudo leer ${nombre_archivo}]`
    }
  }

  // Fragmentación (Chunking) básica si el excel es inmenso, lo limitamos a las primeras 300 lineas por ahora para MVP
  if (textoDocumento.split('\n').length > 300) {
    textoDocumento = textoDocumento.split('\n').slice(0, 300).join('\n') + '\n...[Trunco por tamaño, por favor sube por partes]'
  }

  const mensajeCatalogo = [
    textoDocumento ? `[Documento adjunto]:\n${textoDocumento}` : '',
    mensaje.trim(),
  ].filter(Boolean).join('\n\n')

  const tieneTexto  = mensajeCatalogo.length > 0
  const tieneImagen = esImagen

  if (!tieneTexto && !tieneImagen) {
    return NextResponse.json({ error: 'Envía un mensaje, imagen o documento' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: configBot } = await supabase.from('configuracion_bot').select('margen_minimo_porcentaje').eq('ferreteria_id', session.ferreteriaId).single()
  const margenMinimo = configBot?.margen_minimo_porcentaje ?? 10

  const agentesUsados: string[] = []
  const promesas: Promise<AgentResult>[] = []

  if (tieneImagen) {
    agentesUsados.push('vision')
    promesas.push(
      runVisionAgent(imagen_base64, mime_type, mensaje, session.ferreteriaId, apiKey)
        .catch(err => {
          console.error('[vision agent]', err)
          return { mensaje: 'Error al analizar la imagen.', acciones: [] }
        })
    )
  }

  if (tieneTexto && !tieneImagen) {
    agentesUsados.push(esExcel || textoDocumento ? 'documento' : 'catalogo')
    promesas.push(
      runCatalogAgent(mensajeCatalogo, historial, session.ferreteriaId, apiKey)
        .catch(err => {
          console.error('[catalog agent]', err)
          return { mensaje: 'Error al procesar el mensaje.', acciones: [] }
        })
    )
  }

  const resultados = await Promise.all(promesas)

  let mensajeIA: string
  let acciones: AccionAgente[] = []

  if (resultados.length === 1) {
    mensajeIA = resultados[0].mensaje
    acciones  = resultados[0].acciones
  } else {
    const [visionResult, textoResult] = resultados
    mensajeIA = [visionResult.mensaje, textoResult.mensaje].filter(Boolean).join('\n')
    acciones  = [...visionResult.acciones, ...(textoResult?.acciones || [])]
  }

  const respuesta: RespuestaAgente = {
    mensaje_ia:    mensajeIA,
    acciones,
    margen_minimo: margenMinimo,
    agentes_usados: agentesUsados,
  }

  return NextResponse.json(respuesta)
}
