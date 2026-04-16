// Sistema de permisos granulares por empleado
// El dueño siempre tiene todos los permisos en true automáticamente.
// Los empleados tienen permisos individuales configurados por el dueño.

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type Permiso =
  // Ventas y pedidos
  | 'ver_pedidos'
  | 'crear_pedidos'
  | 'editar_pedidos'
  | 'corregir_pedidos'
  | 'cancelar_pedidos'
  | 'ver_historial_clientes'
  // Inventario
  | 'ver_stock'
  | 'agregar_productos'
  | 'editar_precios'
  | 'entrada_mercaderia'
  | 'descuento_stock_manual'
  | 'ver_alertas_stock'
  | 'exportar_inventario'
  // Caja y pagos
  | 'ver_pedidos_cobro'
  | 'registrar_pagos'
  | 'emitir_comprobantes'
  | 'ver_caja_dia'
  | 'registrar_gastos'
  | 'ver_creditos'
  | 'registrar_abonos'
  | 'aprobar_creditos'
  // Delivery
  | 'delivery_ver_pedidos'
  | 'delivery_aceptar'
  | 'delivery_marcar_entregado'
  | 'delivery_reportar_problema'
  | 'delivery_registrar_cobro'
  | 'delivery_ver_rendicion'
  // Administración
  | 'ver_dashboard'
  | 'ver_utilidades'
  | 'gestionar_empleados'
  | 'configurar_ferreteria'

export type PermisoMap = Record<Permiso, boolean>

export type PlantillaPermiso =
  | 'solo_reparte'
  | 'atiende_tienda'
  | 'hace_de_todo'
  | 'de_confianza'
  | 'personalizado'

// ── Permisos base: todos en false ─────────────────────────────────────────────

const TODOS_FALSO: PermisoMap = {
  ver_pedidos: false,
  crear_pedidos: false,
  editar_pedidos: false,
  corregir_pedidos: false,
  cancelar_pedidos: false,
  ver_historial_clientes: false,
  ver_stock: false,
  agregar_productos: false,
  editar_precios: false,
  entrada_mercaderia: false,
  descuento_stock_manual: false,
  ver_alertas_stock: false,
  exportar_inventario: false,
  ver_pedidos_cobro: false,
  registrar_pagos: false,
  emitir_comprobantes: false,
  ver_caja_dia: false,
  registrar_gastos: false,
  ver_creditos: false,
  registrar_abonos: false,
  aprobar_creditos: false,
  delivery_ver_pedidos: false,
  delivery_aceptar: false,
  delivery_marcar_entregado: false,
  delivery_reportar_problema: false,
  delivery_registrar_cobro: false,
  delivery_ver_rendicion: false,
  ver_dashboard: false,
  ver_utilidades: false,
  gestionar_empleados: false,
  configurar_ferreteria: false,
}

// ── Permisos del dueño: todos en true ─────────────────────────────────────────

export const PERMISOS_DUENO: PermisoMap = Object.fromEntries(
  Object.keys(TODOS_FALSO).map((k) => [k, true])
) as PermisoMap

// ── Plantillas ────────────────────────────────────────────────────────────────

export const PLANTILLAS: Record<PlantillaPermiso, PermisoMap> = {
  solo_reparte: {
    ...TODOS_FALSO,
    delivery_ver_pedidos: true,
    delivery_aceptar: true,
    delivery_marcar_entregado: true,
    delivery_reportar_problema: true,
    delivery_registrar_cobro: true,
    delivery_ver_rendicion: true,
  },

  atiende_tienda: {
    ...TODOS_FALSO,
    ver_pedidos: true,
    crear_pedidos: true,
    ver_historial_clientes: true,
    ver_stock: true,
    ver_alertas_stock: true,
    ver_pedidos_cobro: true,
    registrar_pagos: true,
    emitir_comprobantes: true,
  },

  hace_de_todo: {
    ...TODOS_FALSO,
    ver_pedidos: true,
    crear_pedidos: true,
    editar_pedidos: true,
    corregir_pedidos: true,
    cancelar_pedidos: true,
    ver_historial_clientes: true,
    ver_stock: true,
    agregar_productos: true,
    editar_precios: true,
    entrada_mercaderia: true,
    descuento_stock_manual: true,
    ver_alertas_stock: true,
    exportar_inventario: true,
    ver_pedidos_cobro: true,
    registrar_pagos: true,
    emitir_comprobantes: true,
    ver_caja_dia: true,
    registrar_gastos: true,
    ver_creditos: true,
    registrar_abonos: true,
    delivery_ver_pedidos: true,
    delivery_aceptar: true,
    delivery_marcar_entregado: true,
    delivery_reportar_problema: true,
    delivery_registrar_cobro: true,
    delivery_ver_rendicion: true,
    ver_dashboard: true,
    // ver_utilidades: false — no ve ganancias
    // gestionar_empleados: false — no gestiona personal
    // configurar_ferreteria: false — no toca configuración
  },

  de_confianza: {
    ...PERMISOS_DUENO,
  },

  personalizado: {
    ...TODOS_FALSO,
  },
}

export const ETIQUETAS_PLANTILLA: Record<PlantillaPermiso, string> = {
  solo_reparte: 'Solo reparte',
  atiende_tienda: 'Atiende tienda',
  hace_de_todo: 'Hace de todo',
  de_confianza: 'De confianza',
  personalizado: 'Personalizado',
}

