// Vista de conversación activa
// Mobile:   pantalla completa con botón atrás
// Desktop:  lista (izq) + chat (centro) + panel contextual (der, xl+)
import { createClient }    from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ConversationsList   from '@/components/conversations/ConversationsList'
import ChatView            from '@/components/conversations/ChatView'
import { getSessionInfo }  from '@/lib/auth/roles'
import Link                from 'next/link'
import { Phone, ExternalLink, ShoppingCart, User } from 'lucide-react'

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
  const nombreCliente = cliente?.nombre ?? cliente?.telefono ?? 'Cliente'

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
      <aside className="hidden xl:flex w-64 shrink-0 border-l border-zinc-100 bg-white flex-col">

        {/* Cliente */}
        <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 select-none">
            Cliente
          </p>

          {/* Avatar + nombre */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 select-none">
              <span className="text-sm font-semibold text-zinc-600">
                {nombreCliente[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-950 truncate">{nombreCliente}</p>
              {cliente?.telefono && (
                <p className="text-xs text-zinc-400 tabular-nums">{cliente.telefono}</p>
              )}
            </div>
          </div>

          {/* Links rápidos */}
          <div className="space-y-1">
            {cliente?.telefono && (
              <a
                href={`tel:${cliente.telefono}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium
                           text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition"
              >
                <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                Llamar
              </a>
            )}
            {clienteId && (
              <Link
                href={`/dashboard/clientes/${clienteId}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium
                           text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition"
              >
                <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                Ver perfil completo
                <ExternalLink className="w-3 h-3 ml-auto text-zinc-300" />
              </Link>
            )}
          </div>
        </div>

        {/* Pedidos */}
        <div className="px-5 pt-4 pb-4 border-b border-zinc-100">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3 select-none">
            Pedidos
          </p>
          <Link
            href={`/dashboard/orders${clienteId ? `?cliente=${clienteId}` : ''}`}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium
                       text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            Ver pedidos del cliente
            <ExternalLink className="w-3 h-3 ml-auto text-zinc-300" />
          </Link>
        </div>

        {/* Estado del bot */}
        <div className="px-5 pt-4">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 select-none">
            Estado
          </p>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
            ${conversacion.bot_pausado
              ? 'bg-zinc-100 text-zinc-600 border border-zinc-200'
              : 'bg-zinc-50 text-zinc-500 border border-zinc-100'
            }`}
          >
            <span>{conversacion.bot_pausado ? '⏸' : '🤖'}</span>
            {conversacion.bot_pausado ? 'Tú al control' : 'Bot activo'}
          </div>
        </div>

      </aside>

    </div>
  )
}
