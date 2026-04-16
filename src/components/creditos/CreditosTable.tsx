'use client'

import { useState, useMemo } from 'react'
import { cn, formatPEN, formatFecha } from '@/lib/utils'
import { ChevronDown, CreditCard, CheckCircle2, AlertTriangle, Clock, Plus, Loader2, X } from 'lucide-react'
import { checkPermiso, type PermisoMap } from '@/lib/auth/permisos'
import type { Rol } from '@/lib/auth/roles'

interface AbonoCredito {
  id: string
  monto: number
  metodo_pago: string | null
  notas: string | null
  registrado_por: string | null
  created_at: string
}

interface Credito {
  id: string
  cliente_id: string | null
  pedido_id: string | null
  monto_total: number
  monto_pagado: number
  fecha_limite: string
  estado: string
  aprobado_por: string | null
  notas: string | null
  created_at: string
  clientes: { id: string; nombre: string | null; telefono: string } | null
  pedidos: { id: string; numero_pedido: string; total: number } | null
  abonos_credito: AbonoCredito[]
}

const LABELS_METODO: Record<string, string> = {
  efectivo: '💵 Efectivo',
  yape: '📱 Yape',
  transferencia: '🏦 Transferencia',
  tarjeta: '💳 Tarjeta',
}

function diasRestantes(fechaLimite: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const limite = new Date(fechaLimite + 'T00:00:00')
  return Math.ceil((limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function badgeEstado(credito: Credito) {
  if (credito.estado === 'pagado') {
    return { label: 'Pagado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
  }
  if (credito.estado === 'vencido') {
    return { label: 'Vencido', color: 'bg-red-100 text-red-700', icon: AlertTriangle }
  }
  const dias = diasRestantes(credito.fecha_limite)
  if (dias <= 3) {
    return { label: `Vence en ${dias}d`, color: 'bg-red-100 text-red-700', icon: AlertTriangle }
  }
  if (dias <= 7) {
    return { label: `Vence en ${dias}d`, color: 'bg-amber-100 text-amber-700', icon: Clock }
  }
  return { label: `Vence en ${dias}d`, color: 'bg-blue-100 text-blue-700', icon: Clock }
}

export default function CreditosTable({
  creditos: inicial,
  rol = 'dueno',
  permisos,
}: {
  creditos: Credito[]
  rol?: Rol
  permisos?: Partial<PermisoMap>
}) {
  const sessionData = { rol, permisos: permisos ?? {} }
  const puedeAbonar = checkPermiso(sessionData, 'registrar_abonos')

  const [creditos, setCreditos] = useState(inicial)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [abonoDialog, setAbonoDialog] = useState<{
    creditoId: string
    monto: string
    metodo: string
    notas: string
  } | null>(null)
  const [registrando, setRegistrando] = useState(false)

  const filtrados = useMemo(() => {
    if (!filtroEstado) return creditos
    return creditos.filter((c) => c.estado === filtroEstado)
  }, [creditos, filtroEstado])

  const totales = useMemo(() => ({
    activo: creditos.filter((c) => c.estado === 'activo').reduce((s, c) => s + (c.monto_total - c.monto_pagado), 0),
    vencido: creditos.filter((c) => c.estado === 'vencido').reduce((s, c) => s + (c.monto_total - c.monto_pagado), 0),
    pagado: creditos.filter((c) => c.estado === 'pagado').length,
  }), [creditos])

  async function registrarAbono() {
    if (!abonoDialog) return
    const monto = Number(abonoDialog.monto)
    if (!monto || monto <= 0) return alert('Ingresa un monto válido')

    setRegistrando(true)
    try {
      const res = await fetch(`/api/creditos/${abonoDialog.creditoId}/abonar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto,
          metodo_pago: abonoDialog.metodo || null,
          notas: abonoDialog.notas || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al registrar abono')
      }
      const data = await res.json()

      // Actualizar estado local
      setCreditos((prev) =>
        prev.map((c) => {
          if (c.id !== abonoDialog.creditoId) return c
          return {
            ...c,
            monto_pagado: data.nuevo_monto_pagado,
            estado: data.nuevo_estado,
            abonos_credito: [
              ...c.abonos_credito,
              data.abono,
            ],
          }
        })
      )
      setAbonoDialog(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al registrar abono')
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium mb-1">Saldo activo</p>
          <p className="text-lg font-bold text-blue-800">{formatPEN(totales.activo)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium mb-1">Saldo vencido</p>
          <p className="text-lg font-bold text-red-800">{formatPEN(totales.vencido)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-green-600 font-medium mb-1">Cancelados</p>
          <p className="text-lg font-bold text-green-800">{totales.pagado} crédito{totales.pagado !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filtros por estado */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['', 'activo', 'vencido', 'pagado'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition',
              filtroEstado === e ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {e === '' ? `Todos (${creditos.length})` : e === 'activo' ? `Activos (${creditos.filter(c => c.estado === 'activo').length})` : e === 'vencido' ? `Vencidos (${creditos.filter(c => c.estado === 'vencido').length})` : `Pagados (${creditos.filter(c => c.estado === 'pagado').length})`}
          </button>
        ))}
      </div>

      {/* Dialog registrar abono */}
      {abonoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Registrar abono</h3>
              <button onClick={() => setAbonoDialog(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Monto (S/)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={abonoDialog.monto}
                  onChange={(e) => setAbonoDialog((d) => d ? { ...d, monto: e.target.value } : d)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Método de pago</label>
                <select
                  value={abonoDialog.metodo}
                  onChange={(e) => setAbonoDialog((d) => d ? { ...d, metodo: e.target.value } : d)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">— Sin especificar —</option>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="yape">📱 Yape</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="tarjeta">💳 Tarjeta</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notas (opcional)</label>
                <input
                  type="text"
                  value={abonoDialog.notas}
                  onChange={(e) => setAbonoDialog((d) => d ? { ...d, notas: e.target.value } : d)}
                  placeholder="Observaciones…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setAbonoDialog(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
              >Cancelar</button>
              <button
                onClick={registrarAbono}
                disabled={registrando}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {registrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay créditos{filtroEstado ? ` con estado "${filtroEstado}"` : ' registrados'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((credito) => {
            const isOpen = expandido === credito.id
            const saldo = credito.monto_total - credito.monto_pagado
            const porcentaje = credito.monto_total > 0 ? (credito.monto_pagado / credito.monto_total) * 100 : 0
            const badge = badgeEstado(credito)
            const BadgeIcon = badge.icon

            return (
              <div key={credito.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandido(isOpen ? null : credito.id)}
                >
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', isOpen && 'rotate-180')} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {credito.clientes?.nombre ?? 'Cliente desconocido'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {credito.pedidos?.numero_pedido && (
                        <><span className="font-mono">{credito.pedidos.numero_pedido}</span> · </>
                      )}
                      Límite: {new Date(credito.fecha_limite + 'T00:00:00').toLocaleDateString('es-PE')}
                    </p>
                  </div>

                  {/* Barra de progreso de pago */}
                  <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-28">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={cn('h-1.5 rounded-full transition-all', credito.estado === 'pagado' ? 'bg-green-500' : 'bg-orange-400')}
                        style={{ width: `${Math.min(100, porcentaje)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatPEN(credito.monto_pagado)} / {formatPEN(credito.monto_total)}
                    </p>
                  </div>

                  <span className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0', badge.color)}>
                    <BadgeIcon className="w-3 h-3" />
                    {badge.label}
                  </span>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                    {/* Resumen montos */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-400">Total</p>
                        <p className="text-sm font-bold text-gray-800">{formatPEN(credito.monto_total)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-400">Pagado</p>
                        <p className="text-sm font-bold text-green-700">{formatPEN(credito.monto_pagado)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-400">Saldo</p>
                        <p className={cn('text-sm font-bold', saldo > 0 ? 'text-red-600' : 'text-gray-400')}>{formatPEN(saldo)}</p>
                      </div>
                    </div>

                    {/* Historial de abonos */}
                    {credito.abonos_credito.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Historial de abonos</p>
                        <div className="space-y-1.5">
                          {[...credito.abonos_credito].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((abono) => (
                            <div key={abono.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs">
                              <span className="text-gray-500">{formatFecha(abono.created_at)}</span>
                              {abono.metodo_pago && (
                                <span className="text-gray-400">{LABELS_METODO[abono.metodo_pago] ?? abono.metodo_pago}</span>
                              )}
                              {abono.notas && <span className="text-gray-400 truncate max-w-[100px]">{abono.notas}</span>}
                              <span className="font-semibold text-green-700">+{formatPEN(abono.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {credito.notas && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Notas:</span> {credito.notas}
                      </p>
                    )}

                    {/* Acción: registrar abono */}
                    {credito.estado !== 'pagado' && puedeAbonar && (
                      <div className="pt-1">
                        <button
                          onClick={() => setAbonoDialog({ creditoId: credito.id, monto: '', metodo: 'efectivo', notas: '' })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Registrar abono
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