export const DESCRIPCIONES_PLANTILLA: Record<PlantillaPermiso, string> = {
  solo_reparte: 'Solo ve y gestiona sus entregas',
  atiende_tienda: 'Vende, cobra y controla stock básico',
  hace_de_todo: 'Acceso completo excepto configuración y utilidades',
  de_confianza: 'Acceso total igual que el dueño',
  personalizado: 'Elige permiso por permiso',
}

// ── Grupos para mostrar en UI ─────────────────────────────────────────────────

export interface GrupoPermiso {
  label: string
  permisos: Array<{ key: Permiso; label: string }>
}

export const GRUPOS_PERMISOS: GrupoPermiso[] = [
  {
    label: 'Ventas y pedidos',
    permisos: [
      { key: 'ver_pedidos',           label: 'Ver pedidos entrantes' },
      { key: 'crear_pedidos',         label: 'Crear pedidos manuales' },
      { key: 'editar_pedidos',        label: 'Editar pedidos antes de confirmar' },
      { key: 'corregir_pedidos',      label: 'Corregir errores en pedidos' },
      { key: 'cancelar_pedidos',      label: 'Cancelar pedidos' },
      { key: 'ver_historial_clientes',label: 'Ver historial de clientes' },
    ],
  },
  {
    label: 'Inventario',
    permisos: [
      { key: 'ver_stock',             label: 'Ver stock actual' },
      { key: 'agregar_productos',     label: 'Agregar productos al catálogo' },
      { key: 'editar_precios',        label: 'Editar precios de productos' },
      { key: 'entrada_mercaderia',    label: 'Registrar entrada de mercadería' },
      { key: 'descuento_stock_manual',label: 'Descontar stock manualmente' },
      { key: 'ver_alertas_stock',     label: 'Ver alertas de stock bajo' },
      { key: 'exportar_inventario',   label: 'Exportar inventario' },
    ],
  },
  {
    label: 'Caja y pagos',
    permisos: [
      { key: 'ver_pedidos_cobro',     label: 'Ver pedidos pendientes de cobro' },
      { key: 'registrar_pagos',       label: 'Registrar pagos recibidos' },
      { key: 'emitir_comprobantes',   label: 'Emitir comprobantes' },
      { key: 'ver_caja_dia',          label: 'Ver resumen de caja del día' },
      { key: 'registrar_gastos',      label: 'Registrar gastos' },
      { key: 'ver_creditos',          label: 'Ver créditos pendientes' },
      { key: 'registrar_abonos',      label: 'Registrar abonos a créditos' },
      { key: 'aprobar_creditos',      label: 'Aprobar créditos a clientes' },
    ],
  },
  {
    label: 'Delivery',
    permisos: [
      { key: 'delivery_ver_pedidos',      label: 'Ver pedidos disponibles para repartir' },
      { key: 'delivery_aceptar',          label: 'Aceptar pedidos para repartir' },
      { key: 'delivery_marcar_entregado', label: 'Marcar pedido como entregado' },
      { key: 'delivery_reportar_problema',label: 'Reportar problema en entrega' },
      { key: 'delivery_registrar_cobro',  label: 'Registrar cobro recibido en entrega' },
      { key: 'delivery_ver_rendicion',    label: 'Ver resumen de rendición del día' },
    ],
  },
  {
    label: 'Administración',
    permisos: [
      { key: 'ver_dashboard',         label: 'Ver métricas y dashboard' },
      { key: 'ver_utilidades',        label: 'Ver utilidades y ganancias' },
      { key: 'gestionar_empleados',   label: 'Gestionar otros empleados' },
      { key: 'configurar_ferreteria', label: 'Configurar la ferretería' },
    ],
  },
]

// ── Helper principal ──────────────────────────────────────────────────────────

/**
 * Verifica si una sesión tiene un permiso específico.
 * El dueño siempre retorna true.
 * Para empleados, consulta el mapa de permisos de su sesión.
 */
export function checkPermiso(
  session: { rol: string; permisos: Partial<PermisoMap> },
  permiso: Permiso
): boolean {
  if (session.rol === 'dueno') return true
  return session.permisos[permiso] === true
}

/**
 * Detecta qué plantilla corresponde al mapa de permisos actual.
 * Útil para mostrar el selector de plantilla en la UI.
 */
export function detectarPlantilla(permisos: Partial<PermisoMap>): PlantillaPermiso {
  const todasLasClaves = Object.keys(TODOS_FALSO) as Permiso[]

  for (const [nombre, plantilla] of Object.entries(PLANTILLAS) as [PlantillaPermiso, PermisoMap][]) {
    if (nombre === 'personalizado') continue
    const coincide = todasLasClaves.every(
      (k) => (permisos[k] ?? false) === plantilla[k]
    )
    if (coincide) return nombre
  }

  return 'personalizado'
}

/**
 * Fusiona los permisos guardados en DB con los defaults en false.
 * Garantiza que siempre se retorne un PermisoMap completo.
 */
export function normalizarPermisos(raw: Record<string, unknown>): PermisoMap {
  return Object.fromEntries(
    Object.keys(TODOS_FALSO).map((k) => [k, raw[k] === true])
  ) as PermisoMap
}
