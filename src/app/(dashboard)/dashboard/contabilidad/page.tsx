import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Redirige a la página unificada de Finanzas → tab Contabilidad
export default function ContabilidadRedirect() {
  redirect('/dashboard/finanzas?tab=contabilidad')
}
