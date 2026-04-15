// ══════════════════════════════════════════════════════════════════
// Tipos TypeScript que reflejan el schema de Supabase
// ══════════════════════════════════════════════════════════════════

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
  | 'pendiente'
  | 'confirmado'
  | 'en_preparacion'
  | 'enviado'
  | 'entregado'
  | 'cancelado'

export type ModalidadPedido = 'delivery' | 'recojo'

export type EstadoConversacion = 'activa' | 'intervenida_dueno' | 'cerrada'

export type RolMensaje = 'cliente' | 'bot' | 'dueno'

export type TipoMensaje = 'texto' | 'imagen' | 'documento' | 'audio' | 'otro'

// ──────────────────────────────────────────────────────────────────
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
  // Configuración de comprobantes
  logo_url: string | null
  color_comprobante: string          // hex, default '#1e40af'
  mensaje_comprobante: string | null // pie personalizable
  ultimo_numero_comprobante: number
  created_at: string
  updated_at: string
}

export interface Comprobante {
  id: string
  ferreteria_id: string
  pedido_id: string
  numero_comprobante: string         // CP-000001
  pdf_url: string
  enviado_whatsapp: boolean
  enviado_at: string | null
  error_envio: string | null
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
  modo_negociacion: boolean
  umbral_negociacion_cantidad: number | null
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

export interface ConfiguracionBot {
  id: string
  ferreteria_id: string
  timeout_sesion_minutos: number
  max_mensajes_contexto: number
  umbral_monto_negociacion: number | null
  modo_negociacion_global: ModoNegociacion
  timeout_intervencion_dueno: number
  margen_minimo_porcentaje: number   // alerta si margen cae por debajo de este %
}

export interface Cliente {
  id: string
  ferreteria_id: string
  telefono: string
  nombre: string | null
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
  created_at: string
  updated_at: string
  // joins
  items_pedido?: ItemPedido[]
  zonas_delivery?: ZonaDelivery
  clientes?: Cliente
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
