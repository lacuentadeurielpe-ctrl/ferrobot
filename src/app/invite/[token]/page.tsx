// Página pública para aceptar una invitación de equipo
import { createClient } from '@/lib/supabase/server'
import { Wrench } from 'lucide-react'
import InviteAcceptButton from './InviteAcceptButton'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  // Leer la invitación sin exponer datos sensibles
  const { data: inv } = await supabase
    .from('invitaciones')
    .select('id, usada, expires_at, ferreterias(nombre)')
    .eq('token', token)
    .single()

  const ferreteriaNombre = (inv?.ferreterias as any)?.nombre ?? null
  const expirada = inv ? new Date(inv.expires_at) < new Date() : false
  const usada = inv?.usada ?? false
  const valida = !!inv && !expirada && !usada

  // Verificar si el usuario ya tiene sesión
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center">
            <Wrench className="w-7 h-7 text-white" />
          </div>
        </div>

        {!valida ? (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {!inv ? 'Invitación no encontrada' : usada ? 'Invitación ya utilizada' : 'Invitación expirada'}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {!inv
                ? 'Este enlace no existe o es incorrecto.'
                : usada
                ? 'Este enlace de invitación ya fue usado. Pide al dueño que genere uno nuevo.'
                : 'Este enlace ha expirado (válido por 7 días). Pide al dueño que genere uno nuevo.'}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              ¡Te han invitado!
            </h1>
            <p className="text-sm text-gray-500 mb-2">
              Únete al equipo de
            </p>
            <p className="text-lg font-semibold text-orange-600 mb-6">
              {ferreteriaNombre ?? 'la ferretería'}
            </p>

            <p className="text-xs text-gray-400 mb-6">
              Ingresarás como <span className="font-semibold text-gray-600">Vendedor</span>.
              Podrás gestionar pedidos, catálogo y conversaciones.
            </p>

            <InviteAcceptButton
              token={token}
              isLoggedIn={!!user}
              userEmail={user?.email ?? null}
            />
          </>
        )}
      </div>
    </div>
  )
}
