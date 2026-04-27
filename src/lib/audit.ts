/**
 * audit.ts — helper para registrar acciones auditadas.
 *
 * Siempre usa createAdminClient() para poder insertar desde cualquier
 * contexto (API routes con sesión de usuario y cron/webhook sin sesión).
 *
 * REGLA CRÍTICA: ferreteriaId SIEMPRE viene de session.ferreteriaId
 * en el servidor — nunca del cuerpo del request ni del cliente.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type AccionAuditada =
  | 'cambiar_estado_pedido'
  | 'cancelar_pedido'
  | 'aprobar_pago'
  | 'rechazar_pago'
  | 'vincular_pago'
  | 'crear_empleado'
  | 'eliminar_empleado'
  | 'activar_empleado'
  | 'desactivar_empleado'
  | 'cambiar_permisos_empleado'
  | 'reset_password_empleado'
  | 'set_pin_empleado'
  | 'crear_cotizacion'
  | 'actualizar_configuracion'

interface LogAccionParams {
  ferreteriaId: string
  usuarioId: string
  usuarioNombre?: string | null
  accion: AccionAuditada
  entidad?: string
  entidadId?: string
  detalle?: Record<string, unknown>
}

/**
 * Registra una acción en la tabla acciones_auditadas.
 * Fire-and-forget: no lanza si falla (para no romper el flujo principal).
 */
export async function logAccion(params: LogAccionParams): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('acciones_auditadas').insert({
      ferreteria_id: params.ferreteriaId,
      usuario_id:    params.usuarioId,
      usuario_nombre: params.usuarioNombre ?? null,
      accion:        params.accion,
      entidad:       params.entidad ?? null,
      entidad_id:    params.entidadId ?? null,
      detalle:       params.detalle ?? null,
    })
  } catch {
    // No propagamos el error — la auditoría no debe romper el flujo de negocio
    console.error('[audit] logAccion falló silenciosamente', params.accion)
  }
}
