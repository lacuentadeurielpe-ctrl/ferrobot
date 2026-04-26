// Vista de conversación activa
// Mobile:   pantalla completa con botón atrás
// Desktop:  lista (izq) + chat (centro) + panel contextual (der, xl+)
import { createClient }    from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ConversationsList   from '@/components/conversations/ConversationsList'
import ChatView            from '@/components/conversations/ChatView'
import ContextPanel        from '@/components/conversations/ContextPanel'
import { getSessionInfo }  from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id }  = await params
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Conversación activa
  const { data: conversacion } = await supabase
    .from('conversaciones')
    .select('*, clientes(nombre, telefono)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!conversacion) notFound()

  // Mensajes
  const { data: mensajes } = await supabase
    .from('mensajes')
    .select('id, role, contenido, created_at')
    .eq('conversacion_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  // Lista de conversaciones (panel izquierdo)
  const { data: conversaciones } = await supabase
    .from('conversaciones')
    .select('id, estado, bot_pausado, ultima_actividad, clientes(nombre, telefono)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('ultima_actividad', { ascending: false })
    .limit(50)

  const convIds = (conversaciones ?? []).map(c => c.id)

  let ultimosMensajes: Record<string, { contenido: string; role: string }> = {}
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('mensajes')
      .select('conversacion_id, contenido, role, created_at')
      .in('conversacion_id', convIds)
      .order('created_at', { ascending: false })

    for (const m of msgs ?? []) {
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

  // Datos del cliente para el panel contextual
  const clienteRaw   = Array.isArray(conversacion.clientes)
    ? conversacion.clientes[0] ?? null
    : conversacion.clientes
  const cliente      = clienteRaw as { nombre: string | null; telefono: string } | null
  const clienteId    = (conversacion as Record<string, unknown>).cliente_id as string | null

  // Últimos pedidos del cliente para el panel CRM
  const { data: pedidosCliente } = clienteId
    ? await supabase
        .from('pedidos')
        .select('id, numero_pedido, estado, total, created_at, modalidad')
        .eq('ferreteria_id', session.ferreteriaId)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(4)
    : { data: null }

  // Total de mensajes para stats
  const { count: totalMensajes } = await supabase
    .from('mensajes')
    .select('*', { count: 'exact', head: true })
    .eq('conversacion_id', id)

  return (
    <div className="absolute inset-0 flex overflow-hidden">

      {/* ── Panel izquierdo — lista (oculto en mobile) ────────────────────── */}
      <div className="hidden md:flex w-72 shrink-0 border-r border-zinc-100 bg-white flex-col">
        <ConversationsList inicial={enriquecidas} ferreteriaId={session.ferreteriaId} />
      </div>

      {/* ── Chat — pantalla completa en mobile ────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ChatView
          conversacion={{
            ...conversacion,
            clientes: cliente,
          }}
          mensajesIniciales={mensajes ?? []}
          ferreteriaId={session.ferreteriaId}
        />
      </div>

      {/* ── Panel contextual — solo xl+ ───────────────────────────────────── */}
      <ContextPanel
        conversacion={{
          id,
          bot_pausado: conversacion.bot_pausado,
          created_at: (conversacion as Record<string, unknown>).created_at as string,
        }}
        cliente={cliente}
        clienteId={clienteId}
        pedidos={pedidosCliente ?? []}
        totalMensajes={totalMensajes ?? 0}
      />

    </div>
  )
}
