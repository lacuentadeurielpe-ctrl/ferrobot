/**
 * Autenticación del superadmin.
 *
 * Doble protección:
 * 1. El usuario debe estar autenticado en Supabase Auth
 * 2. Debe existir un registro en la tabla `superadmins` con ese user_id
 *
 * Las rutas de API de superadmin verifican además el header
 * x-superadmin-secret === process.env.SUPERADMIN_SECRET
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Superadmin } from '@/types/database'

export interface SuperadminSession {
  userId: string
  superadminId: string
  nombre: string
  email: string
  nivel: 'admin' | 'soporte'
}

/**
 * Verifica que el request viene de un superadmin autenticado.
 * Usado en Server Components del panel /superadmin/*.
 * @returns SuperadminSession o null si no está autenticado.
 */
export async function getSuperadminSession(): Promise<SuperadminSession | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data: sa } = await admin
      .from('superadmins')
      .select('id, nombre, email, nivel, activo')
      .eq('user_id', user.id)
      .eq('activo', true)
      .single()

    if (!sa) return null

    return {
      userId:       user.id,
      superadminId: sa.id,
      nombre:       sa.nombre,
      email:        sa.email,
      nivel:        sa.nivel as 'admin' | 'soporte',
    }
  } catch {
    return null
  }
}

/**
 * Verifica la autenticación de superadmin en rutas de API.
 * Valida:
 * 1. Header x-superadmin-secret
 * 2. Sesión Supabase + registro en superadmins
 *
 * @returns SuperadminSession o null
 */
export async function verificarSuperadminAPI(
  request: Request
): Promise<SuperadminSession | null> {
  // Verificar secret header (segunda capa de protección)
  const secret = process.env.SUPERADMIN_SECRET
  if (secret) {
    const headerSecret = request.headers.get('x-superadmin-secret')
    if (headerSecret !== secret) return null
  }

  return getSuperadminSession()
}

/**
 * Verifica que el superadmin tiene nivel 'admin' (no solo soporte).
 * Usado para acciones destructivas o de escritura.
 */
export async function requireSuperadminAdmin(
  request: Request
): Promise<SuperadminSession | null> {
  const session = await verificarSuperadminAPI(request)
  if (!session) return null
  if (session.nivel !== 'admin') return null
  return session
}

/**
 * Obtiene los datos completos de un superadmin por su ID.
 */
export async function getSuperadminById(id: string): Promise<Superadmin | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('superadmins')
    .select('*')
    .eq('id', id)
    .single()
  return data
}
