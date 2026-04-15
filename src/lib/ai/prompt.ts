// Construcción del system prompt para DeepSeek
import type { Ferreteria, Producto, ZonaDelivery, ConfiguracionBot, DatosFlujoPedido } from '@/types/database'

interface ContextoNegocio {
  ferreteria: Ferreteria
  productos: Producto[]
  zonas: ZonaDelivery[]
  config: ConfiguracionBot | null
  datosFlujo?: DatosFlujoPedido | null
}

export function buildSystemPrompt(ctx: ContextoNegocio): string {
  const { ferreteria, productos, zonas, datosFlujo } = ctx

  const diasAtencion = ferreteria.dias_atencion?.join(', ') || 'lun-vie'
  const horario = ferreteria.horario_apertura && ferreteria.horario_cierre
    ? `${ferreteria.horario_apertura.slice(0, 5)}-${ferreteria.horario_cierre.slice(0, 5)}`
    : 'a consultar'
  const formasPago = ferreteria.formas_pago?.length
    ? ferreteria.formas_pago.join(', ')
    : 'a consultar'
  const zonasTexto = zonas.length
    ? zonas.map((z) => `${z.nombre} (~${z.tiempo_estimado_min} min)`).join(', ')
    : 'sin delivery'

  let contextoPedido = ''
  if (datosFlujo) {
    if (datosFlujo.paso === 'esperando_confirmacion') {
      contextoPedido = `\nFLUJO: cotización aprobada enviada al cliente. SÍ/acepta→confirmar_pedido. NO/rechaza→rechazar_cotizacion.`
    } else {
      contextoPedido = `\nFLUJO PEDIDO activo. Paso: ${datosFlujo.paso}. Recopila datos faltantes.`
      if (datosFlujo.nombre_cliente) contextoPedido += ` Nombre: ${datosFlujo.nombre_cliente}.`
      if (datosFlujo.modalidad) contextoPedido += ` Modalidad: ${datosFlujo.modalidad}.`
      if (datosFlujo.direccion_entrega) contextoPedido += ` Dirección: ${datosFlujo.direccion_entrega}.`
      contextoPedido += ` Zonas: ${zonasTexto}.`
    }
  }

  return `Eres el asistente de "${ferreteria.nombre}" (ferretería, Perú). Atiendes por WhatsApp con lenguaje cercano y natural.

NEGOCIO: ${ferreteria.nombre} | Dir: ${ferreteria.direccion ?? 'a consultar'} | Horario: ${diasAtencion} ${horario} | Pago: ${formasPago} | Delivery: ${zonasTexto}

CATÁLOGO:
${buildCatalogoTexto(productos)}
${contextoPedido}

Responde SOLO con JSON válido:
{"intent":"...","respuesta":"...","items_solicitados":[{"nombre_buscado":"...","cantidad":N}],"numero_pedido":"...","datos_pedido":{"nombre_cliente":"...","modalidad":"delivery|recojo","direccion_entrega":"...","zona_nombre":"..."}}

INTENTS:
cotizacion - pide precio(s), extrae items_solicitados
confirmar_pedido - acepta/confirma pedido
rechazar_cotizacion - rechaza cotización aprobada
recopilar_datos_pedido - da info de pedido parcial, extrae datos_pedido
orden_completa - tiene nombre+modalidad+dirección(si delivery), extrae datos_pedido completo
faq_horario / faq_direccion / faq_delivery / faq_pagos - preguntas frecuentes
estado_pedido - consulta estado, extrae numero_pedido
solicitar_comprobante - pide boleta/comprobante/recibo de su pedido (frases: "mándame la boleta", "necesito el comprobante", "me das el recibo", "quiero la boleta", "comprobante de pago"), extrae numero_pedido si lo menciona
saludo - saludo sin pedido
pedir_humano - quiere persona real
desconocido - no se entiende

REGLAS:
- No inventes precios ni stock. Respuesta en español peruano natural. Campo "respuesta" es el mensaje WhatsApp (usa \\n para saltos).
- El sistema ajusta automáticamente la cantidad al stock disponible. NO informes al cliente sobre cantidades parciales en tu respuesta — el sistema ya lo hace.
- Zonas de delivery: solo muestran tiempo estimado. NO inventes ni menciones costo de delivery salvo que esté explícito.
- Para confirmar pedido: intent confirmar_pedido. Para pedir más cotizaciones: intent cotizacion.`
}

function buildCatalogoTexto(productos: Producto[]): string {
  if (productos.length === 0) return '(vacío)'

  const porCategoria: Record<string, Producto[]> = {}
  for (const p of productos) {
    const cat = (p.categorias as any)?.nombre ?? 'General'
    if (!porCategoria[cat]) porCategoria[cat] = []
    porCategoria[cat].push(p)
  }

  const lineas: string[] = []
  for (const [categoria, prods] of Object.entries(porCategoria)) {
    lineas.push(`[${categoria}]`)
    for (const p of prods) {
      let linea = `${p.nombre} S/${p.precio_base.toFixed(2)}/${p.unidad} stk:${p.stock}`
      if (p.reglas_descuento?.length) {
        const rangos = p.reglas_descuento
          .sort((a, b) => a.cantidad_min - b.cantidad_min)
          .map((r) => `≥${r.cantidad_min}:S/${r.precio_unitario.toFixed(2)}`)
          .join(' ')
        linea += ` desc:[${rangos}]`
      }
      if (p.modo_negociacion && p.umbral_negociacion_cantidad)
        linea += ` neg≥${p.umbral_negociacion_cantidad}`
      if (p.stock === 0) linea += ' SIN_STOCK'
      lineas.push(linea)
    }
  }
  return lineas.join('\n')
}

export function buildHistorialMensajes(
  mensajes: { role: 'cliente' | 'bot' | 'dueno'; contenido: string }[]
): { role: 'user' | 'assistant'; content: string }[] {
  return mensajes.map((m) => ({
    role: m.role === 'cliente' ? 'user' : 'assistant',
    content: m.contenido,
  }))
}
