/**
 * Gestión de créditos IA por tenant.
 *
 * Flujo por cada llamada a la IA:
 * 1. verificarYDescontarCreditos()  ← antes de llamar al modelo
 * 2. registrarMovimiento()           ← después (con tokens/costo reales)
 *
 * Si no hay créditos, el bot entra en "modo básico" (respuestas predefinidas,
 * sin llamar a ningún modelo de IA).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  COSTO_CREDITOS,
  MODELO_POR_TAREA,
  type TipoTareaIA,
  type OrigenCredito,
} from '@/types/database'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ResultadoCreditos {
  ok: boolean
  creditosRestantes?: number
  motivo?: 'sin_suscripcion' | 'creditos_insuficientes' | 'tenant_suspendido'
}

export interface RegistroMovimientoParams {
  ferreteriaId: string
  tipoTarea: TipoTareaIA
  conversacionId?: string | null
  origen?: OrigenCredito
  // Opcionales — se completan después de la llamada al modelo
  tokensEntrada?: number
  tokensSalida?: number
  costoUsd?: number
}

// ── Costo en USD estimado por modelo ─────────────────────────────────────────
// Solo para el panel de superadmin (reference only — no se cobra así)
const COSTO_USD_POR_1K_TOKENS: Record<string, { entrada: number; salida: number }> = {
  'deepseek-chat':               { entrada: 0.00014, salida: 0.00028 },
  'gpt-4o-mini':                 { entrada: 0.00015, salida: 0.00060 },
  'claude-3-5-sonnet-20241022':  { entrada: 0.00300, salida: 0.01500 },
  'whisper-1':                   { entrada: 0.00600, salida: 0       }, // por minuto, aprox
  'gpt-4o':                      { entrada: 0.00500, salida: 0.01500 },
}

export function estimarCostoUsd(
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number
): number {
  const tarifa = COSTO_USD_POR_1K_TOKENS[modelo]
  if (!tarifa) return 0
  return (
    (tokensEntrada / 1000) * tarifa.entrada +
    (tokensSalida / 1000) * tarifa.salida
  )
}

// ── Verificar si el tenant tiene créditos ────────────────────────────────────

/**
 * Comprueba si la ferretería tiene créditos suficientes para la tarea.
 * No descuenta — solo consulta.
 */
export async function tieneCreditos(
  ferreteriaId: string,
  tipoTarea: TipoTareaIA
): Promise<boolean> {
  const admin = createAdminClient()
  const creditos = COSTO_CREDITOS[tipoTarea]

  const { data } = await admin.rpc('tiene_creditos', {
    p_ferreteria_id: ferreteriaId,
    p_creditos_necesarios: creditos,
  })

  return data === true
}

// ── Verificar y descontar atómicamente ───────────────────────────────────────

/**
 * Verifica y descuenta créditos de forma atómica antes de llamar al modelo.
 * Devuelve `ok: false` si no hay suscripción activa o créditos insuficientes.
 *
 * @example
 * const resultado = await verificarYDescontarCreditos(ferreteriaId, 'cotizacion')
 * if (!resultado.ok) return respuestaModoBasico()
 * const respuesta = await llamarDeepSeek(mensajes)
 * await registrarMovimiento({ ferreteriaId, tipoTarea: 'cotizacion', ... })
 */
export async function verificarYDescontarCreditos(
  ferreteriaId: string,
  tipoTarea: TipoTareaIA
): Promise<ResultadoCreditos> {
  const admin = createAdminClient()
  const creditosNecesarios = COSTO_CREDITOS[tipoTarea]

  // Verificar que la ferretería tiene suscripción activa (no suspendida)
  const { data: ferreteria } = await admin
    .from('ferreterias')
    .select('estado_tenant')
    .eq('id', ferreteriaId)
    .single()

  if (ferreteria?.estado_tenant === 'suspendido' || ferreteria?.estado_tenant === 'cancelado') {
    return { ok: false, motivo: 'tenant_suspendido' }
  }

  // Descontar atómicamente usando la función SQL
  const { data: exito } = await admin.rpc('descontar_creditos', {
    p_ferreteria_id: ferreteriaId,
    p_creditos: creditosNecesarios,
  })

  if (!exito) {
    // Obtener créditos actuales para el mensaje de error
    const { data: sus } = await admin
      .from('suscripciones')
      .select('creditos_disponibles')
      .eq('ferreteria_id', ferreteriaId)
      .single()

    if (!sus) {
      return { ok: false, motivo: 'sin_suscripcion' }
    }

    // Registrar incidencia si los créditos llegan a 0
    if (sus.creditos_disponibles === 0) {
      await registrarIncidenciaCreditos(ferreteriaId, 'agotados')
    }

    return {
      ok: false,
      creditosRestantes: sus.creditos_disponibles,
      motivo: 'creditos_insuficientes',
    }
  }

  // Verificar si quedan pocos créditos (alerta preventiva)
  const { data: sus } = await admin
    .from('suscripciones')
    .select('creditos_disponibles, creditos_del_mes')
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (sus) {
    const pct = sus.creditos_disponibles / Math.max(sus.creditos_del_mes, 1)
    // Alerta cuando quedan menos del 10% de los créditos del mes
    if (pct < 0.1 && sus.creditos_disponibles > 0) {
      // Fire-and-forget — no bloquea la respuesta
      registrarIncidenciaCreditos(ferreteriaId, 'bajos').catch(() => {})
    }
    return { ok: true, creditosRestantes: sus.creditos_disponibles }
  }

  return { ok: true }
}

