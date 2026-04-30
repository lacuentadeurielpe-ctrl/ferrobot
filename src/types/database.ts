// ══════════════════════════════════════════════════════════════════
// Tipos TypeScript que reflejan el schema de Supabase
// ══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────
// Tipos de facturación / RUC
// ──────────────────────────────────────────────────────────────────
export type TipoRuc = 'sin_ruc' | 'ruc10' | 'ruc20'
export type RegimenTributario = 'rer' | 'rmt' | 'rus' | 'general'
export type TipoComprobante = 'nota_venta' | 'boleta' | 'factura'
export type EstadoComprobante = 'emitido' | 'anulado' | 'error'
export type TipoPersona = 'natural' | 'juridica'

export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo'

export type ModoNegociacion = 'automatico' | 'consultar_dueno'

export type EstadoCotizacion =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'enviada'
  | 'confirmada'
  | 'rechazada'

export type EstadoPedido =
  | 'programado'      // pedido con fecha futura, aún no activo
  | 'pendiente'
  | 'confirmado'
  | 'en_preparacion'
  | 'enviado'
  | 'entregado'
  | 'cancelado'

export type EstadoPago =
  | 'pendiente'
  | 'verificando'
  | 'pagado'
  | 'credito_activo'
  | 'credito_vencido'
  | 'reembolso_pendiente'

export type MetodoPago = 'efectivo' | 'yape' | 'transferencia' | 'tarjeta' | 'credito'

export type ModalidadPedido = 'delivery' | 'recojo'

export type EstadoCredito = 'activo' | 'pagado' | 'vencido'

export type EstadoConversacion = 'activa' | 'intervenida_dueno' | 'cerrada'

export type RolMensaje = 'cliente' | 'bot' | 'dueno'

export type TipoMensaje = 'texto' | 'imagen' | 'documento' | 'audio' | 'otro'

// ──────────────────────────────────────────────────────────────────
export interface DatosYape {
  numero: string
  qr_url: string | null
}

export interface DatosTransferencia {
  banco: string
  cuenta: string
  cci: string | null
  titular: string
}

export interface Ferreteria {
  id: string
  owner_id: string
  nombre: string
  direccion: string | null
  telefono_whatsapp: string
  horario_apertura: string | null   // HH:MM:SS
  horario_cierre: string | null
  dias_atencion: DiaSemana[]
  formas_pago: string[]
  mensaje_bienvenida: string | null
  mensaje_fuera_horario: string | null
  onboarding_completo: boolean
  activo: boolean
  // Configuración de comprobantes (legado)
  logo_url: string | null
  color_comprobante: string          // hex, default '#1e40af'
  mensaje_comprobante: string | null // pie personalizable
  ultimo_numero_comprobante: number
  // Resumen diario
  telefono_dueno: string | null
  resumen_diario_activo: boolean
  // Delivery
  modo_asignacion_delivery: 'manual' | 'libre'
  timeout_aceptacion_min: number
  // Métodos de pago digitales
  datos_yape: DatosYape | null
  datos_transferencia: DatosTransferencia | null
  metodos_pago_activos: string[] | null  // ['efectivo','yape','transferencia','tarjeta','credito']
  // ── Facturación / RUC (F1) ──────────────────────────────────────
  tipo_ruc: TipoRuc
  ruc: string | null
  razon_social: string | null
  nombre_comercial: string | null
  regimen_tributario: RegimenTributario | null
  serie_boletas: string               // default 'B001'
  serie_facturas: string              // default 'F001'
  igv_incluido_en_precios: boolean
  representante_legal_nombre: string | null
  representante_legal_dni: string | null
  representante_legal_cargo: string | null
  // ── Nubefact (F3) ───────────────────────────────────────────────
  nubefact_token_enc: string | null   // cifrado en BD, nunca exponer al cliente
  nubefact_ruta:      string | null   // URL de la cuenta Nubefact (no secreta)
  nubefact_modo: 'prueba' | 'produccion'
  // ────────────────────────────────────────────────────────────────
  created_at: string
  updated_at: string
}

