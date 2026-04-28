// Tools del orquestador — OpenAI/Anthropic compatible function calling
//
// REGLA CRÍTICA: ferretería aislada
// Cada tool recibe ferreteriaId como primer parámetro y lo valida en runtime.
// Nunca confiamos en que el modelo lo pase; el orquestador lo inyecta desde
// la sesión autenticada.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Producto, ZonaDelivery, DatosFlujoPedido, AgentesActivos } from '@/types/database'
import { procesarItemsSolicitados, buscarProducto, formatearCotizacion } from '@/lib/bot/catalog-search'
import { pausarBot } from '@/lib/bot/session'
import { generarYEnviarComprobante, eliminarComprobantePedido } from '@/lib/pdf/generar-comprobante'
import { emitirBoleta, emitirFactura } from '@/lib/comprobantes/emitir'
import { consultarRuc, validarFormatoRuc } from '@/lib/sunat/ruc'
import { enviarMensaje, enviarDocumento, enviarImagen } from '@/lib/whatsapp/ycloud'
import { withTimeout } from '@/lib/utils'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ToolContext {
  supabase: SupabaseClient
  ferreteriaId: string
  conversacionId: string
  clienteId: string
  telefonoCliente: string
  productos: Producto[]
  zonas: ZonaDelivery[]
  datosFlujo: DatosFlujoPedido | null
  ventanaGraciaMinutos?: number
  ycloudApiKey?: string
  agentesActivos?: AgentesActivos   // F4: si undefined → todo activo
  umbralUpsellSoles?: number        // F5: monto mínimo de cotización para activar upsell (0 = siempre)
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  motivo?: string
  mensaje?: string
}

function requireTenant(ctx: ToolContext): void {
  if (!ctx.ferreteriaId || typeof ctx.ferreteriaId !== 'string') {
    throw new Error('TENANT_MISSING: tool invoked without ferreteriaId')
  }
}

