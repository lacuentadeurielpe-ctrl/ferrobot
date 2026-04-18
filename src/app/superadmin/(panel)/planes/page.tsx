// /superadmin/planes — Gestión de planes de la plataforma

import { createAdminClient } from '@/lib/supabase/admin'
import PlanesManager from './PlanesManager'

export const revalidate = 0

async function getPlanes() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('planes')
    .select('id, nombre, creditos_mes, precio_mensual, precio_exceso, activo, created_at')
    .order('precio_mensual', { ascending: true })
  return data ?? []
}

async function getUsoPlanes() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('suscripciones')
    .select('plan_id, estado')
  return data ?? []
}

export default async function PlanesPage() {
  const [planes, usos] = await Promise.all([getPlanes(), getUsoPlanes()])

  // Contar suscripciones por plan
  const conteoPlanes: Record<string, number> = {}
  for (const s of usos) {
    if (s.plan_id) conteoPlanes[s.plan_id] = (conteoPlanes[s.plan_id] ?? 0) + 1
  }

  const secret = process.env.NEXT_PUBLIC_SUPERADMIN_SECRET ?? ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Planes</h1>
          <p className="text-gray-400 text-sm mt-1">Configura los planes disponibles para los ferreteros</p>
        </div>
      </div>

      {/* Resumen de uso */}
      {planes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {planes.filter(p => p.activo).map((plan) => (
            <div key={plan.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{plan.nombre}</p>
              <p className="text-xl font-bold text-orange-400">{conteoPlanes[plan.id] ?? 0}</p>
              <p className="text-xs text-gray-600 mt-1">suscripciones</p>
            </div>
          ))}
        </div>
      )}

      <PlanesManager planes={planes} secret={secret} />

      {/* Tabla de créditos por tipo de tarea (referencia) */}
      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Costo de créditos por tipo de tarea (referencia)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {[
            { tarea: 'Respuesta simple (saludo, consulta)',     cr: 1,  modelo: 'DeepSeek' },
            { tarea: 'CRM / FAQ / estado de pedido',           cr: 1,  modelo: 'DeepSeek' },
            { tarea: 'Cotización',                             cr: 3,  modelo: 'DeepSeek' },
            { tarea: 'Pedido / confirmación',                  cr: 3,  modelo: 'DeepSeek' },
            { tarea: 'Audio (Whisper)',                        cr: 2,  modelo: 'Whisper' },
            { tarea: 'Imagen / Vision',                        cr: 4,  modelo: 'GPT-4o' },
            { tarea: 'Análisis de inventario',                 cr: 2,  modelo: 'DeepSeek' },
            { tarea: 'Reporte con IA',                         cr: 5,  modelo: 'GPT-4o mini' },
            { tarea: 'Situación compleja (cliente difícil)',   cr: 8,  modelo: 'Claude' },
          ].map((item) => (
            <div key={item.tarea} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-400">{item.tarea}</span>
              <div className="flex items-center gap-3 ml-3 shrink-0">
                <span className="text-gray-600 text-xs">{item.modelo}</span>
                <span className="text-orange-400 font-mono font-medium">{item.cr} cr</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
