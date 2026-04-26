// Lista de conversaciones — panel izquierdo + placeholder derecho (desktop)
// En mobile: lista ocupa pantalla completa
import { createClient }        from '@/lib/supabase/server'
import { redirect }            from 'next/navigation'
import ConversationsList       from '@/components/conversations/ConversationsList'
import { MessageSquare }       from 'lucide-react'
import { getSessionInfo }      from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function ConversationsPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  const { data: conversaciones } = await supabase
    .from('conversaciones')
    .select('id, estado, bot_pausado, ultima_actividad, clientes(nombre, telefono)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('ultima_actividad', { ascending: false })
    .limit(50)

  const convIds = (conversaciones ?? []).map(c => c.id)

  let ultimosMensajes: Record<string, { contenido: string; role: string }> = {}
  if (convIds.length > 0) {
    const { data: mensajes } = await supabase
      .from('mensajes')
      .select('conversacion_id, contenido, role, created_at')
      .in('conversacion_id', convIds)
      .order('created_at', { ascending: false })

    for (const m of mensajes ?? []) {
      if (!ultimosMensajes[m.conversacion_id]) {
        ultimosMensajes[m.conversacion_id] = { contenido: m.contenido, role: m.role }
      }
    }
  }

  const enriquecidas = (conversaciones ?? []).map((conv) => {
    const ultimo   = ultimosMensajes[conv.id]
    const clientes = Array.isArray(conv.clientes) ? conv.clientes[0] ?? null : conv.clientes
    return {
      ...conv,
      clientes:       clientes as { nombre: string | null; telefono: string } | null,
      ultimo_mensaje: ultimo?.contenido ?? undefined,
      rol_ultimo:     ultimo?.role      ?? undefined,
    }
  })

  return (
    <div className="absolute inset-0 flex overflow-hidden">

      {/* Lista — pantalla completa en mobile, panel izquierdo en desktop */}
      <div className="w-full md:w-72 shrink-0 md:border-r border-zinc-100 bg-white flex flex-col">
        <ConversationsList inicial={enriquecidas} ferreteriaId={session.ferreteriaId} />
      </div>

      {/* Placeholder — solo visible en desktop cuando no hay conversación activa */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-zinc-50 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-zinc-400" />
        </div>
        <p className="text-sm text-zinc-400 font-medium">Selecciona una conversación</p>
        <p className="text-xs text-zinc-300">Los mensajes de WhatsApp aparecen aquí en tiempo real</p>
      </div>

    </div>
  )
}
