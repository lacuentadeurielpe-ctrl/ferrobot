// /superadmin/tenants — Listado de todos los clientes (ferreterías)

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 30

async function getTenants() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ferreterias')
    .select(`
      id, nombre, telefono_whatsapp, activo, estado_tenant, trial_hasta, created_at,
      suscripciones (creditos_disponibles, estado)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

const ESTADO_COLORS: Record<string, string> = {
  activo:     'bg-green-500/10 text-green-400 border-green-500',
  trial:      'bg-yellow-500/10 text-yellow-400 border-yellow-500',
  suspendido: 'bg-red-500/10 text-red-400 border-red-500',
  cancelado:  'bg-gray-800 text-gray-500 border-gray-700',
}

export default async function TenantsPage() {
  const tenants = await getTenants()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-gray-400 text-sm mt-1">{tenants.length} ferreterías registradas</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Ferretería</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Estado</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Créditos</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Registrado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">
                  No hay ferreterías registradas
                </td>
              </tr>
            )}
            {tenants.map((t) => {
              const sus = (t as any).suscripciones
              const creditos = sus?.creditos_disponibles ?? '—'
              const estado = t.estado_tenant ?? 'trial'
              const fechaReg = new Date(t.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' })

              return (
                <tr key={t.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{t.nombre}</div>
                    {!t.activo && <span className="text-xs text-gray-500">(desactivada)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.telefono_whatsapp}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${ESTADO_COLORS[estado] ?? ''}`}>
                      {estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${typeof creditos === 'number' && creditos < 50 ? 'text-red-400' : 'text-white'}`}>
                      {typeof creditos === 'number' ? creditos.toLocaleString() : creditos}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fechaReg}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/superadmin/tenants/${t.id}`}
                      className="text-indigo-400 hover:text-indigo-300 text-xs"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
