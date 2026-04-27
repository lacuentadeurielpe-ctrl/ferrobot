import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Redirige a la página unificada de Finanzas → tab Rendiciones
export default function RendicionesRedirect() {
  redirect('/dashboard/finanzas?tab=rendiciones')
}
