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
import { generarYEnviarComprobante, eliminarComprobantePedido } from '@/lib/pdf/generar-comprobante'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  supabase: SupabaseClient
  ferreteriaId: string
  conversacionId: string
  clienteId: string
  productos: Producto[]   // catálogo ya cargado (evita refetch por tool call)
  /** Ventana de gracia configurada (en minutos) para agregar_a_pedido_reciente */
  ventanaGraciaMinutos?: number
  /** api_key de YCloud del tenant (para regenerar y reenviar comprobante) */
  ycloudApiKey?: string
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  /** Motivo estructurado de fallo (para que el modelo distinga casos) */
  motivo?: string
  /** Mensaje orientativo para el modelo en caso de fallo controlado */
  mensaje?: string
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
      name: 'agregar_a_pedido_reciente',
      description:
        'Intenta agregar productos a un pedido recién confirmado del cliente (ventana de gracia). ' +
        'Úsalo SOLO cuando el cliente pide explícitamente agregar algo ("agrega X", "olvidé Y", "también X"). ' +
        'La tool valida automáticamente que el pedido esté dentro de la ventana de tiempo, no despachado ' +
        'y sin comprobante tributario emitido. Si no se puede agregar, devuelve motivo y el bot ' +
        'debe proponer crear un pedido nuevo.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Productos a agregar al pedido reciente.',
            items: {
              type: 'object',
              properties: {
                nombre_buscado: { type: 'string' },
                cantidad:       { type: 'number' },
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
      name: 'sugerir_complementario',
      description:
        'Busca productos complementarios para lo que el cliente está comprando. ' +
        'Úsalo SOLO después de una cotización exitosa, cuando el cliente ya tiene productos en su lista. ' +
        'Devuelve 0, 1 o 2 sugerencias como máximo — si no hay nada realmente complementario, devuelve vacío. ' +
        'IMPORTANTE: solo sugerir si la tool devuelve resultados; nunca inventar complementarios propios.',
      parameters: {
        type: 'object',
        properties: {
          producto_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs de los productos que el cliente ya tiene en esta cotización.',
          },
        },
        required: ['producto_ids'],
      },
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

// Extrae tokens significativos de una lista de nombres de productos
// (>3 chars, sin tildes, solo alfanumérico)
function tokenizarProductos(nombres: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const nombre of nombres) {
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3)
      .forEach((t) => tokens.add(t))
  }
  return tokens
}

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

  agregar_a_pedido_reciente: async (ctx, args) => {
    requireTenant(ctx)
    const items = args.items as Array<{ nombre_buscado: string; cantidad: number }> | undefined
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: 'items vacío' }
    }
    const ventanaMin = ctx.ventanaGraciaMinutos ?? 30

    // ── Criterio 1: buscar el pedido más reciente del cliente en estado editable
    const { data: pedidoRaw } = await ctx.supabase
      .from('pedidos')
      .select(
        'id, numero_pedido, total, estado, estado_pago, modalidad, created_at, ' +
        'modificaciones_count, nombre_cliente, direccion_entrega, items_pedido(*)'
      )
      .eq('ferreteria_id', ctx.ferreteriaId)   // FERRETERÍA AISLADA
      .eq('cliente_id', ctx.clienteId)
      .in('estado', ['confirmado', 'en_preparacion'])  // Criterio 2: no despachado ni cancelado
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const pedido = pedidoRaw as unknown as {
      id: string
      numero_pedido: string
      total: number
      estado: string
      estado_pago: string | null
      modalidad: string
      created_at: string
      modificaciones_count: number | null
      items_pedido: Array<Record<string, unknown>>
    } | null

    if (!pedido) {
      return {
        ok: false,
        motivo: 'sin_pedido_editable',
        mensaje: 'No encontré un pedido reciente editable. Sugiere crear un pedido nuevo.',
      }
    }

    // ── Criterio 3: ventana de tiempo (30 min default)
    const minutosTranscurridos = (Date.now() - new Date(pedido.created_at).getTime()) / 60000
    if (minutosTranscurridos > ventanaMin) {
      return {
        ok: false,
        motivo: 'fuera_de_ventana',
        mensaje: `El pedido ${pedido.numero_pedido} ya tiene ${Math.round(minutosTranscurridos)} min. Sugiere crear un pedido nuevo para lo adicional.`,
      }
    }

    // ── Criterio 4: no hay comprobante tributario ya emitido (estado_pago = pagado)
    if (pedido.estado_pago === 'pagado') {
      return {
        ok: false,
        motivo: 'pedido_pagado',
        mensaje: `El pedido ${pedido.numero_pedido} ya fue pagado, con comprobante emitido. Sugiere crear un pedido nuevo para lo adicional.`,
      }
    }

    // ── Procesar los items a agregar (fuzzy search + cálculo de precios)
    const { data: configBot } = await ctx.supabase
      .from('configuracion_bot')
      .select('umbral_monto_negociacion')
      .eq('ferreteria_id', ctx.ferreteriaId)   // FERRETERÍA AISLADA
      .single()

    const resultados = procesarItemsSolicitados(
      items,
      ctx.productos,
      (configBot as { umbral_monto_negociacion?: number } | null)?.umbral_monto_negociacion
    )

    const productoCostoMap = new Map(ctx.productos.map((p) => [p.id, p.precio_compra ?? 0]))
    const itemsActuales = pedido.items_pedido ?? []
    const agregados: Array<{ nombre: string; cantidad: number; precio: number; subtotal: number }> = []

    for (const r of resultados) {
      if (!r.disponible || !r.producto) continue

      const existente = itemsActuales.find((i) => (i.producto_id as string) === r.producto!.id)
      if (existente) {
        // Ya está en el pedido → sumar cantidad
        const nuevaCantidad = (existente.cantidad as number) + r.cantidad
        const nuevoSubtotal = r.precio_unitario * nuevaCantidad
        await ctx.supabase
          .from('items_pedido')
          .update({
            cantidad: nuevaCantidad,
            precio_unitario: r.precio_unitario,
            subtotal: nuevoSubtotal,
          })
          .eq('id', existente.id as string)
        agregados.push({
          nombre: r.producto.nombre,
          cantidad: r.cantidad,
          precio: r.precio_unitario,
          subtotal: r.precio_unitario * r.cantidad,
        })
      } else {
        // Nuevo item
        await ctx.supabase.from('items_pedido').insert({
          pedido_id:       pedido.id,
          producto_id:     r.producto.id,
          nombre_producto: r.producto.nombre,
          unidad:          r.producto.unidad,
          cantidad:        r.cantidad,
          precio_unitario: r.precio_unitario,
          subtotal:        r.subtotal,
          costo_unitario:  productoCostoMap.get(r.producto.id) ?? 0,
        })
        agregados.push({
          nombre: r.producto.nombre,
          cantidad: r.cantidad,
          precio: r.precio_unitario,
          subtotal: r.subtotal,
        })
      }
    }

    if (agregados.length === 0) {
      return {
        ok: false,
        motivo: 'productos_no_encontrados',
        mensaje: 'No encontré esos productos en el catálogo. Verifica los nombres.',
      }
    }

    // ── Recalcular total del pedido
    const { data: itemsFinal } = await ctx.supabase
      .from('items_pedido')
      .select('subtotal, cantidad, costo_unitario')
      .eq('pedido_id', pedido.id)

    const nuevoTotal = (itemsFinal ?? []).reduce((s, i) => s + (i.subtotal as number), 0)
    const nuevoCosto = (itemsFinal ?? []).reduce(
      (s, i) => s + ((i.costo_unitario as number) ?? 0) * (i.cantidad as number),
      0
    )

    await ctx.supabase
      .from('pedidos')
      .update({
        total: nuevoTotal,
        costo_total: nuevoCosto,
        modificado_post_confirmacion_at: new Date().toISOString(),
        modificaciones_count: (pedido.modificaciones_count ?? 0) + 1,
      })
      .eq('id', pedido.id)
      .eq('ferreteria_id', ctx.ferreteriaId)   // FERRETERÍA AISLADA

    // ── Regenerar nota de venta (borrar la anterior + generar nueva)
    try {
      await eliminarComprobantePedido(pedido.id, ctx.ferreteriaId)
      await generarYEnviarComprobante({
        pedidoId:     pedido.id,
        ferreteriaId: ctx.ferreteriaId,
        esProforma:   false,
        ycloudApiKey: ctx.ycloudApiKey,
      })
    } catch (e) {
      console.error('[agregar_a_pedido_reciente] Error regenerando comprobante:', e)
      // No abortar — los items ya fueron agregados
    }

    return {
      ok: true,
      data: {
        pedido_numero: pedido.numero_pedido,
        nuevo_total: nuevoTotal,
        items_agregados: agregados,
        comprobante_regenerado: true,
      },
    }
  },

  sugerir_complementario: async (ctx, args) => {
    requireTenant(ctx)
    const productoIds = args.producto_ids as string[] | undefined
    if (!Array.isArray(productoIds) || productoIds.length === 0) {
      return { ok: true, data: { sugerencias: [] } }
    }

    // Obtener datos de los productos que el cliente está comprando
    // (para el filtro contextual de relevancia)
    const productosActuales = ctx.productos.filter((p) => productoIds.includes(p.id))
    const categoriasActuales = new Set(productosActuales.map((p) => p.categoria_id).filter(Boolean))
    const tokensActuales = tokenizarProductos(productosActuales.map((p) => p.nombre))

    // Buscar pares complementarios configurados (manual primero, luego auto)
    const { data: pares, error } = await ctx.supabase
      .from('productos_complementarios')
      .select('complementario_id, tipo, frecuencia')
      .eq('ferreteria_id', ctx.ferreteriaId)   // FERRETERÍA AISLADA
      .in('producto_id', productoIds)
      .eq('activo', true)
      .order('tipo', { ascending: true })       // 'auto' < 'manual' alfabéticamente — manual va primero con desc
      .order('frecuencia', { ascending: false })

    if (error || !pares || pares.length === 0) {
      return { ok: true, data: { sugerencias: [] } }
    }

    // Filtrar complementarios que ya están en la cotización actual
    const idsYaEnCotizacion = new Set(productoIds)
    const candidatos = pares.filter((p) => !idsYaEnCotizacion.has(p.complementario_id))

    if (candidatos.length === 0) {
      return { ok: true, data: { sugerencias: [] } }
    }

    // Obtener datos de los candidatos (con stock y categoría)
    const idsCanditatos = [...new Set(candidatos.map((c) => c.complementario_id))]
    const complementariosInfo = ctx.productos.filter(
      (p) => idsCanditatos.includes(p.id) && p.activo && p.stock > 0
    )

    // ── FILTRO DE RELEVANCIA CONTEXTUAL ─────────────────────────────────────
    // Un complementario pasa el filtro si:
    //   (a) es tipo 'manual' — el dueño ya validó la relación, confiamos
    //   (b) misma categoría que algún producto en la cotización actual
    //   (c) comparte al menos 1 token significativo (>3 chars) con algún producto en cotización
    // Este filtro previene sugerencias random aunque el modelo las detecte como frecuentes.
    const candidatosFiltrados = complementariosInfo.filter((comp) => {
      const parOrigen = candidatos.find((c) => c.complementario_id === comp.id)
      if (!parOrigen) return false

      // (a) Par manual: el dueño lo aprobó explícitamente → pasa siempre
      if (parOrigen.tipo === 'manual') return true

      // (b) Misma categoría
      if (comp.categoria_id && categoriasActuales.has(comp.categoria_id)) return true

      // (c) Token compartido — ej: "arena" aparece en "cemento + arena" y "arena fina"
      const tokensComp = [...tokenizarProductos([comp.nombre])]
      const hayTokenComun = tokensComp.some((t) => tokensActuales.has(t))
      if (hayTokenComun) return true

      return false
    })

    if (candidatosFiltrados.length === 0) {
      return { ok: true, data: { sugerencias: [] } }
    }

    // Máximo 2 sugerencias — ordenar: manuales primero, luego por frecuencia
    const ordenados = candidatosFiltrados
      .map((comp) => {
        const par = candidatos.find((c) => c.complementario_id === comp.id)!
        return { comp, tipo: par.tipo, frecuencia: par.frecuencia }
      })
      .sort((a, b) => {
        if (a.tipo === 'manual' && b.tipo !== 'manual') return -1
        if (a.tipo !== 'manual' && b.tipo === 'manual') return 1
        return b.frecuencia - a.frecuencia
      })
      .slice(0, 2)

    const sugerencias = ordenados.map(({ comp }) => ({
      id:             comp.id,
      nombre:         comp.nombre,
      precio_unitario: comp.precio_base,
      unidad:         comp.unidad,
      stock:          comp.stock,
    }))

    return { ok: true, data: { sugerencias } }
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
