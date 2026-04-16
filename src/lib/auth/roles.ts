// Utilidad server-side para obtener el rol y permisos del usuario actual
import { createClient } from '@/lib/supabase/server'
import { type PermisoMap, PERMISOS_DUENO, normalizarPermisos } from '@/lib/auth/permisos'

export type Rol = 'dueno' | 'vendedor'

export interface SessionInfo {
  userId: string
  ferreteriaId: string
  rol: Rol
  nombreFerreteria: string
  onboardingCompleto: boolean
  permisos: PermisoMap
}

/**
 * Obtiene la ferretería, el rol y los permisos del usuario autenticado.
 * - Dueño: todos los permisos en true automáticamente.
 * - Empleado: permisos del campo `permisos JSONB` en miembros_ferreteria.
 * React/Next.js deduplica esta llamada dentro del mismo request.
 */
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. ¿Es dueño?
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, onboarding_completo')
    .eq('owner_id', user.id)
    .single()

  if (ferreteria) {
    return {
      userId: user.id,
      ferreteriaId: ferreteria.id,
      rol: 'dueno',
      nombreFerreteria: ferreteria.nombre,
      onboardingCompleto: ferreteria.onboarding_completo ?? false,
      permisos: PERMISOS_DUENO,
    }
  }

  // 2. ¿Es empleado invitado?
  const { data: miembro } = await supabase
    .from('miembros_ferreteria')
    .select('ferreteria_id, rol, nombre, permisos, ferreterias(id, nombre, onboarding_completo)')
    .eq('user_id', user.id)
    .eq('activo', true)
    .single()

  if (miembro) {
    const ferr = miembro.ferreterias as any
    return {
      userId: user.id,
      ferreteriaId: miembro.ferreteria_id,
      rol: miembro.rol as Rol,
      nombreFerreteria: ferr?.nombre ?? 'Ferretería',
      onboardingCompleto: ferr?.onboarding_completo ?? true,
      permisos: normalizarPermisos((miembro.permisos as Record<string, unknown>) ?? {}),
    }
  }

  return null
}
