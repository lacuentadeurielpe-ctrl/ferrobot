import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analizarTexto, analizarImagen, type ProductoExtraido } from '@/lib/ai/catalog-ai'
import { getSessionInfo } from '@/lib/auth/roles'

export interface ProductoParaConfirmar extends ProductoExtraido {
  // Match con producto existente en BD
  accion: 'crear' | 'actualizar'
  producto_existente_id: string | null
  producto_existente_nombre: string | null
}

export interface RespuestaExtraccion {
  mensaje_ia: string
  productos: ProductoParaConfirmar[]
}

// Normaliza texto para comparación: minúsculas, sin tildes, sin espacios extra
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Calcula similitud simple entre dos strings normalizados
// Retorna true si uno contiene al otro o tienen alta coincidencia de palabras
function esSimilar(a: string, b: string): boolean {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true

  // Coincidencia por palabras clave (>= 60% de palabras en común)
  const palabrasA = new Set(na.split(' ').filter((p) => p.length > 2))
  const palabrasB = new Set(nb.split(' ').filter((p) => p.length > 2))
  if (palabrasA.size === 0 || palabrasB.size === 0) return false

  let coincidencias = 0
  for (const p of palabrasA) {
    if (palabrasB.has(p)) coincidencias++
  }

  const menorTamano = Math.min(palabrasA.size, palabrasB.size)
  return coincidencias / menorTamano >= 0.6
}

// POST /api/catalog/ai-extract
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()

  const body = await request.json()
  const { modo, texto, imagen_base64, mime_type } = body as {
    modo: 'texto' | 'imagen'
    texto?: string
    imagen_base64?: string
    mime_type?: string
  }

  // Validar input
  if (modo === 'texto' && !texto?.trim()) {
    return NextResponse.json({ error: 'Escribe algo para que la IA analice' }, { status: 400 })
  }
  if (modo === 'imagen' && (!imagen_base64 || !mime_type)) {
    return NextResponse.json({ error: 'Imagen inválida' }, { status: 400 })
  }

  // Llamar a DeepSeek
  let resultado: { mensaje: string; productos: ProductoExtraido[] }
  try {
    resultado = modo === 'imagen'
      ? await analizarImagen(imagen_base64!, mime_type!)
      : await analizarTexto(texto!)
  } catch (err) {
    console.error('[AI Extract]', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json(
      { error: `Error al analizar con IA: ${msg}` },
      { status: 500 }
    )
  }

  if (resultado.productos.length === 0) {
    return NextResponse.json(
      { error: 'No se encontraron productos en el contenido enviado' },
      { status: 422 }
    )
  }

  // Cargar productos existentes para fuzzy matching
  const { data: productosExistentes } = await supabase
    .from('productos')
    .select('id, nombre')
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('activo', true)

  // Hacer match de cada producto extraído contra los existentes
  const productosConMatch: ProductoParaConfirmar[] = resultado.productos.map((p) => {
    if (!p.nombre) {
      return { ...p, accion: 'crear', producto_existente_id: null, producto_existente_nombre: null }
    }

    const match = (productosExistentes ?? []).find((e) => esSimilar(p.nombre!, e.nombre))

    return {
      ...p,
      accion: match ? 'actualizar' : 'crear',
      producto_existente_id: match?.id ?? null,
      producto_existente_nombre: match?.nombre ?? null,
    }
  })

  const respuesta: RespuestaExtraccion = {
    mensaje_ia: resultado.mensaje,
    productos: productosConMatch,
  }

  return NextResponse.json(respuesta)
}
