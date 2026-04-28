'use client'

import { useState, useMemo } from 'react'
import { ArrowLeftRight, Loader2, Check, Trash2, PackageMinus, AlertTriangle, X } from 'lucide-react'
import { type Producto } from '@/types/database'
import { formatPEN } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Helpers fuzzy ─────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function esSimilar(a: string, b: string): boolean {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = na.split(/\s+/).filter((w) => w.length >= 3)
  const tb = nb.split(/\s+/).filter((w) => w.length >= 3)
  if (ta.length === 0 || tb.length === 0) return false
  const comunes = ta.filter((t) => tb.includes(t))
  return comunes.length / Math.min(ta.length, tb.length) >= 0.5
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface GrupoDuplicado {
  id: string
  productos: Producto[]   // siempre 2 en este MVP
  conservar: number       // índice (0 o 1) del que se quiere conservar
}

interface DuplicadosPanelProps {
  productos: Producto[]
  onMerge: (conservarId: string, eliminarId: string, stockNuevo: number, accion: string) => void
  onClose: () => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DuplicadosPanel({ productos, onMerge, onClose }: DuplicadosPanelProps) {
  // Detectar pares similares al montar (solo una vez)
  const grupos = useMemo<GrupoDuplicado[]>(() => {
    const usados = new Set<string>()
    const result: GrupoDuplicado[] = []

    for (let i = 0; i < productos.length; i++) {
      if (usados.has(productos[i].id)) continue
      for (let j = i + 1; j < productos.length; j++) {
        if (usados.has(productos[j].id)) continue
        if (esSimilar(productos[i].nombre, productos[j].nombre)) {
          usados.add(productos[i].id)
          usados.add(productos[j].id)
          result.push({
            id: `${productos[i].id}-${productos[j].id}`,
            productos: [productos[i], productos[j]],
            conservar: 0,
          })
          break  // un producto solo puede estar en un par
        }
      }
    }
    return result
  }, [productos])

  const [lista, setLista]               = useState<GrupoDuplicado[]>(grupos)
  const [loadingId, setLoadingId]       = useState<string | null>(null)
  const [resultados, setResultados]     = useState<Record<string, string>>({}) // grupoId → mensaje

  function toggleConservar(grupoId: string) {
    setLista((prev) =>
      prev.map((g) => g.id === grupoId ? { ...g, conservar: g.conservar === 0 ? 1 : 0 } : g)
    )
  }

  async function fusionar(grupo: GrupoDuplicado) {
    setLoadingId(grupo.id)
    const conservarId = grupo.productos[grupo.conservar].id
    const eliminarId  = grupo.productos[grupo.conservar === 0 ? 1 : 0].id

    const res = await fetch('/api/products/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conservar_id: conservarId, eliminar_id: eliminarId }),
    })
    const data = await res.json()
    setLoadingId(null)

    if (!res.ok) {
      setResultados((prev) => ({ ...prev, [grupo.id]: `Error: ${data.error}` }))
      return
    }

    const msg = data.accion === 'eliminado'
      ? `✓ Fusionado — ${grupo.productos[grupo.conservar === 0 ? 1 : 0].nombre} eliminado. Stock: ${data.stock_nuevo}`
      : `✓ Fusionado — duplicado desactivado (tenía pedidos/cotizaciones). Stock: ${data.stock_nuevo}`

    setResultados((prev) => ({ ...prev, [grupo.id]: msg }))
    setLista((prev) => prev.filter((g) => g.id !== grupo.id))
    onMerge(conservarId, eliminarId, data.stock_nuevo, data.accion)
  }

  async function soloEliminar(grupo: GrupoDuplicado, idxEliminar: number) {
    const eliminarId = grupo.productos[idxEliminar].id
    setLoadingId(`${grupo.id}-${idxEliminar}`)

    const res = await fetch(`/api/products/${eliminarId}`, { method: 'DELETE' })
    setLoadingId(null)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setResultados((prev) => ({
        ...prev,
        [grupo.id]: `No se pudo eliminar: ${data.error ?? 'tiene pedidos asociados'}`,
      }))
      return
    }

    setResultados((prev) => ({
      ...prev,
      [grupo.id]: `✓ ${grupo.productos[idxEliminar].nombre} eliminado`,
    }))
    setLista((prev) => prev.filter((g) => g.id !== grupo.id))
    onMerge('', eliminarId, 0, 'eliminado')  // notifica al padre para quitar de la lista
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (grupos.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="font-semibold text-zinc-700">¡Sin duplicados!</p>
        <p className="text-sm text-zinc-400 mt-1">Todos los productos tienen nombres únicos.</p>
      </div>
    )
  }

  const pendientes = lista.length
  const resueltos  = Object.keys(resultados).length

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pendientes > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {pendientes} par{pendientes !== 1 ? 'es' : ''} pendiente{pendientes !== 1 ? 's' : ''}
            </span>
          )}
          {resueltos > 0 && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {resueltos} resuelto{resueltos !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400">{grupos.length} pares similares encontrados</p>
      </div>

      {/* Mensajes de resultado previos (ya resueltos) */}
      {Object.entries(resultados).map(([id, msg]) => (
        <div key={id} className={cn(
          'flex items-start gap-2 text-xs px-3 py-2 rounded-lg',
          msg.startsWith('✓')
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-700'
        )}>
          {msg.startsWith('✓') ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{msg}</span>
        </div>
      ))}

      {/* Pares pendientes */}
      {lista.map((grupo) => {
        const [a, b] = grupo.productos
        const conservado = grupo.productos[grupo.conservar]
        const eliminado  = grupo.productos[grupo.conservar === 0 ? 1 : 0]
        const loading    = loadingId === grupo.id || loadingId === `${grupo.id}-0` || loadingId === `${grupo.id}-1`

        return (
          <div key={grupo.id} className="border border-zinc-200 rounded-xl overflow-hidden">
            {/* Cards de los dos productos */}
            <div className="grid grid-cols-[1fr_auto_1fr]">
              {[a, b].map((prod, idx) => {
                const esConservar = grupo.conservar === idx
                return (
                  <div
                    key={prod.id}
                    className={cn(
                      'p-3 transition',
                      esConservar ? 'bg-emerald-50' : 'bg-red-50/60 opacity-70'
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn(
                        'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                        esConservar ? 'bg-emerald-200 text-emerald-800' : 'bg-red-100 text-red-600'
                      )}>
                        {esConservar ? '✓ Conservar' : '✕ Eliminar'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-800 leading-snug line-clamp-2">{prod.nombre}</p>
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-[11px] text-zinc-500">
                        Precio: <span className="font-medium text-zinc-700">{formatPEN(prod.precio_base)}</span>
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Stock: <span className={cn('font-medium', prod.stock === 0 ? 'text-red-500' : 'text-zinc-700')}>
                          {prod.stock}
                        </span>
                      </p>
                      {!prod.activo && (
                        <span className="text-[9px] font-semibold bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">
                          Inactivo
                        </span>
                      )}
                    </div>
                    {/* Botón solo eliminar */}
                    {!esConservar && (
                      <button
                        onClick={() => soloEliminar(grupo, idx)}
                        disabled={loading}
                        title="Eliminar sin fusionar (no transfiere stock)"
                        className="mt-2 flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 disabled:opacity-40 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                        Solo eliminar
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Botón intercambiar en el centro */}
              <div className="flex items-center justify-center px-1">
                <button
                  onClick={() => toggleConservar(grupo.id)}
                  disabled={loading}
                  title="Intercambiar cuál conservar"
                  className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition disabled:opacity-40"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Barra de acción */}
            <div className="bg-zinc-50 border-t border-zinc-100 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500 min-w-0">
                <span className="font-medium text-zinc-700">{conservado.nombre}</span>
                {' '}quedará con stock{' '}
                <span className="font-semibold text-emerald-700">
                  {(conservado.stock ?? 0) + (eliminado.stock ?? 0)}
                </span>
                {' '}({conservado.stock} + {eliminado.stock})
              </div>
              <button
                onClick={() => fusionar(grupo)}
                disabled={loading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PackageMinus className="w-3.5 h-3.5" />}
                Fusionar y eliminar duplicado
              </button>
            </div>
          </div>
        )
      })}

      {lista.length === 0 && resueltos > 0 && (
        <div className="text-center py-6">
          <Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-700">¡Todos los duplicados resueltos!</p>
          <button onClick={onClose} className="mt-3 text-xs text-zinc-400 hover:text-zinc-600 transition flex items-center gap-1 mx-auto">
            <X className="w-3 h-3" /> Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
