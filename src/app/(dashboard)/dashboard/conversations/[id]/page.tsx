// Vista individual de conversación
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ConversationsList from '@/components/conversations/ConversationsList'
import ChatView from '@/components/conversations/ChatView'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Obtener conversación con datos del cliente
  const { data: conversacion } = await supabase
    .from('conversaciones')
    .select('*, clientes(nombre, telefono)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!conversacion) notFound()

  // Obtener mensajes
  const { data: mensajes } = await supabase
    .from('mensajes')
    .select('id, role, contenido, created_at')
    .eq('conversacion_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  // Obtener lista de conversaciones (panel izquierdo)
  const { data: conversaciones } = await supabase
    .from('conversaciones')
    .select('id, estado, bot_pausado, ultima_actividad, clientes(nombre, telefono)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('ultima_actividad', { ascending: false })
    .limit(50)

  const enriquecidas = await Promise.all(
    (conversaciones ?? []).map(async (conv) => {
      const { data: ultimo } = await supabase
        .from('mensajes')
        .select('contenido, role')
        .eq('conversacion_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const clientes = Array.isArray(conv.clientes) ? conv.clientes[0] ?? null : conv.clientes
      return {
        ...conv,
        clientes: clientes as { nombre: string | null; telefono: string } | null,
        ultimo_mensaje: ultimo?.contenido ?? undefined,
        rol_ultimo: ultimo?.role ?? undefined,
      }
    })
  )

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* Panel izquierdo */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <ConversationsList inicial={enriquecidas} ferreteriaId={session.ferreteriaId} />
      </div>

      {/* Panel derecho */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatView
          conversacion={{
            ...conversacion,
            clientes: (Array.isArray(conversacion.clientes)
              ? conversacion.clientes[0] ?? null
              : conversacion.clientes) as { nombre: string | null; telefono: string } | null,
          }}
          mensajesIniciales={mensajes ?? []}
          ferreteriaId={session.ferreteriaId}
        />
      </div>
    </div>
  )
}