// ── Schemas (OpenAI/DeepSeek compatible) ──────────────────────────────────

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'buscar_producto',
      description:
        'Busca uno o varios productos en el catálogo de la ferretería. ' +
        'Úsalo cuando el cliente mencione productos por nombre para saber si existen, ' +
        'qué precio tienen y cuánto stock hay. Soporta búsqueda aproximada.',
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
                cantidad:       { type: 'number', description: 'Cantidad deseada. Usa 1 si no especificó.' },
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
      name: 'guardar_cotizacion',
      description:
        'Guarda la cotización en la base de datos después de buscar los productos. ' +
        'Llámala SIEMPRE después de buscar_producto cuando el cliente pide precios formales o quiere cotizar. ' +
        'Esto genera el registro en BD y prepara el flujo para la confirmación del pedido.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Items de la cotización con los datos devueltos por buscar_producto.',
            items: {
              type: 'object',
              properties: {
                producto_id:     { type: 'string',  description: 'UUID del producto (de buscar_producto).' },
                nombre_producto: { type: 'string',  description: 'Nombre del producto en catálogo.' },
                unidad:          { type: 'string',  description: 'Unidad de medida.' },
                cantidad:        { type: 'number',  description: 'Cantidad solicitada.' },
                precio_unitario: { type: 'number',  description: 'Precio por unidad.' },
                subtotal:        { type: 'number',  description: 'precio_unitario × cantidad.' },
                no_disponible:   { type: 'boolean', description: 'true si el producto no tiene stock.' },
                nota:            { type: 'string',  description: 'Nota del sistema (stock parcial, etc.).' },
              },
              required: ['nombre_producto', 'unidad', 'cantidad', 'precio_unitario', 'subtotal'],
            },
          },
          requiere_aprobacion: {
            type: 'boolean',
            description: 'true si algún item requiere aprobación del encargado por precio especial.',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_pedido',
      description:
        'Crea el pedido definitivo en la base de datos. ' +
        'Llámala SOLO cuando ya tienes: nombre del cliente, modalidad (delivery/recojo), ' +
        'y dirección si es delivery. Esto crea el pedido, descuenta stock y genera el comprobante.',
      parameters: {
        type: 'object',
        properties: {
          nombre_cliente:    { type: 'string', description: 'Nombre completo del cliente para el pedido.' },
          modalidad:         { type: 'string', enum: ['delivery', 'recojo'], description: 'Modalidad de entrega.' },
          direccion_entrega: { type: 'string', description: 'Dirección de entrega (obligatorio si modalidad=delivery).' },
          zona_nombre:       { type: 'string', description: 'Nombre de la zona de delivery si aplica.' },
        },
        required: ['nombre_cliente', 'modalidad'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtener_stock',
      description: 'Consulta el stock actual de un producto por ID. Úsalo solo si necesitas stock en tiempo real después de buscar_producto.',
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
        'Agrega productos a un pedido recién confirmado (ventana de gracia). ' +
        'Úsalo SOLO cuando el cliente pide agregar algo a un pedido que acaba de hacer.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
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
        'Úsalo SOLO después de guardar_cotizacion. Máximo 2 sugerencias. Si no hay nada complementario, devuelve vacío.',
      parameters: {
        type: 'object',
        properties: {
          producto_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs de los productos en la cotización actual.',
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
        'Devuelve el perfil y últimos pedidos del cliente. ' +
        'IMPORTANTE: contexto PASIVO — no mencionarlo al cliente a menos que él lo traiga.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_dato_cliente',
      description:
        'Guarda un dato del cliente que él mencionó EXPLÍCITAMENTE. ' +
        'Solo cuando la confianza es alta (lo dijo claramente, no inferido).',
      parameters: {
        type: 'object',
        properties: {
          campo: {
            type: 'string',
            enum: [
              'tipo_cliente', 'obra_actual', 'zona_habitual', 'modalidad_preferida',
              'metodo_pago_preferido', 'presupuesto_obra', 'tiene_ruc', 'giro_negocio',
            ],
            description: 'Campo del perfil a actualizar.',
          },
          valor: { type: 'string', description: 'Valor mencionado por el cliente.' },
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
        'Pausa el bot y notifica al dueño para atención manual. ' +
        'Úsalo SOLO cuando el cliente pida hablar con una persona o haya una queja seria.',
      parameters: {
        type: 'object',
        properties: {
          razon: { type: 'string', description: 'Razón breve del escalamiento.' },
        },
        required: ['razon'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solicitar_comprobante',
      description:
        'Genera y envía por WhatsApp el comprobante de un pedido del cliente. ' +
        'Úsalo cuando el cliente pida boleta, factura, nota de venta, proforma o comprobante. ' +
        'Maneja automáticamente: proforma (pendiente), nota de venta (no pagado/sin Nubefact), ' +
        'boleta electrónica (pagado + Nubefact), factura electrónica (pagado + Nubefact + RUC).',
      parameters: {
        type: 'object',
        properties: {
          numero_pedido: {
            type: 'string',
            description: 'Número de pedido si el cliente lo especificó (ej: PED-0001). Omitir si no lo mencionó.',
          },
          tipo_comprobante: {
            type: 'string',
            enum: ['boleta', 'factura'],
            description: 'Tipo de comprobante solicitado. Omitir si el cliente no lo especificó (se elige automáticamente).',
          },
          ruc_cliente: {
            type: 'string',
            description: 'RUC del cliente (11 dígitos) si pidió factura y lo proporcionó.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modificar_pedido',
      description:
        'Modifica un pedido pendiente del cliente: agrega, quita o ajusta cantidades de productos. ' +
        'Úsalo cuando el cliente quiera cambiar su pedido ANTES de que sea confirmado. ' +
        'Para cantidad = 0 → elimina ese producto. Para cantidad > 0 → agrega o ajusta.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Lista de cambios a aplicar.',
            items: {
              type: 'object',
              properties: {
                nombre_buscado: { type: 'string', description: 'Nombre del producto a modificar.' },
                cantidad: {
                  type: 'number',
                  description: 'Nueva cantidad. Usa 0 para eliminar el producto del pedido.',
                },
              },
              required: ['nombre_buscado', 'cantidad'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
] as const

// ── Agentes configurables (F4) ───────────────────────────────────────────────

export type ToolSchema = (typeof TOOL_SCHEMAS)[number]

// Mapeo agente → tools que controla
const AGENT_TOOLS: Record<keyof AgentesActivos, string[]> = {
  ventas:       ['guardar_cotizacion', 'crear_pedido', 'agregar_a_pedido_reciente', 'modificar_pedido'],
  comprobantes: ['solicitar_comprobante'],
  upsell:       ['sugerir_complementario'],
  crm:          ['historial_cliente', 'guardar_dato_cliente'],
}

/**
 * Devuelve los schemas de tools activos para el tenant.
 * Semántica opt-out: campo ausente / undefined → activo.
 */
export function getActiveToolSchemas(agentes?: AgentesActivos): ToolSchema[] {
  const disabled = new Set<string>()
  if (agentes?.ventas       === false) AGENT_TOOLS.ventas.forEach((t) => disabled.add(t))
  if (agentes?.comprobantes === false) AGENT_TOOLS.comprobantes.forEach((t) => disabled.add(t))
  if (agentes?.upsell       === false) AGENT_TOOLS.upsell.forEach((t) => disabled.add(t))
  if (agentes?.crm          === false) AGENT_TOOLS.crm.forEach((t) => disabled.add(t))
  return (TOOL_SCHEMAS as unknown as ToolSchema[]).filter((s) => !disabled.has(s.function.name))
}

// ── Executors ────────────────────────────────────────────────────────────────

type Executor = (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>

function tokenizarProductos(nombres: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const nombre of nombres) {
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items vacío' }

    const resultados = procesarItemsSolicitados(items, ctx.productos)
    const resumen = resultados.map((r) => ({
      nombre_buscado:       r.nombre_buscado,
      cantidad_solicitada:  r.cantidad,
      encontrado:           !!r.producto,
      producto_id:          r.producto?.id ?? null,
      nombre_catalogo:      r.producto?.nombre ?? null,
      unidad:               r.producto?.unidad ?? null,
      precio_unitario:      r.precio_unitario,
      stock:                r.stock_disponible,
      disponible:           r.disponible,
      nota:                 r.nota,
      requiere_aprobacion:  r.requiere_aprobacion,
    }))
    return { ok: true, data: { resultados: resumen } }
  },

  guardar_cotizacion: async (ctx, args) => {
    requireTenant(ctx)

    type ItemCotArg = {
      producto_id?: string
      nombre_producto: string
      unidad: string
      cantidad: number
      precio_unitario: number
      subtotal: number
      no_disponible?: boolean
      nota?: string
    }

    const items = args.items as ItemCotArg[] | undefined
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items vacío' }

    const requiereAprobacion = (args.requiere_aprobacion as boolean | undefined) ?? false
    const disponibles = items.filter((i) => !i.no_disponible)
    const total = disponibles.reduce((sum, i) => sum + i.subtotal, 0)

    if (disponibles.length === 0) {
      return { ok: false, error: 'Ningún item disponible para cotizar', motivo: 'sin_disponibles' }
    }

    // Guardar cotización
    const { data: cotizacion, error: errCot } = await ctx.supabase
      .from('cotizaciones')
      .insert({
        ferreteria_id:    ctx.ferreteriaId,
        conversacion_id:  ctx.conversacionId,
        cliente_id:       ctx.clienteId,
        estado:           requiereAprobacion ? 'pendiente_aprobacion' : 'enviada',
        total,
        requiere_aprobacion: requiereAprobacion,
      })
      .select().single()

    if (errCot || !cotizacion) {
      console.error('[guardar_cotizacion] Error BD:', errCot?.message)
      return { ok: false, error: 'Error al guardar la cotización' }
    }

    const cotId = (cotizacion as unknown as { id: string }).id

    // Guardar items
    await ctx.supabase.from('items_cotizacion').insert(
      items.map((i) => ({
        cotizacion_id:       cotId,
        producto_id:         i.producto_id ?? null,
        nombre_producto:     i.nombre_producto,
        unidad:              i.unidad,
        cantidad:            i.cantidad,
        precio_unitario:     i.precio_unitario,
        precio_original:     i.precio_unitario,   // snapshot del precio base
        subtotal:            i.subtotal,
        no_disponible:       i.no_disponible ?? false,
        nota_disponibilidad: i.nota ?? null,
      }))
    )

    // Actualizar datos_flujo para saber que hay cotización esperando confirmación
    if (!requiereAprobacion) {
      await ctx.supabase
        .from('conversaciones')
        .update({ datos_flujo: { cotizacion_id: cotId, paso: 'esperando_confirmacion' } })
        .eq('id', ctx.conversacionId)
    }

    return {
      ok: true,
      data: {
        cotizacion_id:     cotId,
        total,
        requiere_aprobacion: requiereAprobacion,
        items_disponibles:   disponibles.length,
        items_no_disponibles: items.length - disponibles.length,
      },
    }
  },

  crear_pedido: async (ctx, args) => {
    requireTenant(ctx)

    const nombreCliente    = (args.nombre_cliente as string | undefined)?.trim()
    const modalidad        = args.modalidad as 'delivery' | 'recojo' | undefined
    const direccionEntrega = (args.direccion_entrega as string | undefined)?.trim() || null
    const zonaNombre       = (args.zona_nombre as string | undefined)?.trim() || null

    if (!nombreCliente) return { ok: false, error: 'nombre_cliente es requerido', motivo: 'falta_nombre' }
    if (!modalidad)     return { ok: false, error: 'modalidad es requerida',       motivo: 'falta_modalidad' }
    if (modalidad === 'delivery' && !direccionEntrega) {
      return { ok: false, error: 'dirección de entrega requerida para delivery', motivo: 'falta_direccion' }
    }

    // Buscar cotización activa de esta conversación
    const cotizacionId = ctx.datosFlujo?.cotizacion_id
    if (!cotizacionId) {
      return {
        ok: false,
        error: 'No hay cotización activa. Primero usa buscar_producto y guardar_cotizacion.',
        motivo: 'sin_cotizacion',
      }
    }

    const { data: cotizacion, error: errCot } = await ctx.supabase
      .from('cotizaciones')
      .select('*, items_cotizacion(*)')
      .eq('id', cotizacionId)
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
      .in('estado', ['enviada', 'aprobada'])
      .single()

    if (errCot || !cotizacion) {
      return { ok: false, error: 'Cotización no encontrada o ya procesada', motivo: 'cotizacion_no_encontrada' }
    }

    // Buscar zona de delivery si aplica
    let zonaId: string | null = null
    if (modalidad === 'delivery' && zonaNombre && ctx.zonas.length > 0) {
      const zonaMatch = ctx.zonas.find((z) =>
        z.nombre.toLowerCase().includes(zonaNombre.toLowerCase())
      )
      if (zonaMatch) zonaId = zonaMatch.id
    }

    // Generar número de pedido
    const { data: numeroPedido } = await ctx.supabase
      .rpc('generar_numero_pedido', { p_ferreteria_id: ctx.ferreteriaId })

    // Preparar items desde la cotización
    const productoCostoMap = new Map(ctx.productos.map((p) => [p.id, p.precio_compra ?? 0]))
    const itemsCotizacion  = (cotizacion as unknown as { items_cotizacion: Array<Record<string, unknown>> }).items_cotizacion ?? []
    const itemsParaPedido  = itemsCotizacion
      .filter((i) => !i.no_disponible)
      .map((i) => ({
        producto_id:     i.producto_id as string | null,
        nombre_producto: i.nombre_producto as string,
        unidad:          i.unidad as string,
        cantidad:        i.cantidad as number,
        precio_unitario: i.precio_unitario as number,
        subtotal:        i.subtotal as number,
        costo_unitario:  productoCostoMap.get(i.producto_id as string) ?? 0,
      }))

    if (itemsParaPedido.length === 0) {
      return { ok: false, error: 'La cotización no tiene items disponibles', motivo: 'sin_items' }
    }

    const costoTotal = itemsParaPedido.reduce((sum, i) => sum + i.costo_unitario * i.cantidad, 0)
    const total      = (cotizacion as unknown as { total: number }).total

    // Crear el pedido
    const { data: pedido, error: errPed } = await ctx.supabase
      .from('pedidos')
      .insert({
        ferreteria_id:    ctx.ferreteriaId,
        cotizacion_id:    cotizacionId,
        cliente_id:       ctx.clienteId,
        numero_pedido:    numeroPedido,
        nombre_cliente:   nombreCliente,
        telefono_cliente: ctx.telefonoCliente,
        direccion_entrega: direccionEntrega,
        zona_delivery_id: zonaId,
        modalidad,
        estado:      'confirmado',
        total,
        costo_total: costoTotal,
      })
      .select().single()

    if (errPed || !pedido) {
      console.error('[crear_pedido] Error BD:', errPed?.message)
      return { ok: false, error: 'Error al crear el pedido en la base de datos' }
    }

    const pedidoId = (pedido as unknown as { id: string }).id

    // Insertar items del pedido
    await ctx.supabase.from('items_pedido').insert(
      itemsParaPedido.map((i) => ({ pedido_id: pedidoId, ...i }))
    )

    // Descontar stock (fire-and-forget)
    ctx.supabase.rpc('reducir_stock_pedido', { p_pedido_id: pedidoId })
      .then(({ error: e }) => { if (e) console.error('[crear_pedido] Error stock:', e.message) })

    // Marcar cotización como aprobada
    await ctx.supabase
      .from('cotizaciones')
      .update({ estado: 'aprobada' })
      .eq('id', cotizacionId)
      .eq('ferreteria_id', ctx.ferreteriaId)

    // Actualizar nombre del cliente si no lo tenía
    await ctx.supabase
      .from('clientes')
      .update({ nombre: nombreCliente })
      .eq('id', ctx.clienteId)
      .is('nombre', null)

    // Actualizar perfil del cliente (compras frecuentes + modalidad)
    try {
      const { data: clienteActual } = await ctx.supabase
        .from('clientes').select('perfil')
        .eq('id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId).single()

      const perfilBase       = (clienteActual?.perfil as Record<string, unknown> | null) ?? {}
      const comprasPrevias   = Array.isArray(perfilBase.compras_frecuentes)
        ? (perfilBase.compras_frecuentes as string[]) : []
      const nombresNuevos    = itemsParaPedido.map((i) => i.nombre_producto).filter(Boolean)
      const comprasUnicas    = Array.from(new Set([...nombresNuevos, ...comprasPrevias])).slice(0, 20)
      const perfilNuevo: Record<string, unknown> = {
        ...perfilBase,
        compras_frecuentes: comprasUnicas,
        modalidad_preferida: modalidad,
      }
      if (modalidad === 'delivery' && zonaNombre) perfilNuevo.zona_habitual = zonaNombre

      await ctx.supabase.from('clientes').update({ perfil: perfilNuevo })
        .eq('id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId)
    } catch (e) {
      console.error('[crear_pedido] Error perfil cliente:', e)
    }

    // Limpiar flujo de la conversación
    await ctx.supabase.from('conversaciones')
      .update({ datos_flujo: null })
      .eq('id', ctx.conversacionId)

    // Generar y enviar comprobante (PDF + WhatsApp)
    generarYEnviarComprobante({
      pedidoId:     pedidoId,
      ferreteriaId: ctx.ferreteriaId,
      ycloudApiKey: ctx.ycloudApiKey,
    }).catch((e) => console.error('[crear_pedido] Error comprobante:', e))

    // Enviar instrucciones de pago si hay métodos digitales configurados
    try {
      const { data: ferrPago } = await ctx.supabase
        .from('ferreterias')
        .select('telefono_whatsapp, metodos_pago_activos, datos_yape, datos_transferencia')
        .eq('id', ctx.ferreteriaId)
        .single()

      if (ferrPago && ctx.ycloudApiKey) {
        const telefonoWA = (ferrPago as unknown as { telefono_whatsapp?: string }).telefono_whatsapp ?? null
        const metodosActivos: string[] = (ferrPago as unknown as { metodos_pago_activos?: string[] }).metodos_pago_activos ?? []
        const datosYape = (ferrPago as unknown as { datos_yape?: Record<string, string> }).datos_yape ?? null
        const datosTransferencia = (ferrPago as unknown as { datos_transferencia?: Record<string, string> }).datos_transferencia ?? null

        const lineasPago: string[] = []
        if (metodosActivos.includes('yape') && datosYape?.numero) {
          lineasPago.push(`💚 *Yape:* ${datosYape.numero}`)
        }
        if (metodosActivos.includes('transferencia') && datosTransferencia?.banco) {
          lineasPago.push(
            `🏦 *Transferencia (${datosTransferencia.banco}):*\n` +
            `  Cuenta: ${datosTransferencia.cuenta}\n` +
            (datosTransferencia.cci ? `  CCI: ${datosTransferencia.cci}\n` : '') +
            `  Titular: ${datosTransferencia.titular}`
          )
        }
        if (metodosActivos.includes('efectivo')) {
          lineasPago.push(`💵 *Efectivo* al momento de la entrega`)
        }

        if (lineasPago.length > 0 && telefonoWA) {
          const textoPago =
            `💳 *Formas de pago disponibles:*\n\n` +
            lineasPago.join('\n\n') +
            `\n\nSi pagas por Yape o transferencia, envía el comprobante y lo confirmaremos. 🙏`
          enviarMensaje({
            from: telefonoWA,
            to: ctx.telefonoCliente,
            texto: textoPago,
            apiKey: ctx.ycloudApiKey,
          }).catch((e) => console.error('[crear_pedido] Error instrucciones pago:', e))

          if (metodosActivos.includes('yape') && datosYape?.qr_url) {
            enviarImagen({
              from: telefonoWA,
              to: ctx.telefonoCliente,
              imageUrl: datosYape.qr_url,
              caption: `QR de Yape — ${datosYape.numero}`,
              apiKey: ctx.ycloudApiKey,
            }).catch((e) => console.error('[crear_pedido] Error QR Yape:', e))
          }
        }
      }
    } catch (e) {
      console.error('[crear_pedido] Error instrucciones pago:', e)
    }

    return {
      ok: true,
      data: {
        numero_pedido: (pedido as unknown as { numero_pedido: string }).numero_pedido,
        total,
        modalidad,
        direccion: direccionEntrega,
        items: itemsParaPedido.map((i) => ({ nombre: i.nombre_producto, cantidad: i.cantidad })),
      },
    }
  },

  obtener_stock: async (ctx, args) => {
    requireTenant(ctx)
    const productoId = args.producto_id as string
    if (!productoId) return { ok: false, error: 'producto_id requerido' }

    const { data, error } = await ctx.supabase
      .from('productos')
      .select('id, nombre, unidad, stock, precio_base')
      .eq('id', productoId)
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
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
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
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
        .eq('id', ctx.ferreteriaId)              // FERRETERÍA AISLADA
        .single(),
      ctx.supabase
        .from('zonas_delivery')
        .select('nombre, tiempo_estimado_min')
        .eq('ferreteria_id', ctx.ferreteriaId)   // FERRETERÍA AISLADA
        .eq('activo', true),
    ])
    if (!ferreteria) return { ok: false, error: 'Ferretería no encontrada' }
    return { ok: true, data: { ferreteria, zonas_delivery: zonas ?? [] } }
  },

  agregar_a_pedido_reciente: async (ctx, args) => {
    requireTenant(ctx)
    const items = args.items as Array<{ nombre_buscado: string; cantidad: number }> | undefined
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items vacío' }

    const ventanaMin = ctx.ventanaGraciaMinutos ?? 30

    const { data: pedidoRaw } = await ctx.supabase
      .from('pedidos')
      .select(
        'id, numero_pedido, total, estado, estado_pago, modalidad, created_at, ' +
        'modificaciones_count, nombre_cliente, direccion_entrega, items_pedido(*)'
      )
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
      .eq('cliente_id', ctx.clienteId)
      .in('estado', ['confirmado', 'en_preparacion'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    type PedidoRaw = {
      id: string; numero_pedido: string; total: number; estado: string
      estado_pago: string | null; modalidad: string; created_at: string
      modificaciones_count: number | null; items_pedido: Array<Record<string, unknown>>
    }
    const pedido = pedidoRaw as PedidoRaw | null

    if (!pedido) return { ok: false, motivo: 'sin_pedido_editable', mensaje: 'No encontré un pedido reciente editable. Sugiere crear un pedido nuevo.' }

    const minutosTranscurridos = (Date.now() - new Date(pedido.created_at).getTime()) / 60000
    if (minutosTranscurridos > ventanaMin) {
      return { ok: false, motivo: 'fuera_de_ventana', mensaje: `El pedido ${pedido.numero_pedido} ya tiene ${Math.round(minutosTranscurridos)} min. Sugiere crear un pedido nuevo.` }
    }

    if (pedido.estado_pago === 'pagado') {
      return { ok: false, motivo: 'pedido_pagado', mensaje: `El pedido ${pedido.numero_pedido} ya fue pagado. Sugiere crear un pedido nuevo.` }
    }

    const { data: configBot } = await ctx.supabase
      .from('configuracion_bot')
      .select('umbral_monto_negociacion')
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
      .single()

    const resultados = procesarItemsSolicitados(
      items,
      ctx.productos,
      (configBot as { umbral_monto_negociacion?: number } | null)?.umbral_monto_negociacion
    )

    const productoCostoMap = new Map(ctx.productos.map((p) => [p.id, p.precio_compra ?? 0]))
    const itemsActuales    = pedido.items_pedido ?? []
    const agregados: Array<{ nombre: string; cantidad: number; precio: number; subtotal: number }> = []

    for (const r of resultados) {
      if (!r.disponible || !r.producto) continue

      const existente = itemsActuales.find((i) => (i.producto_id as string) === r.producto!.id)
      if (existente) {
        const nuevaCantidad = (existente.cantidad as number) + r.cantidad
        const nuevoSubtotal = r.precio_unitario * nuevaCantidad
        await ctx.supabase.from('items_pedido').update({ cantidad: nuevaCantidad, precio_unitario: r.precio_unitario, subtotal: nuevoSubtotal }).eq('id', existente.id as string)
        agregados.push({ nombre: r.producto.nombre, cantidad: r.cantidad, precio: r.precio_unitario, subtotal: r.precio_unitario * r.cantidad })
      } else {
        await ctx.supabase.from('items_pedido').insert({
          pedido_id: pedido.id, producto_id: r.producto.id, nombre_producto: r.producto.nombre,
          unidad: r.producto.unidad, cantidad: r.cantidad, precio_unitario: r.precio_unitario,
          subtotal: r.subtotal, costo_unitario: productoCostoMap.get(r.producto.id) ?? 0,
        })
        agregados.push({ nombre: r.producto.nombre, cantidad: r.cantidad, precio: r.precio_unitario, subtotal: r.subtotal })
      }
    }

    if (agregados.length === 0) {
      return { ok: false, motivo: 'productos_no_encontrados', mensaje: 'No encontré esos productos en el catálogo. Verifica los nombres.' }
    }

    const { data: itemsFinal } = await ctx.supabase
      .from('items_pedido').select('subtotal, cantidad, costo_unitario').eq('pedido_id', pedido.id)

    const nuevoTotal  = (itemsFinal ?? []).reduce((s, i) => s + (i.subtotal as number), 0)
    const nuevoCosto  = (itemsFinal ?? []).reduce((s, i) => s + ((i.costo_unitario as number) ?? 0) * (i.cantidad as number), 0)

    await ctx.supabase.from('pedidos').update({
      total: nuevoTotal, costo_total: nuevoCosto,
      modificado_post_confirmacion_at: new Date().toISOString(),
      modificaciones_count: (pedido.modificaciones_count ?? 0) + 1,
    }).eq('id', pedido.id).eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA

    try {
      await eliminarComprobantePedido(pedido.id, ctx.ferreteriaId)
      await generarYEnviarComprobante({ pedidoId: pedido.id, ferreteriaId: ctx.ferreteriaId, esProforma: false, ycloudApiKey: ctx.ycloudApiKey })
    } catch (e) { console.error('[agregar_a_pedido_reciente] Error comprobante:', e) }

    return {
      ok: true,
      data: { pedido_numero: pedido.numero_pedido, nuevo_total: nuevoTotal, items_agregados: agregados, comprobante_regenerado: true },
    }
  },

  sugerir_complementario: async (ctx, args) => {
    requireTenant(ctx)
    const productoIds = args.producto_ids as string[] | undefined
    if (!Array.isArray(productoIds) || productoIds.length === 0) return { ok: true, data: { sugerencias: [] } }

    // F5: Verificar umbral de upsell — si el monto de la cotización activa está por debajo, no sugerimos
    const umbral = ctx.umbralUpsellSoles ?? 0
    if (umbral > 0) {
      const { data: cotActiva } = await ctx.supabase
        .from('cotizaciones')
        .select('total')
        .eq('ferreteria_id', ctx.ferreteriaId)
        .eq('conversacion_id', ctx.conversacionId)
        .in('estado', ['enviada', 'pendiente_aprobacion'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!cotActiva || (cotActiva as unknown as { total: number }).total < umbral) {
        return { ok: true, data: { sugerencias: [], motivo: 'debajo_umbral' } }
      }
    }

    const productosActuales = ctx.productos.filter((p) => productoIds.includes(p.id))
    const categoriasActuales = new Set(productosActuales.map((p) => p.categoria_id).filter(Boolean))
    const tokensActuales = tokenizarProductos(productosActuales.map((p) => p.nombre))

    const { data: pares, error } = await ctx.supabase
      .from('productos_complementarios')
      .select('complementario_id, tipo, frecuencia')
      .eq('ferreteria_id', ctx.ferreteriaId)    // FERRETERÍA AISLADA
      .in('producto_id', productoIds)
      .eq('activo', true)
      .order('tipo', { ascending: false })
      .order('frecuencia', { ascending: false })

    if (error || !pares || pares.length === 0) return { ok: true, data: { sugerencias: [] } }

    const idsYaEnCotizacion = new Set(productoIds)
    const candidatos = pares.filter((p) => !idsYaEnCotizacion.has(p.complementario_id))
    if (candidatos.length === 0) return { ok: true, data: { sugerencias: [] } }

    const idsCanditatos = [...new Set(candidatos.map((c) => c.complementario_id))]
    const complementariosInfo = ctx.productos.filter((p) => idsCanditatos.includes(p.id) && p.activo && p.stock > 0)

    const candidatosFiltrados = complementariosInfo.filter((comp) => {
      const parOrigen = candidatos.find((c) => c.complementario_id === comp.id)
      if (!parOrigen) return false
      if (parOrigen.tipo === 'manual') return true
      if (comp.categoria_id && categoriasActuales.has(comp.categoria_id)) return true
      const tokensComp = [...tokenizarProductos([comp.nombre])]
      return tokensComp.some((t) => tokensActuales.has(t))
    })

    if (candidatosFiltrados.length === 0) return { ok: true, data: { sugerencias: [] } }

    const ordenados = candidatosFiltrados
      .map((comp) => { const par = candidatos.find((c) => c.complementario_id === comp.id)!; return { comp, tipo: par.tipo, frecuencia: par.frecuencia } })
      .sort((a, b) => { if (a.tipo === 'manual' && b.tipo !== 'manual') return -1; if (a.tipo !== 'manual' && b.tipo === 'manual') return 1; return b.frecuencia - a.frecuencia })
      .slice(0, 2)

    return {
      ok: true,
      data: {
        sugerencias: ordenados.map(({ comp }) => ({
          id: comp.id, nombre: comp.nombre, precio_unitario: comp.precio_base, unidad: comp.unidad, stock: comp.stock,
        })),
      },
    }
  },

  historial_cliente: async (ctx) => {
    requireTenant(ctx)
    const [{ data: cliente }, { data: pedidos }] = await Promise.all([
      ctx.supabase.from('clientes').select('nombre, perfil')
        .eq('id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId).single(),
      ctx.supabase.from('pedidos')
        .select('numero_pedido, modalidad, total, estado, created_at, items_pedido(nombre_producto, cantidad)')
        .eq('cliente_id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId)
        .order('created_at', { ascending: false }).limit(5),
    ])
    return { ok: true, data: { perfil: cliente?.perfil ?? {}, nombre: cliente?.nombre ?? null, pedidos_recientes: pedidos ?? [] } }
  },

  guardar_dato_cliente: async (ctx, args) => {
    requireTenant(ctx)
    const campo  = args.campo as string
    const valor  = (args.valor as string | undefined)?.trim()
    const camposPermitidos = [
      'tipo_cliente', 'obra_actual', 'zona_habitual', 'modalidad_preferida',
      'metodo_pago_preferido', 'presupuesto_obra', 'tiene_ruc', 'giro_negocio',
    ]
    if (!campo || !camposPermitidos.includes(campo)) return { ok: false, error: 'campo no permitido' }
    if (!valor || valor.length < 2 || valor.length > 200) return { ok: false, error: 'valor inválido' }

    const { data: clienteActual } = await ctx.supabase.from('clientes').select('perfil')
      .eq('id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId).single()
    const perfilActual = (clienteActual?.perfil ?? {}) as Record<string, unknown>
    const perfilNuevo  = { ...perfilActual, [campo]: valor }

    const { error } = await ctx.supabase.from('clientes').update({ perfil: perfilNuevo })
      .eq('id', ctx.clienteId).eq('ferreteria_id', ctx.ferreteriaId)
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

  // ── Solicitar comprobante ──────────────────────────────────────────────────
  solicitar_comprobante: async (ctx, args) => {
    requireTenant(ctx)

    const numeroPedidoArg   = ((args.numero_pedido as string | undefined) ?? '').toUpperCase().trim() || null
    const tipoComprobanteArg = (args.tipo_comprobante as 'boleta' | 'factura' | undefined) ?? null
    const rucClienteArg      = ((args.ruc_cliente as string | undefined) ?? '').replace(/\D/g, '') || null

    // Fetch ferreteria config (tipo_ruc, nubefact, telefono_whatsapp)
    const { data: ferreteria } = await ctx.supabase
      .from('ferreterias')
      .select('tipo_ruc, nubefact_ruta, nubefact_token_enc, telefono_whatsapp')
      .eq('id', ctx.ferreteriaId)
      .single()

    if (!ferreteria) return { ok: false, error: 'Ferretería no encontrada' }

    type FerrConfig = { tipo_ruc?: string; nubefact_ruta?: string; nubefact_token_enc?: string; telefono_whatsapp?: string }
    const ferr = ferreteria as unknown as FerrConfig
    const tipoRucTenant      = ferr.tipo_ruc ?? 'sin_ruc'
    const nubefactConfigurado = !!(ferr.nubefact_ruta && ferr.nubefact_token_enc)
    const telefonoWA          = ferr.telefono_whatsapp ?? null

    // Validar RUC si el cliente lo proporcionó y el tenant puede emitir facturas
    if (tipoRucTenant === 'ruc20' && rucClienteArg) {
      if (!validarFormatoRuc(rucClienteArg)) {
        return {
          ok: false,
          error: `El RUC ${rucClienteArg} tiene formato inválido. Debe ser 11 dígitos comenzando con 10 o 20.`,
          motivo: 'ruc_invalido',
        }
      }
      let consultaRuc: Awaited<ReturnType<typeof consultarRuc>>
      try {
        // SUNAT API tiene latencia variable — timeout de 5s para no bloquear el orquestador
        consultaRuc = await withTimeout(5_000, consultarRuc(rucClienteArg))
      } catch (eRuc) {
        const esTimeout = eRuc instanceof Error && eRuc.message.startsWith('timeout_')
        return {
          ok: false,
          error: esTimeout
            ? `La consulta a SUNAT tardó demasiado. Puedes continuar sin validar el RUC o intentar más tarde.`
            : `Error consultando SUNAT: ${eRuc instanceof Error ? eRuc.message : String(eRuc)}`,
          motivo: 'ruc_timeout',
        }
      }
      if (!consultaRuc.ok || !consultaRuc.data) {
        return {
          ok: false,
          error: `No se pudo verificar el RUC ${rucClienteArg} en SUNAT (${consultaRuc.error ?? 'no encontrado'}). Pide al cliente que lo confirme.`,
          motivo: 'ruc_no_encontrado',
        }
      }
      const infoRuc = consultaRuc.data
      // Guardar RUC en el registro del cliente — FERRETERÍA AISLADA
      await ctx.supabase
        .from('clientes')
        .update({ ruc_cliente: rucClienteArg, tipo_persona: infoRuc.tipoPersona })
        .eq('id', ctx.clienteId)
        .eq('ferreteria_id', ctx.ferreteriaId)

      if (!infoRuc.activo) {
        return {
          ok: false,
          error: `El RUC ${rucClienteArg} (${infoRuc.razonSocial}) figura como ${infoRuc.estado}/${infoRuc.condicion} en SUNAT. Informa al cliente y pregunta si desea continuar o prefiere nota de venta.`,
          motivo: 'ruc_inactivo',
        }
      }
    }

    // Buscar pedidos del cliente — FERRETERÍA AISLADA
    const { data: pedidos } = await ctx.supabase
      .from('pedidos')
      .select('id, numero_pedido, estado, estado_pago, nombre_cliente, created_at')
      .eq('ferreteria_id', ctx.ferreteriaId)
      .eq('cliente_id', ctx.clienteId)
      .in('estado', ['pendiente', 'confirmado', 'en_preparacion', 'enviado', 'entregado'])
      .order('created_at', { ascending: false })
      .limit(5)

    if (!pedidos || pedidos.length === 0) {
      return { ok: false, error: 'No encontré pedidos para este cliente. ¿Quizás fue registrado con otro número?', motivo: 'sin_pedidos' }
    }

    // Si el cliente tiene múltiples pedidos y no especificó cuál
    if (pedidos.length > 1 && !numeroPedidoArg) {
      return {
        ok: false,
        motivo: 'multiples_pedidos',
        error: 'El cliente tiene varios pedidos. Pregúntale de cuál necesita el comprobante.',
        data: { pedidos: pedidos.slice(0, 3).map((p) => ({ numero_pedido: p.numero_pedido, estado: p.estado })) },
      }
    }

    // Seleccionar pedido objetivo
    let pedidoTarget = pedidos[0]
    if (numeroPedidoArg) {
      const match = pedidos.find((p) => p.numero_pedido.toUpperCase() === numeroPedidoArg)
      if (match) pedidoTarget = match
    }

    type PedidoTarget = { id: string; numero_pedido: string; estado: string; estado_pago: string | null; nombre_cliente: string | null }
    const ped = pedidoTarget as unknown as PedidoTarget

    const pagado        = ped.estado_pago === 'pagado'
    const pidioFactura  = tipoComprobanteArg === 'factura' || !!rucClienteArg

    // ── Caso 1: no pagado → nota de venta / proforma ───────────────────────
    if (!pagado) {
      const esProforma = ped.estado === 'pendiente'
      const resultadoNV = await generarYEnviarComprobante({
        pedidoId:     ped.id,
        ferreteriaId: ctx.ferreteriaId,
        esProforma,
        ycloudApiKey: ctx.ycloudApiKey,
      })
      if (!resultadoNV.ok) {
        return { ok: false, error: resultadoNV.error ?? 'Error generando documento' }
      }
      return {
        ok: true,
        data: {
          tipo_documento:     esProforma ? 'proforma' : 'nota_venta',
          numero_comprobante: resultadoNV.numero_comprobante,
          pedido_numero:      ped.numero_pedido,
          enviado:            true,
          nota: pidioFactura
            ? `Para emitir comprobante electrónico primero se necesita completar el pago.`
            : undefined,
        },
      }
    }

    // ── Caso 2: pagado pero sin Nubefact o sin_ruc → nota de venta ─────────
    if (!nubefactConfigurado || tipoRucTenant === 'sin_ruc') {
      const resultadoNV = await generarYEnviarComprobante({
        pedidoId:     ped.id,
        ferreteriaId: ctx.ferreteriaId,
        esProforma:   false,
        ycloudApiKey: ctx.ycloudApiKey,
      })
      if (!resultadoNV.ok) {
        return { ok: false, error: resultadoNV.error ?? 'Error generando documento' }
      }
      return {
        ok: true,
        data: {
          tipo_documento:     'nota_venta',
          numero_comprobante: resultadoNV.numero_comprobante,
          pedido_numero:      ped.numero_pedido,
          enviado:            true,
        },
      }
    }

    // ── Caso 3: pagado + Nubefact → boleta o factura electrónica ───────────
    if (pidioFactura) {
      // Buscar RUC guardado si no se proporcionó
      let rucParaFactura = rucClienteArg ?? ''
      if (!rucParaFactura) {
        const { data: clienteData } = await ctx.supabase
          .from('clientes')
          .select('ruc_cliente')
          .eq('id', ctx.clienteId)
          .eq('ferreteria_id', ctx.ferreteriaId)
          .single()
        rucParaFactura = (clienteData as unknown as { ruc_cliente?: string } | null)?.ruc_cliente ?? ''
      }

      if (!rucParaFactura || rucParaFactura.length !== 11) {
        return {
          ok: false,
          motivo: 'falta_ruc_factura',
          error: 'Para emitir factura electrónica necesito el RUC del cliente (11 dígitos). Pídelo explícitamente y vuelve a llamar esta tool con el RUC.',
        }
      }

      const resultFact = await emitirFactura({
        pedidoId:      ped.id,
        ferreteriaId:  ctx.ferreteriaId,
        clienteNombre: ped.nombre_cliente || 'CLIENTE',
        clienteRuc:    rucParaFactura,
        emitidoPor:    'bot',
      })

      if (resultFact.ok && resultFact.pdfUrl && telefonoWA && ctx.ycloudApiKey) {
        enviarDocumento({
          from:     telefonoWA,
          to:       ctx.telefonoCliente,
          pdfUrl:   resultFact.pdfUrl,
          filename: `${resultFact.numeroCompleto ?? 'factura'}.pdf`,
          caption:  `Factura ${resultFact.numeroCompleto} — Pedido ${ped.numero_pedido}`,
          apiKey:   ctx.ycloudApiKey,
        }).catch((e) => console.error('[solicitar_comprobante] Error enviando factura:', e))

        return {
          ok: true,
          data: {
            tipo_documento:     'factura',
            numero_comprobante: resultFact.numeroCompleto,
            pedido_numero:      ped.numero_pedido,
            enviado:            true,
          },
        }
      } else if (resultFact.tokenInvalido) {
        return { ok: false, error: 'Token Nubefact inválido. El encargado enviará el comprobante directamente.', motivo: 'nubefact_token_invalido' }
      } else {
        return { ok: false, error: resultFact.error ?? 'Error emitiendo factura', motivo: 'error_nubefact' }
      }
    }

    // Emitir boleta electrónica (caso default)
    const resultBol = await emitirBoleta({
      pedidoId:      ped.id,
      ferreteriaId:  ctx.ferreteriaId,
      tipoBoleta:    'boleta',
      clienteNombre: ped.nombre_cliente || 'CLIENTES VARIOS',
      clienteDni:    '',
      emitidoPor:    'bot',
    })

    if (resultBol.ok && resultBol.pdfUrl && telefonoWA && ctx.ycloudApiKey) {
      enviarDocumento({
        from:     telefonoWA,
        to:       ctx.telefonoCliente,
        pdfUrl:   resultBol.pdfUrl,
        filename: `${resultBol.numeroCompleto ?? 'boleta'}.pdf`,
        caption:  `Boleta ${resultBol.numeroCompleto} — Pedido ${ped.numero_pedido}`,
        apiKey:   ctx.ycloudApiKey,
      }).catch((e) => console.error('[solicitar_comprobante] Error enviando boleta:', e))

      return {
        ok: true,
        data: {
          tipo_documento:     'boleta',
          numero_comprobante: resultBol.numeroCompleto,
          pedido_numero:      ped.numero_pedido,
          enviado:            true,
        },
      }
    } else if (resultBol.tokenInvalido) {
      // Fallback a nota de venta
      const resultNV = await generarYEnviarComprobante({
        pedidoId: ped.id, ferreteriaId: ctx.ferreteriaId, ycloudApiKey: ctx.ycloudApiKey,
      })
      if (resultNV.ok) {
        return {
          ok: true,
          data: {
            tipo_documento:     'nota_venta',
            numero_comprobante: resultNV.numero_comprobante,
            pedido_numero:      ped.numero_pedido,
            enviado:            true,
            nota:               'Boleta electrónica temporalmente no disponible — se envió nota de venta',
          },
        }
      }
      return { ok: false, error: 'Error generando documento de respaldo', motivo: 'error_fallback' }
    } else {
      return { ok: false, error: resultBol.error ?? 'Error emitiendo boleta', motivo: 'error_nubefact' }
    }
  },

  // ── Modificar pedido pendiente ─────────────────────────────────────────────
  modificar_pedido: async (ctx, args) => {
    requireTenant(ctx)

    const items = args.items as Array<{ nombre_buscado: string; cantidad: number }> | undefined
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: 'items vacío — debes indicar qué productos modificar y con qué cantidad (0 = quitar)' }
    }

    // Buscar pedido pendiente más reciente del cliente — FERRETERÍA AISLADA
    const { data: pedidoRaw } = await ctx.supabase
      .from('pedidos')
      .select('id, numero_pedido, total, items_pedido(*)')
      .eq('ferreteria_id', ctx.ferreteriaId)
      .eq('cliente_id', ctx.clienteId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pedidoRaw) {
      return {
        ok: false,
        motivo: 'sin_pedido_pendiente',
        error: 'No hay pedido pendiente para modificar. Si el pedido ya fue confirmado usa agregar_a_pedido_reciente.',
      }
    }

    type PedidoMod = { id: string; numero_pedido: string; total: number; items_pedido: Array<Record<string, unknown>> }
    const pedido      = pedidoRaw as unknown as PedidoMod
    const itemsActuales = pedido.items_pedido ?? []
    const productoCostoMap = new Map(ctx.productos.map((p) => [p.id, p.precio_compra ?? 0]))

    // ── Quitar items (cantidad = 0) ──────────────────────────────────────────
    const itemsQuitar = items.filter((i) => i.cantidad === 0)
    for (const req of itemsQuitar) {
      const nombre = req.nombre_buscado.toLowerCase()
      const match = itemsActuales.find((ia) => {
        const nombreProd = (ia.nombre_producto as string).toLowerCase()
        return nombreProd.includes(nombre) || nombre.includes(nombreProd.split(' ')[0])
      })
      if (match) {
        await ctx.supabase.from('items_pedido').delete().eq('id', match.id as string)
      }
    }

    // ── Agregar / actualizar items (cantidad > 0) ────────────────────────────
    const itemsModificar = items.filter((i) => i.cantidad > 0)
    if (itemsModificar.length > 0) {
      const { data: configBot } = await ctx.supabase
        .from('configuracion_bot')
        .select('umbral_monto_negociacion')
        .eq('ferreteria_id', ctx.ferreteriaId)
        .single()

      const resultados = procesarItemsSolicitados(
        itemsModificar,
        ctx.productos,
        (configBot as { umbral_monto_negociacion?: number } | null)?.umbral_monto_negociacion
      )

      for (const r of resultados) {
        if (!r.disponible || !r.producto) continue

        const existente = itemsActuales.find((ia) => (ia.producto_id as string) === r.producto!.id)
        if (existente) {
          await ctx.supabase
            .from('items_pedido')
            .update({
              cantidad:        r.cantidad,
              precio_unitario: r.precio_unitario,
              subtotal:        r.subtotal,
              costo_unitario:  productoCostoMap.get(r.producto.id) ?? 0,
            })
            .eq('id', existente.id as string)
        } else {
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
        }
      }
    }

    // ── Recalcular total ─────────────────────────────────────────────────────
    const { data: itemsFinal } = await ctx.supabase
      .from('items_pedido')
      .select('subtotal, cantidad, costo_unitario')
      .eq('pedido_id', pedido.id)

    if (!itemsFinal || itemsFinal.length === 0) {
      return {
        ok: true,
        data: {
          pedido_numero: pedido.numero_pedido,
          nuevo_total:   0,
          vaciado:       true,
          mensaje:       'El pedido quedó sin productos. Pregunta al cliente si desea cancelarlo o agregar otros productos.',
        },
      }
    }

    const nuevoTotal = itemsFinal.reduce((s, i) => s + (i.subtotal as number), 0)
    const nuevoCosto = itemsFinal.reduce((s, i) => s + ((i.costo_unitario as number) ?? 0) * (i.cantidad as number), 0)

    await ctx.supabase
      .from('pedidos')
      .update({ total: nuevoTotal, costo_total: nuevoCosto })
      .eq('id', pedido.id)
      .eq('ferreteria_id', ctx.ferreteriaId)     // FERRETERÍA AISLADA

    // Borrar comprobante anterior si existe (el cliente podrá pedirlo actualizado)
    try { await eliminarComprobantePedido(pedido.id, ctx.ferreteriaId) } catch (_) { /* no-op */ }

    // Devolver lista actualizada al LLM
    const { data: itemsMostrar } = await ctx.supabase
      .from('items_pedido')
      .select('nombre_producto, cantidad, precio_unitario')
      .eq('pedido_id', pedido.id)
      .order('nombre_producto')

    return {
      ok: true,
      data: {
        pedido_numero: pedido.numero_pedido,
        nuevo_total:   nuevoTotal,
        items: (itemsMostrar ?? []).map((i) => ({
          nombre:   i.nombre_producto,
          cantidad: i.cantidad,
          precio:   (i.precio_unitario as number).toFixed(2),
        })),
      },
    }
  },
}
