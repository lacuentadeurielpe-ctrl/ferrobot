'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, ShieldAlert, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccionAuditada {
  id: string
  usuario_nombre: string | null
  accion: string
  entidad: string | null
  entidad_id: string | null
  detalle: Record<string, unknown> | null
  created_at: string
}

const ACCION_LABEL: Record<string, string> = {
  cambiar_estado_pedido:   'Cambio de estado de pedido',
  cancelar_pedido:         'Cancelación de pedido',
  aprobar_pago:            'Aprobación de pago',
  rechazar_pago:           'Rechazo de pago',
  vincular_pago:           'Vinculación de pago a pedido',
  crear_empleado:          'Creación de empleado',
  eliminar_empleado:       'Eliminación de empleado',
  activar_empleado:        'Activación de empleado',
  desactivar_empleado:     'Desactivación de empleado',
  cambiar_permisos_empleado: 'Cambio de permisos',
  reset_password_empleado: 'Reseteo de contraseña',
  set_pin_empleado:        'Establecer PIN',
  crear_cotizacion:        'Creación de cotización',
  actualizar_configuracion: 'Actualización de configuración',
}

const ACCION_DOT: Record<string, string> = {
  cancelar_pedido:         'bg-red-400',
  rechazar_pago:           'bg-red-400',
  eliminar_empleado:       'bg-red-400',
  desactivar_empleado:     'bg-amber-400',
  reset_password_empleado: 'bg-amber-400',
  aprobar_pago:            'bg-emerald-400',
  activar_empleado:        'bg-emerald-400',
  crear_empleado:          'bg-blue-400',
  set_pin_empleado:        'bg-violet-400',
}

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'ahora mismo'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

function DetalleRow({ detalle }: { detalle: Record<string, unknown> }) {
  const entries = Object.entries(detalle).filter(([, v]) => v !== null && v !== undefined)
  if (!entries.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md">
          {k}: <span className="text-zinc-700 font-medium">{String(v)}</span>
        </span>
      ))}
    </div>
  )
}

export default function AuditoriaTab() {
  const [acciones, setAcciones] = useState<AccionAuditada[]>([])
  const [cargando, setCargando] = useState(true)
  const [offset, setOffset]     = useState(0)
  const [total, setTotal]       = useState(0)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const LIMIT = 30

  const cargar = useCallback(async (off: number) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/audit?limit=${LIMIT}&offset=${off}`)
      if (!res.ok) return
      const json = await res.json()
      setAcciones((prev) => off === 0 ? (json.data ?? []) : [...prev, ...(json.data ?? [])])
      setTotal(json.total ?? 0)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar(0) }, [cargar])

  function toggleExpandido(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function cargarMas() {
    const nextOffset = offset + LIMIT
    setOffset(nextOffset)
    cargar(nextOffset)
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <ShieldAlert className="w-5 h-5 text-zinc-600" />
        <h2 className="font-semibold text-zinc-900">Historial de actividad</h2>
        {total > 0 && (
          <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
            {total} accion{total !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {cargando && acciones.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando historial…
        </div>
      ) : acciones.length === 0 ? (
        <div className="text-center py-10">
          <ShieldAlert className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
          <p className="text-sm text-zinc-400">No hay actividad registrada aún.</p>
          <p className="text-xs text-zinc-300 mt-1">Las acciones del equipo aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {acciones.map((a) => {
              const exp = expandidos.has(a.id)
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-zinc-100 hover:border-zinc-200 transition overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpandido(a.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      ACCION_DOT[a.accion] ?? 'bg-zinc-300'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-800 truncate">
                        {ACCION_LABEL[a.accion] ?? a.accion}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {a.usuario_nombre ?? 'Sistema'} · {tiempoRelativo(a.created_at)}
                      </p>
                    </div>
                    {a.detalle && Object.keys(a.detalle).length > 0 && (
                      <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-300 shrink-0 transition-transform', exp && 'rotate-180')} />
                    )}
                  </button>

                  {exp && a.detalle && Object.keys(a.detalle).length > 0 && (
                    <div className="px-3 pb-2.5 border-t border-zinc-50">
                      <DetalleRow detalle={a.detalle} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {acciones.length < total && (
            <button
              onClick={cargarMas}
              disabled={cargando}
              className="mt-4 w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition disabled:opacity-50"
            >
              {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
              Cargar más ({total - acciones.length} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}
