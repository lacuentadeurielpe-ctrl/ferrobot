'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { type Categoria } from '@/types/database'

interface CategoryManagerProps {
  categorias: Categoria[]
  onChange: (categorias: Categoria[]) => void
}

export default function CategoryManager({ categorias, onChange }: CategoryManagerProps) {
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null) // id de la categoría en operación
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    if (!nueva.trim()) return
    setError(null)
    setLoading('nueva')
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nueva.trim() }),
    })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) { setError(data.error); return }
    onChange([...categorias, data])
    setNueva('')
  }

  async function renombrar(id: string, nombre: string) {
    if (!nombre.trim()) return
    setError(null)
    setLoading(id)
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre.trim() }),
    })
    const data = await res.json()
    setLoading(null)
    if (!res.ok) { setError(data.error); return }
    onChange(categorias.map((c) => (c.id === id ? data : c)))
    setEditando(null)
  }

  async function eliminar(id: string) {
    setError(null)
    setLoading(id)
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    setLoading(null)
    if (!res.ok) { setError('Error al eliminar la categoría.'); return }
    onChange(categorias.filter((c) => c.id !== id))
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-xl">{error}</p>
      )}

      {categorias.map((cat) => (
        <div key={cat.id} className="flex items-center gap-2 group">
          {editando?.id === cat.id ? (
            <>
              <input
                value={editando.nombre}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renombrar(cat.id, editando.nombre)
                  if (e.key === 'Escape') setEditando(null)
                }}
                autoFocus
                className="flex-1 px-2.5 py-1.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <button onClick={() => renombrar(cat.id, editando.nombre)} disabled={loading === cat.id}
                className="text-green-600 hover:text-green-700 transition">
                {loading === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => setEditando(null)} className="text-zinc-400 hover:text-gray-600 transition">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-zinc-700 py-1.5 px-2.5 rounded-xl bg-zinc-50">
                {cat.nombre}
              </span>
              <button onClick={() => setEditando({ id: cat.id, nombre: cat.nombre })}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 transition">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => eliminar(cat.id)} disabled={loading === cat.id}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition">
                {loading === cat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      ))}

      {/* Agregar nueva */}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), crear())}
          placeholder="Nueva categoría..."
          className="flex-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 transition"
        />
        <button onClick={crear} disabled={!nueva.trim() || loading === 'nueva'}
          className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-sm transition">
          {loading === 'nueva' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
