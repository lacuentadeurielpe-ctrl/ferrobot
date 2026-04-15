// Layout del panel principal — requiere autenticación (verificada en middleware)
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import MobileSidebarWrapper from '@/components/layout/MobileSidebarWrapper'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Obtener ferretería + contadores para badges del sidebar
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, onboarding_completo')
    .eq('owner_id', user.id)
    .single()

  // Si el dueño nunca completó el onboarding, redirigir
  if (!ferreteria) {
    redirect('/onboarding')
  }

  const [
    { count: pedidosPendientes },
    { count: conversacionesActivas },
    { count: cotizacionesPendientes },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .eq('estado', 'pendiente'),
    supabase
      .from('conversaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .eq('bot_pausado', true),
    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteria.id)
      .eq('estado', 'pendiente_aprobacion'),
  ])

  const sidebarNode = (
    <Sidebar
      nombreFerreteria={ferreteria.nombre}
      ferreteriaId={ferreteria.id}
      pedidosPendientes={pedidosPendientes ?? 0}
      conversacionesActivas={conversacionesActivas ?? 0}
      cotizacionesPendientes={cotizacionesPendientes ?? 0}
    />
  )

  return (
    <MobileSidebarWrapper sidebar={sidebarNode}>
      {children}
    </MobileSidebarWrapper>
  )
}
