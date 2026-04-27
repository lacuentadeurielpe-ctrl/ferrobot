import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Redirige a la página unificada de Ventas → tab Pagos
export default function PagosRedirect() {
  redirect('/dashboard/ventas?tab=pagos')
}
