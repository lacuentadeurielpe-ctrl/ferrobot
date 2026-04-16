// Utilidad server-side para obtener el rol del usuario actual
import { createClient } from '@/lib/supabase/server'

export type Rol = 'dueno' | 'vendedor'

export interface SessionInfo {
  userId: string
  ferreteriaId: string
  rol: Rol
  nombreFerreteria: string
  onboardingCompleto: boolean
}

/**
 * Obtiene la ferretería y el rol del usuario autenticado.
 * Funciona tanto para dueños como para vendedores invitados.
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
    }
  }

  // 2. ¿Es vendedor invitado?
  const { data: miembro } = await supabase
    .from('miembros_ferreteria')
    .select('ferreteria_id, rol, nombre, ferreterias(id, nombre, onboarding_completo)')
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
    }
  }

  return null
}
