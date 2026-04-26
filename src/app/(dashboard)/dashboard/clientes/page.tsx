// Lista de clientes con métricas resumidas
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { Users, Search } from 'lucide-react'
import ClientesTable from '@/components/clientes/ClientesTable'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Clientes con métricas: total pedidos, total gastado, último pedido
  const { data: clientes } = await supabase
    .from('clientes')
    .select(`
      id, nombre, telefono, created_at,
      pedidos(id, total, estado, created_at)
    `)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  // Calcular métricas por cliente
  const clientesConMetricas = (clientes ?? []).map((c) => {
    const pedidos = (c.pedidos ?? []) as Array<{ id: string; total: number; estado: string; created_at: string }>
    const pedidosCompletados = pedidos.filter(p => p.estado !== 'cancelado')
    const totalGastado = pedidosCompletados.reduce((s, p) => s + (p.total ?? 0), 0)
    const ultimoPedido = pedidos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    return {
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      created_at: c.created_at,
      totalPedidos: pedidos.length,
      pedidosCompletados: pedidosCompletados.length,
      totalGastado,
      ultimoPedido: ultimoPedido?.created_at ?? null,
    }
  }).sort((a, b) => b.totalGastado - a.totalGastado)  // orden por mayor gasto

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <Users className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Clientes</h1>
          <p className="text-xs text-zinc-400">{clientesConMetricas.length} clientes registrados</p>
        </div>
      </div>

      <ClientesTable
        clientes={clientesConMetricas}
        esVendedor={session.rol === 'vendedor'}
      />
    </div>
  )
}
