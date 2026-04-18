/**
 * Utilidades para cargar configuración de tenant en tiempo de ejecución.
 * Centralizamos aquí la carga + desencriptado de credenciales por ferretería.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { desencriptar } from '@/lib/encryption'

/**
 * Obtiene la API key de YCloud de un tenant (desencriptada).
 * Fallback: variable de entorno YCLOUD_API_KEY (compatibilidad pre-ETAPA 1).
 */
export async function getYCloudApiKey(ferreteriaId: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('configuracion_ycloud')
      .select('api_key_enc')
      .eq('ferreteria_id', ferreteriaId)
      .single()

    if (data?.api_key_enc) {
      return await desencriptar(data.api_key_enc)
    }
  } catch {
    // Si no hay configuración o falla la desencriptación → usar env var global
  }

  const globalKey = process.env.YCLOUD_API_KEY
  if (globalKey) {
    // DEPRECADO: La API key global de YCloud está siendo reemplazada por
    // configuración por-tenant (configuracion_ycloud). Migrar usando
    // Settings → Conexión WhatsApp en el panel de la ferretería.
    console.warn(`[tenant] Usando YCLOUD_API_KEY global (fallback) para ferretería ${ferreteriaId}. Migrar a configuración por-tenant.`)
  }
  return globalKey
}

/**
 * Obtiene el webhook secret de YCloud de un tenant (desencriptado).
 */
export async function getYCloudWebhookSecret(ferreteriaId: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('configuracion_ycloud')
      .select('webhook_secret_enc')
      .eq('ferreteria_id', ferreteriaId)
      .single()

    if (data?.webhook_secret_enc) {
      return await desencriptar(data.webhook_secret_enc)
    }
  } catch {
    // Si no hay configuración → usar env var global
  }

  const globalSecret = process.env.YCLOUD_WEBHOOK_SECRET
  if (globalSecret) {
    // DEPRECADO: El webhook secret global está siendo reemplazado por
    // configuración por-tenant. Migrar usando Settings → Conexión WhatsApp.
    console.warn(`[tenant] Usando YCLOUD_WEBHOOK_SECRET global (fallback) para ferretería ${ferreteriaId}. Migrar a configuración por-tenant.`)
  }
  return globalSecret
}
