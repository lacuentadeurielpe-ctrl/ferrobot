import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Redirige a la página unificada de Ventas → tab Cotizaciones
export default function CotizacionesRedirect() {
  redirect('/dashboard/ventas?tab=cotizaciones')
}
