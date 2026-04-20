// Dashboard de pagos registrados — F5
// Muestra pagos auto-confirmados, por revisar, rechazados y créditos a favor.
// FERRETERÍA AISLADA: la API ya filtra por ferreteriaId de sesión.

import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import PagosView, { type PagoItem } from '@/components/pagos/PagosView'
import { CreditCard } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PagosPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Cargar últimos 50 pagos de todos los estados
  const { data: pagos } = await supabase
    .from('pagos_registrados')
    .select(`
      id, metodo, monto, moneda, numero_operacion, nombre_pagador,
      ultimos_digitos, fecha_pago, banco_origen, estado, url_captura,
      confianza_extraccion, notas, registrado_at,
      cliente:clientes(id, nombre, telefono),
      pedido:pedidos(id, numero_pedido, total)
    `)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .order('registrado_at', { ascending: false })
    .limit(100)

  // Contadores por estado
  const porEstado = (pagos ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.estado] = (acc[p.estado] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Pagos recibidos</h1>
          <p className="text-xs text-gray-500">Comprobantes detectados automáticamente por el bot</p>
        </div>
      </div>

      {/* Resumen por estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { key: 'confirmado_auto', label: 'Confirmados', color: 'bg-green-50 text-green-700 border-green-100' },
          { key: 'pendiente_revision', label: 'Por revisar', color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
          { key: 'a_favor', label: 'Crédito a favor', color: 'bg-blue-50 text-blue-700 border-blue-100' },
          { key: 'rechazado', label: 'Rechazados', color: 'bg-red-50 text-red-700 border-red-100' },
        ].map(({ key, label, color }) => (
          <div key={key} className={`rounded-xl border p-4 ${color}`}>
            <p className="text-2xl font-bold">{porEstado[key] ?? 0}</p>
            <p className="text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <PagosView pagos={(pagos ?? []) as unknown as PagoItem[]} esDueno={session.rol === 'dueno'} />
    </div>
  )
}