export interface Comprobante {
  id: string
  ferreteria_id: string
  pedido_id: string | null
  // Legado (comprobantes internos pre-F1)
  numero_comprobante: string | null  // CP-000001
  pdf_url: string | null
  enviado_whatsapp: boolean
  enviado_at: string | null
  error_envio: string | null
  // Nuevos campos F1
  tipo: TipoComprobante | null
  serie: string | null
  numero: number | null
  numero_completo: string | null     // NV-B001-000001
  estado: EstadoComprobante
  subtotal: number | null
  igv: number
  total: number | null
  cliente_nombre: string | null
  cliente_ruc_dni: string | null
  nubefact_id: string | null         // F3
  nubefact_hash: string | null       // F3
  xml_url: string | null             // F3
  emitido_por: string | null         // 'bot' | 'dashboard'
  created_at: string
}

export interface ZonaDelivery {
  id: string
  ferreteria_id: string
  nombre: string
  tiempo_estimado_min: number
  activo: boolean
}

export interface Categoria {
  id: string
  ferreteria_id: string
  nombre: string
  orden: number
}

export interface Producto {
  id: string
  ferreteria_id: string
  categoria_id: string | null
  nombre: string
  descripcion: string | null
  precio_base: number
  precio_compra: number          // costo al proveedor
  unidad: string
  stock: number
  stock_minimo: number | null   // alerta cuando stock <= este valor
  modo_negociacion: boolean
  umbral_negociacion_cantidad: number | null
  afecto_igv: boolean            // F1: si aplica IGV al producto
  activo: boolean
  created_at: string
  updated_at: string
  // joins
  categorias?: Categoria
  reglas_descuento?: ReglaDescuento[]
}

export interface ReglaDescuento {
  id: string
  producto_id: string
  cantidad_min: number
  cantidad_max: number | null
  precio_unitario: number
  modo: ModoNegociacion
}

// Personalización del bot por tenant — almacenado como JSONB en configuracion_bot.perfil_bot
export interface PerfilBot {
  tipo_negocio?:        string  // "ferretería" | "farmacia" | "bodega" | "restaurante" | ...
  descripcion_negocio?: string  // texto libre con expertise y contexto del negocio
  tono_bot?:            string  // "amigable_peruano" | "formal" | "casual"
  nombre_bot?:          string  // nombre del asistente virtual, ej: "Ferrobot"
}

// Agentes configurables por tenant — F4
// Semántica opt-out: campo ausente o true = activo, false = desactivado
export interface AgentesActivos {
  ventas?:       boolean  // guardar_cotizacion, crear_pedido, agregar_a_pedido_reciente, modificar_pedido
  comprobantes?: boolean  // solicitar_comprobante
  upsell?:       boolean  // sugerir_complementario
  crm?:          boolean  // historial_cliente, guardar_dato_cliente
}

export interface ConfiguracionBot {
  id: string
  ferreteria_id: string
  timeout_sesion_minutos: number
  max_mensajes_contexto: number
  umbral_monto_negociacion: number | null
  modo_negociacion_global: ModoNegociacion
  timeout_intervencion_dueno: number
  margen_minimo_porcentaje: number   // alerta si margen cae por debajo de este %
  perfil_bot: PerfilBot              // F3: personalización del bot — default {}
  agentes_activos: AgentesActivos    // F4: tools habilitadas por agente — default todo ON
  cierre_cotizacion_activo: boolean  // F5: cierre natural post-cotización — default true
  umbral_upsell_soles: number        // F5: monto mínimo S/ para activar upsell — default 0
}

export interface Cliente {
  id: string
  ferreteria_id: string
  telefono: string
  nombre: string | null
  ruc_cliente: string | null     // F1: RUC del cliente (para facturas)
  tipo_persona: TipoPersona | null
  created_at: string
  updated_at: string
}

export interface DatosFlujoPedido {
  cotizacion_id?: string
  nombre_cliente?: string
  modalidad?: 'delivery' | 'recojo'
  direccion_entrega?: string
  zona_nombre?: string
  paso: 'esperando_confirmacion' | 'esperando_nombre' | 'esperando_modalidad' | 'esperando_direccion' | 'listo'
}

export interface Conversacion {
  id: string
  ferreteria_id: string
  cliente_id: string
  estado: EstadoConversacion
  bot_pausado: boolean
  dueno_activo_at: string | null
  ultima_actividad: string
  datos_flujo: DatosFlujoPedido | null
  created_at: string
  // joins
  clientes?: Cliente
  mensajes?: Mensaje[]
}

export interface Mensaje {
  id: string
  conversacion_id: string
  role: RolMensaje
  contenido: string
  tipo: TipoMensaje
  ycloud_message_id: string | null
  created_at: string
}

