'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, Trash2, Zap, BookOpen, ChevronDown } from 'lucide-react'

interface Producto {
  id: string
  nombre: string
  unidad: string
}

interface ParComplementario {
  id: string
  tipo: 'manual' | 'auto'
  frecuencia: number
  activo: boolean
  producto: Producto
  complementario: Producto
}

interface Props {
  productos: Producto[]
}

export default function ComplementariosSection({ productos }: Props) {
  const [pares, setPares] = useState<ParComplementario[]>([])
  const [cargando, setCargando] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Formulario nuevo par
  const [productoId, setProductoId] = useState('')
  const [complementarioId, setComplementarioId] = useState('')
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Separar manuales y auto
  const manuales = pares.filter((p) => p.tipo === 'manual')
  const autos    = pares.filter((p) => p.tipo === 'auto')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const res = await fetch('/api/complementarios')
    if (res.ok) {
      const { data } = await res.json()
      setPares(data ?? [])
    }
    setCargando(false)
  }

  async function agregar() {
    setErrorForm(null)
    if (!productoId || !complementarioId) {
      setErrorForm('Selecciona ambos productos')
      return
    }
    if (productoId === complementarioId) {
      setErrorForm('Los dos productos deben ser diferentes')
      return
    }
    // Verificar que el par no existe ya
    const yaExiste = pares.some(
      (p) => p.producto.id === productoId && p.complementario.id === complementarioId
    )
    if (yaExiste) {
      setErrorForm('Este par ya está configurado')
      return
    }

    setGuardando(true)
    const res = await fetch('/api/complementarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: productoId, complementario_id: complementarioId }),
    })
    setGuardando(false)

    if (!res.ok) {
      const { error } = await res.json()
      setErrorForm(error ?? 'Error al guardar')
      return
    }
    setProductoId('')
    setComplementarioId('')
    cargar()
  }

  async function eliminar(id: string) {
    startTransition(async () => {
      await fetch(`/api/complementarios/${id}`, { method: 'DELETE' })
      cargar()
    })
  }

  async function toggleActivo(id: string, activo: boolean) {
    startTransition(async () => {
      await fetch(`/api/complementarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo }),
      })
      cargar()
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Productos complementarios</h2>
        <p className="text-xs text-gray-500 mt-1">
          Configura qué productos va bien juntos. El bot solo los sugerirá si el cliente ya compró
          el producto base <em>y</em> la sugerencia tiene sentido con lo que está pidiendo.
        </p>
      </div>

      {/* Formulario agregar par */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-600">Agregar par manual</p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="relative">
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Producto base…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <span className="text-xs text-gray-400 font-medium">→</span>

          <div className="relative">
            <select
              value={complementarioId}
              onChange={(e) => setComplementarioId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 pr-8 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Complementario…</option>
              {productos
                .filter((p) => p.id !== productoId)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {errorForm && <p className="text-xs text-red-600">{errorForm}</p>}

        <button
          onClick={agregar}
          disabled={guardando || !productoId || !complementarioId}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {guardando ? 'Guardando…' : 'Agregar par'}
        </button>
        <p className="text-xs text-gray-400">
          Se crea el par en ambas direcciones (A→B y B→A) automáticamente.
        </p>
      </div>

      {cargando && <p className="text-xs text-gray-400">Cargando…</p>}

      {/* Pares manuales */}
      {!cargando && manuales.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-gray-600">Configurados por ti ({manuales.length})</span>
          </div>
          <div className="space-y-1">
            {manuales.map((par) => (
              <div
                key={par.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                  par.activo ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-800 truncate">{par.producto.nombre}</span>
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <span className="text-gray-700 truncate">{par.complementario.nombre}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <button
                    onClick={() => toggleActivo(par.id, !par.activo)}
                    disabled={isPending}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      par.activo
                        ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                        : 'border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {par.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    onClick={() => eliminar(par.id)}
                    disabled={isPending}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                    title="Eliminar par"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pares auto-detectados */}
      {!cargando && autos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-gray-600">
              Auto-detectados ({autos.length}) — basados en compras reales
            </span>
          </div>
          <div className="space-y-1">
            {autos.map((par) => (
              <div
                key={par.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                  par.activo ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-800 truncate">{par.producto.nombre}</span>
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <span className="text-gray-700 truncate">{par.complementario.nombre}</span>
                  <span className="text-xs text-blue-500 shrink-0">
                    {Math.round(par.frecuencia * 100)}% co-compra
                  </span>
                </div>
                <button
                  onClick={() => toggleActivo(par.id, !par.activo)}
                  disabled={isPending}
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ml-2 shrink-0 transition-colors ${
                    par.activo
                      ? 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100'
                      : 'border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {par.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Se actualizan automáticamente cada semana. No los puedes eliminar, solo desactivar.
          </p>
        </div>
      )}

      {!cargando && pares.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          Sin pares configurados aún. Agrega el primero arriba.
        </p>
      )}
    </div>
  )
}
