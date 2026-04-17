// Layout del panel principal — soporta dueños y vendedores invitados
import { redirect } from 'next/navigation'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import MobileSidebarWrapper from '@/components/layout/MobileSidebarWrapper'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionInfo()

  // Sin sesión → login
  if (!session) redirect('/auth/login')

  // Dueño que no completó onboarding → onboarding
  if (session.rol === 'dueno' && !session.onboardingCompleto) {
    redirect('/onboarding')
  }

  const supabase = await createClient()

  const [
    { count: pedidosPendientes },
    { count: conversacionesActivas },
    { count: cotizacionesPendientes },
    { data: ferreteriaData },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('estado', 'pendiente'),
    supabase
      .from('conversaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('bot_pausado', true),
    supabase
      .from('cotizaciones')
      .select('*', { count: 'exact', head: true })
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('estado', 'pendiente_aprobacion'),

    supabase
      .from('ferreterias')
      .select('logo_url')
      .eq('id', session.ferreteriaId)
      .single(),
  ])

  const sidebarNode = (
    <Sidebar
      nombreFerreteria={session.nombreFerreteria}
      ferreteriaId={session.ferreteriaId}
      logoUrl={ferreteriaData?.logo_url ?? null}
      pedidosPendientes={pedidosPendientes ?? 0}
      conversacionesActivas={conversacionesActivas ?? 0}
      cotizacionesPendientes={cotizacionesPendientes ?? 0}
      rol={session.rol}
      permisos={session.permisos}
    />
  )

  return (
    <MobileSidebarWrapper
      sidebar={sidebarNode}
      nombreFerreteria={session.nombreFerreteria}
      logoUrl={ferreteriaData?.logo_url ?? null}
    >
      {children}
    </MobileSidebarWrapper>
  )
}
