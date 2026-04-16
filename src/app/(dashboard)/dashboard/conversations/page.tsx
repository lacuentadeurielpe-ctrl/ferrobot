// Página de conversaciones — layout de dos paneles: lista + chat
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConversationsList from '@/components/conversations/ConversationsList'
import { MessageSquare } from 'lucide-react'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function ConversationsPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Obtener conversaciones con último mensaje
  const { data: conversaciones } = await supabase
    .from('conversaciones')
    .select(`
      id, estado, bot_pausado, ultima_actividad,
      clientes(nombre, telefono)
    `)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('ultima_actividad', { ascending: false })
    .limit(50)

  // Enriquecer con último mensaje de cada conversación
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
      {/* Panel izquierdo — lista de conversaciones */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <ConversationsList inicial={enriquecidas} ferreteriaId={session.ferreteriaId} />
      </div>

      {/* Panel derecho — placeholder cuando no hay conversación seleccionada */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
        <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">Selecciona una conversación</p>
      </div>
    </div>
  )
}