export interface Cotizacion {
  id: string
  ferreteria_id: string
  conversacion_id: string | null
  cliente_id: string | null
  estado: EstadoCotizacion
  total: number
  requiere_aprobacion: boolean
  notas_dueno: string | null
  created_at: string
  aprobada_at: string | null
  // joins
  items_cotizacion?: ItemCotizacion[]
  clientes?: Cliente
}

export interface ItemCotizacion {
  id: string
  cotizacion_id: string
  producto_id: string | null
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
  precio_original: number
  subtotal: number
  no_disponible: boolean
  nota_disponibilidad: string | null
}

export interface Pedido {
  id: string
  ferreteria_id: string
  cotizacion_id: string | null
  cliente_id: string | null
  numero_pedido: string
  nombre_cliente: string
  telefono_cliente: string
  direccion_entrega: string | null
  zona_delivery_id: string | null
  modalidad: ModalidadPedido
  estado: EstadoPedido
  total: number
  costo_total: number              // suma de costos de items
  notas: string | null
  // pago
  metodo_pago: MetodoPago | null
  estado_pago: EstadoPago
  pago_confirmado_por: string | null
  pago_confirmado_at: string | null
  // delivery
  repartidor_id: string | null
  cobrado_monto: number | null
  cobrado_metodo: string | null
  incidencia_tipo: string | null
  incidencia_desc: string | null
  motivo_cancelacion: string | null
  created_at: string
  updated_at: string
  // joins
  items_pedido?: ItemPedido[]
  zonas_delivery?: ZonaDelivery
  clientes?: Cliente
}

export interface Credito {
  id: string
  ferreteria_id: string
  cliente_id: string | null
  pedido_id: string | null
  monto_total: number
  monto_pagado: number
  fecha_limite: string             // DATE
  estado: EstadoCredito
  aprobado_por: string | null
  notas: string | null
  created_at: string
  updated_at: string
  // joins
  clientes?: Cliente
  pedidos?: Pedido
  abonos_credito?: AbonoCredito[]
}

export interface AbonoCredito {
  id: string
  credito_id: string
  monto: number
  metodo_pago: MetodoPago | null
  notas: string | null
  registrado_por: string | null
  created_at: string
}

export interface Rendicion {
  id: string
  ferreteria_id: string
  repartidor_id: string
  fecha: string                    // DATE
  monto_esperado: number
  monto_recibido: number | null
  diferencia: number | null        // columna generada
  notas: string | null
  confirmado_por: string | null
  confirmado_at: string | null
  created_at: string
}

export interface ItemPedido {
  id: string
  pedido_id: string
  producto_id: string | null
  nombre_producto: string
  unidad: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number           // snapshot del precio_compra al confirmar
  subtotal: number
}

// ──────────────────────────────────────────────────────────────────
// Tipos de utilidad para el panel
// ──────────────────────────────────────────────────────────────────

export interface MetricasDashboard {
  cotizaciones_hoy: number
  pedidos_hoy: number
  pedidos_pendientes: number
  ingresos_hoy: number
  productos_mas_consultados: { nombre: string; consultas: number }[]
}

// ══════════════════════════════════════════════════════════════════
// SAAS MULTI-TENANT — nuevas interfaces
// ══════════════════════════════════════════════════════════════════

export type NivelSuperadmin = 'admin' | 'soporte'
export type EstadoTenant = 'trial' | 'activo' | 'suspendido' | 'cancelado'
export type EstadoSuscripcion = 'trial' | 'activo' | 'vencido' | 'suspendido'
export type EstadoConexionYCloud = 'activo' | 'error' | 'desconectado' | 'pendiente'
export type EstadoConexionMP = 'conectado' | 'expirado' | 'error' | 'desconectado'
export type OrigenCredito = 'bot' | 'inventario' | 'reporte' | 'crm' | 'pago'
export type TipoIncidencia =
  | 'ycloud_error'
  | 'ia_error'
  | 'mp_error'
  | 'webhook_caido'
  | 'creditos_agotados'
  | 'creditos_bajos'
  | 'token_expirado'

// Tipo de tarea IA → modelo y créditos
export type TipoTareaIA =
  | 'respuesta_simple'     // DeepSeek — 1 crédito
  | 'cotizacion'           // GPT-4o mini — 3 créditos
  | 'pedido'               // GPT-4o mini — 3 créditos
  | 'situacion_compleja'   // Claude — 8 créditos
  | 'audio_whisper'        // Whisper — 2 créditos
  | 'imagen_vision'        // GPT-4o Vision — 4 créditos
  | 'analisis_inventario'  // DeepSeek — 2 créditos
  | 'reporte'              // GPT-4o mini — 5 créditos
  | 'crm'                  // DeepSeek — 1 crédito