// ── Registrar movimiento de créditos ─────────────────────────────────────────

/**
 * Registra el consumo de créditos en `movimientos_creditos`.
 * Llamar DESPUÉS de la llamada al modelo IA (con tokens y costo reales).
 */
export async function registrarMovimiento(
  params: RegistroMovimientoParams
): Promise<void> {
  const admin = createAdminClient()
  const {
    ferreteriaId,
    tipoTarea,
    conversacionId = null,
    origen = 'bot',
    tokensEntrada = null,
    tokensSalida = null,
    costoUsd = null,
  } = params

  const modelo = MODELO_POR_TAREA[tipoTarea]
  const creditos = COSTO_CREDITOS[tipoTarea]

  await admin.from('movimientos_creditos').insert({
    ferreteria_id:   ferreteriaId,
    tipo_tarea:      tipoTarea,
    modelo_usado:    modelo,
    creditos_usados: creditos,
    tokens_entrada:  tokensEntrada,
    tokens_salida:   tokensSalida,
    costo_usd:       costoUsd,
    conversacion_id: conversacionId,
    origen,
  })
}

// ── Incidencias de créditos ───────────────────────────────────────────────────

async function registrarIncidenciaCreditos(
  ferreteriaId: string,
  tipo: 'agotados' | 'bajos'
): Promise<void> {
  const admin = createAdminClient()

  const tipoIncidencia = tipo === 'agotados' ? 'creditos_agotados' : 'creditos_bajos'

  // Evitar duplicados: no crear nueva incidencia si ya hay una sin resolver del mismo tipo
  const { data: existente } = await admin
    .from('incidencias_sistema')
    .select('id')
    .eq('ferreteria_id', ferreteriaId)
    .eq('tipo', tipoIncidencia)
    .eq('resuelto', false)
    .single()

  if (existente) return // ya existe una incidencia activa

  await admin.from('incidencias_sistema').insert({
    ferreteria_id: ferreteriaId,
    tipo: tipoIncidencia,
    detalle:
      tipo === 'agotados'
        ? 'Los créditos IA del tenant se han agotado. El bot opera en modo básico.'
        : 'Los créditos IA del tenant están por debajo del 10%. Considerar recarga.',
    resuelto: false,
  })
}

// ── Agregar créditos (uso del superadmin) ─────────────────────────────────────

export interface RecargaParams {
  ferreteriaId: string
  creditos: number
  motivo?: string
  montoCobrado?: number
  superadminId?: string
}

/**
 * Agrega créditos a un tenant y registra la recarga.
 * Usado por el superadmin desde el panel o por renovación automática.
 * También marca como resueltas las incidencias de créditos agotados/bajos.
 */
export async function agregarCreditos(params: RecargaParams): Promise<void> {
  const admin = createAdminClient()
  const {
    ferreteriaId,
    creditos,
    motivo = 'recarga_manual',
    montoCobrado = 0,
    superadminId,
  } = params

  // Agregar créditos atómicamente
  await admin.rpc('agregar_creditos', {
    p_ferreteria_id: ferreteriaId,
    p_creditos: creditos,
  })

  // Registrar recarga
  await admin.from('recargas_creditos').insert({
    ferreteria_id: ferreteriaId,
    creditos,
    motivo,
    monto_cobrado: montoCobrado,
    agregado_por:  superadminId ?? null,
  })

  // Resolver incidencias de créditos pendientes
  await admin
    .from('incidencias_sistema')
    .update({ resuelto: true, resuelto_at: new Date().toISOString() })
    .eq('ferreteria_id', ferreteriaId)
    .in('tipo', ['creditos_agotados', 'creditos_bajos'])
    .eq('resuelto', false)
}

// ── Saldo actual ──────────────────────────────────────────────────────────────

export interface SaldoCreditos {
  disponibles: number
  delMes: number
  extra: number
  estado: string
}

export async function getSaldoCreditos(
  ferreteriaId: string
): Promise<SaldoCreditos | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('suscripciones')
    .select('creditos_disponibles, creditos_del_mes, creditos_extra, estado')
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (!data) return null
  return {
    disponibles: data.creditos_disponibles,
    delMes:      data.creditos_del_mes,
    extra:       data.creditos_extra,
    estado:      data.estado,
  }
}

// ── Respuesta modo básico ─────────────────────────────────────────────────────

/**
 * Respuesta predefinida cuando el bot no puede usar IA (sin créditos).
 * El dueño ve una notificación en su panel.
 */
export function respuestaModoBasico(): string {
  return (
    'Hola 👋 En este momento nuestro servicio de atención automática no está disponible. ' +
    'Por favor contáctanos directamente para ayudarte con tu consulta o pedido. ¡Gracias por tu paciencia!'
  )
}
