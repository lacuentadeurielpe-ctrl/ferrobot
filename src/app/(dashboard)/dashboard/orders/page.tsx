import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Redirige a la página unificada de Ventas → tab Pedidos
export default function OrdersRedirect() {
  redirect('/dashboard/ventas?tab=pedidos')
}
