// Layout del panel de superadmin — protegido con getSuperadminSession()
// Si no hay sesión → redirect a /superadmin/login

import { redirect } from 'next/navigation'
import { getSuperadminSession } from '@/lib/auth/superadmin'
import SuperadminNav from './SuperadminNav'

export const metadata = { title: 'Superadmin — FerroBot' }

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSuperadminSession()
  if (!session) redirect('/superadmin/login')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SuperadminNav session={session} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
