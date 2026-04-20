// Tools del orquestador — OpenAI-compatible function calling
//
// REGLA CRÍTICA: ferretería aislada
// Cada tool recibe ferreteriaId como primer parámetro y lo valida en runtime.
// Nunca confiamos en que el modelo lo pase; el orquestador lo inyecta desde
// la sesión autenticada. Si por alguna razón llega vacío → throw y se aborta.
//
// Todas las queries filtran explícitamente por ferreteria_id aunque usemos
// admin client. Esto es defensa en profundidad.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Producto } from '@/types/database'
import { procesarItemsSolicitados } from '@/lib/bot/catalog-search'
import { pausarBot } from '@/lib/bot/session'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  supabase: SupabaseClient
  ferreteriaId: string
  conversacionId: string
  clienteId: string
  productos: Producto[]   // catálogo ya cargado (evita refetch por tool call)
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
}

// Validación obligatoria: toda tool debe tener ferreteriaId
function requireTenant(ctx: ToolContext): void {
  if (!ctx.ferreteriaId || typeof ctx.ferreteriaId !== 'string') {
    throw new Error('TENANT_MISSING: tool invoked without ferreteriaId')
  }
}

// ── Schemas (OpenAI-compatible JSON schema) ─────────────────────────────────
// Estos schemas se envían a DeepSeek en el parámetro `tools`.

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'buscar_producto',
      description:
        'Busca uno o varios productos en el catálogo de la ferretería. ' +
        'Úsalo cuando el cliente mencione productos por nombre para saber si existen, ' +
        'qué precio tienen y cuánto stock hay. Soporta búsqueda aproximada (fuzzy).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Lista de productos a buscar con cantidades.',
            items: {
              type: 'object',
              properties: {
                nombre_buscado: { type: 'string', description: 'Nombre del producto tal como lo dijo el cliente.' },
                cantidad:       { type: 'number', description: 'Cantidad deseada. Usa 1 si el cliente no especificó.' },
              },
              required: ['nombre_buscado', 'cantidad'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_stock',
      description:
        'Consulta el stock actual de un producto específico por ID. ' +
        'Úsalo solo después de buscar_producto cuando necesites stock en tiempo real.',
      parameters: {
        type: 'object',
        properties: {
          producto_id: { type: 'string', description: 'UUID del producto.' },
        },
        required: ['producto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_pedido',
      description:
        'Consulta el estado de un pedido del cliente actual. ' +
        'Si numero_pedido no se pasa, retorna los pedidos más recientes del cliente.',
      parameters: {
        type: 'object',
        properties: {
          numero_pedido: { type: 'string', description: 'Número de pedido (ej: PED-0001). Opcional.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_ferreteria',
      description:
        'Devuelve información de la ferretería: horario, dirección, métodos de pago, zonas de delivery. ' +
        'Úsalo cuando el cliente pregunte por horarios, ubicación, cómo pagar o si hacen delivery.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'historial_cliente',
      description:
        'Devuelve el perfil del cliente (lo que ya sabemos de él) y sus últimos pedidos. ' +
        'Úsalo cuando sea útil recordar qué suele comprar, su modalidad preferida o su zona. ' +
        'IMPORTANTE: este contexto es PASIVO — no se lo menciones al cliente a menos que él ' +
        'traiga el tema primero (ej: no digas "¿como siempre, 4 bolsas de cemento?").',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_dato_cliente',
      description:
        'Guarda un dato del cliente que él mismo mencionó EXPLÍCITAMENTE. ' +
        'Solo úsalo si la confianza es alta (el cliente lo dijo claramente, no inferido). ' +
        'Ejemplos válidos: "soy maestro de obra", "estoy construyendo mi casa", ' +
        '"vivo en San Juan de Lurigancho". No lo uses para datos de contacto ni para inventar.',
      parameters: {
        type: 'object',
        properties: {
          campo: {
            type: 'string',
            enum: ['tipo_cliente', 'obra_actual', 'zona_habitual', 'modalidad_preferida'],
            description: 'Campo del perfil a actualizar.',
          },
          valor: { type: 'string', description: 'Valor explícito mencionado por el cliente.' },
        },
        required: ['campo', 'valor'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalar_humano',
      description:
        'Pausa el bot y notifica al dueño para que atienda manualmente. ' +
        'Úsalo SOLO cuando el cliente pida explícitamente hablar con una persona, ' +
        'o cuando haya una queja/reclamo serio que no puedes resolver.',
      parameters: {
        type: 'object',
        properties: {
          razon: { type: 'string', description: 'Razón breve del escalamiento.' },
        },
        required: ['razon'],
      },
    },
  },
] as const

// ── Executors ────────────────────────────────────────────────────────────────

type Executor = (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>

export const TOOL_EXECUTORS: Record<string, Executor> = {

  buscar_producto: async (ctx, args) => {
    requireTenant(ctx)
    const items = args.items as Array<{ nombre_buscado: string; cantidad: number }> | undefined
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: 'items vacío' }
    }
    const resultados = procesarItemsSolicitados(items, ctx.productos)
    const resumen = resultados.map((r) => ({
      nombre_buscado: r.nombre_buscado,
      cantidad_solicitada: r.cantidad,
      encontrado: !!r.producto,
      producto_id: r.producto?.id ?? null,
      nombre_catalogo: r.producto?.nombre ?? null,
      unidad: r.producto?.unidad ?? null,
      precio_unitario: r.precio_unitario,
      stock: r.stock_disponible,
      disponible: r.disponible,
      nota: r.nota,
      requiere_aprobacion: r.requiere_aprobacion,
    }))
    return { ok: true, data: { resultados: resumen } }
  },

  obtener_stock: async (ctx, args) => {
    requireTenant(ctx)
    const productoId = args.producto_id as string
    if (!productoId) return { ok: false, error: 'producto_id requerido' }

    // Filtra por ferreteria_id aunque el ID sea UUID — defensa en profundidad
    const { data, error } = await ctx.supabase
      .from('productos')
      .select('id, nombre, unidad, stock, precio_base')
      .eq('id', productoId)
      .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
      .eq('activo', true)
      .single()

    if (error || !data) return { ok: false, error: 'Producto no encontrado en esta ferretería' }
    return { ok: true, data }
  },

  consultar_pedido: async (ctx, args) => {
    requireTenant(ctx)
    const numeroPedido = (args.numero_pedido as string | undefined)?.toUpperCase()

    let query = ctx.supabase
      .from('pedidos')
      .select('numero_pedido, estado, estado_pago, modalidad, total, created_at')
      .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
      .eq('cliente_id', ctx.clienteId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (numeroPedido) query = query.eq('numero_pedido', numeroPedido)

    const { data, error } = await query
    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) {
      return { ok: true, data: { pedidos: [], mensaje: 'Sin pedidos previos a nombre del cliente.' } }
    }
    return { ok: true, data: { pedidos: data } }
  },

  info_ferreteria: async (ctx) => {
    requireTenant(ctx)
    const [{ data: ferreteria }, { data: zonas }] = await Promise.all([
      ctx.supabase
        .from('ferreterias')
        .select('nombre, direccion, horario_apertura, horario_cierre, dias_atencion, metodos_pago_activos')
        .eq('id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
        .single(),
      ctx.supabase
        .from('zonas_delivery')
        .select('nombre, tiempo_estimado_min')
        .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
        .eq('activo', true),
    ])
    if (!ferreteria) return { ok: false, error: 'Ferretería no encontrada' }
    return { ok: true, data: { ferreteria, zonas_delivery: zonas ?? [] } }
  },

  historial_cliente: async (ctx) => {
    requireTenant(ctx)
    const [{ data: cliente }, { data: pedidos }] = await Promise.all([
      ctx.supabase
        .from('clientes')
        .select('nombre, perfil')
        .eq('id', ctx.clienteId)
        .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
        .single(),
      ctx.supabase
        .from('pedidos')
        .select('numero_pedido, modalidad, total, estado, created_at, items_pedido(nombre_producto, cantidad)')
        .eq('cliente_id', ctx.clienteId)
        .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    return {
      ok: true,
      data: {
        perfil: cliente?.perfil ?? {},
        nombre: cliente?.nombre ?? null,
        pedidos_recientes: pedidos ?? [],
      },
    }
  },

  guardar_dato_cliente: async (ctx, args) => {
    requireTenant(ctx)
    const campo = args.campo as string
    const valor = (args.valor as string | undefined)?.trim()
    const camposPermitidos = ['tipo_cliente', 'obra_actual', 'zona_habitual', 'modalidad_preferida']
    if (!campo || !camposPermitidos.includes(campo)) {
      return { ok: false, error: 'campo no permitido' }
    }
    if (!valor || valor.length < 2 || valor.length > 200) {
      return { ok: false, error: 'valor inválido' }
    }

    // Merge JSONB sin pisar el resto del perfil
    const { data: clienteActual } = await ctx.supabase
      .from('clientes')
      .select('perfil')
      .eq('id', ctx.clienteId)
      .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA
      .single()

    const perfilActual = (clienteActual?.perfil ?? {}) as Record<string, unknown>
    const perfilNuevo = { ...perfilActual, [campo]: valor }

    const { error } = await ctx.supabase
      .from('clientes')
      .update({ perfil: perfilNuevo })
      .eq('id', ctx.clienteId)
      .eq('ferreteria_id', ctx.ferreteriaId)  // FERRETERÍA AISLADA

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { guardado: { [campo]: valor } } }
  },

  escalar_humano: async (ctx, args) => {
    requireTenant(ctx)
    const razon = (args.razon as string) || 'solicitud del cliente'
    await pausarBot(ctx.supabase, ctx.conversacionId)
    console.log(`[Orchestrator] escalar_humano conv=${ctx.conversacionId} razón="${razon}"`)
    return { ok: true, data: { pausado: true, razon } }
  },
}