export const COSTO_CREDITOS: Record<TipoTareaIA, number> = {
  respuesta_simple:   1,
  cotizacion:         3,
  pedido:             3,
  situacion_compleja: 8,
  audio_whisper:      2,
  imagen_vision:      4,
  analisis_inventario: 2,
  reporte:            5,
  crm:                1,
}

export const MODELO_POR_TAREA: Record<TipoTareaIA, string> = {
  respuesta_simple:    'deepseek-chat',
  cotizacion:          'gpt-4o-mini',
  pedido:              'gpt-4o-mini',
  situacion_compleja:  'claude-3-5-sonnet-20241022',
  audio_whisper:       'whisper-1',
  imagen_vision:       'gpt-4o-mini',
  analisis_inventario: 'deepseek-chat',
  reporte:             'gpt-4o-mini',
  crm:                 'deepseek-chat',
}

export interface Superadmin {
  id: string
  user_id: string
  nombre: string
  email: string
  nivel: NivelSuperadmin
  activo: boolean
  created_at: string
}

export interface Plan {
  id: string
  nombre: string
  creditos_mes: number
  precio_mensual: number
  precio_exceso: number
  activo: boolean
  created_at: string
}

export interface Suscripcion {
  id: string
  ferreteria_id: string
  plan_id: string
  creditos_disponibles: number
  creditos_del_mes: number
  creditos_extra: number
  ciclo_inicio: string | null      // DATE
  ciclo_fin: string | null         // DATE
  proximo_cobro: string | null     // DATE
  estado: EstadoSuscripcion
  created_at: string
  updated_at: string
  // joins
  planes?: Plan
}

export interface MovimientoCredito {
  id: string
  ferreteria_id: string
  tipo_tarea: TipoTareaIA
  modelo_usado: string
  creditos_usados: number
  tokens_entrada: number | null
  tokens_salida: number | null
  costo_usd: number | null
  conversacion_id: string | null
  origen: OrigenCredito
  created_at: string
}

export interface RecargaCreditos {
  id: string
  ferreteria_id: string
  creditos: number
  motivo: string
  monto_cobrado: number
  agregado_por: string | null
  created_at: string
}

export interface ConfiguracionYCloud {
  id: string
  ferreteria_id: string
  api_key_enc: string              // encriptado en BD, desencriptado en memoria
  webhook_secret_enc: string | null
  numero_whatsapp: string
  estado_conexion: EstadoConexionYCloud
  ultimo_mensaje_at: string | null
  ultimo_error: string | null
  ultimo_error_at: string | null
  configurado_por: string | null
  configurado_at: string
  updated_at: string
}

export interface ConfiguracionMercadoPago {
  id: string
  ferreteria_id: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  mp_user_id: string | null
  mp_email: string | null
  expira_at: string | null
  estado: EstadoConexionMP
  conectado_at: string | null
  created_at: string
  updated_at: string
}

export interface IncidenciaSistema {
  id: string
  ferreteria_id: string | null
  tipo: TipoIncidencia
  detalle: string | null
  resuelto: boolean
  resuelto_at: string | null
  created_at: string
}

// ══════════════════════════════════════════════════════════════════
// CONTABILIDAD — F5 Libros Contables
// ══════════════════════════════════════════════════════════════════

export type TipoLibro = 'ventas' | 'compras' | 'inventario'
export type EstadoLibro = 'borrador' | 'cerrado'

export interface LibroContable {
  id: string
  ferreteria_id: string
  periodo: string              // YYYYMM
  tipo_libro: TipoLibro
  estado: EstadoLibro
  total_registros: number
  total_ventas: number
  total_igv: number
  total_base_imponible: number
  total_boletas: number
  total_facturas: number
  contenido_ple: string | null
  generado_at: string
  cerrado_at: string | null
  created_at: string
  updated_at: string
}

// Ferreteria extendida con campos SaaS
export interface FerreteriaSaaS extends Ferreteria {
  plan_id: string | null
  estado_tenant: EstadoTenant
  trial_hasta: string | null
  suspendido_motivo: string | null
  suspendido_at: string | null
  // joins
  planes?: Plan
  suscripciones?: Suscripcion
}
