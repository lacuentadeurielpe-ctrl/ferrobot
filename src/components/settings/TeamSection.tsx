'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Link2, Copy, Check, UserX, UserCheck, Loader2, RefreshCw } from 'lucide-react'

interface Miembro {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  created_at: string
}

export default function TeamSection() {
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [cargando, setCargando] = useState(true)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteExpires, setInviteExpires] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [accionando, setAccionando] = useState<string | null>(null)

  const cargarMiembros = useCallback(async () => {
    try {
      const res = await fetch('/api/team')
      if (res.ok) setMiembros(await res.json())
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarMiembros() }, [cargarMiembros])

  async function generarInvitacion() {
    setGenerando(true)
    try {
      const res = await fetch('/api/team/invite', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setInviteLink(data.link)
        setInviteExpires(data.expires_at)
      }
    } finally {
      setGenerando(false)
    }
  }

  async function copiarLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function toggleMiembro(id: string, activo: boolean) {
    setAccionando(id)
    try {
      const res = await fetch(`/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      })
      if (res.ok) {
        setMiembros((prev) => prev.map((m) => m.id === id ? { ...m, activo: !activo } : m))
      }
    } finally {
      setAccionando(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Users className="w-5 h-5 text-gray-600" />
        <h2 className="font-semibold text-gray-900">Equipo</h2>
      </div>

      {/* Generar invitación */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 mb-3">
          Genera un enlace para invitar a un vendedor. El enlace es válido por 7 días y solo puede usarse una vez.
        </p>

        <button
          onClick={generarInvitacion}
          disabled={generando}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
        >
          {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {generando ? 'Generando…' : 'Generar enlace de invitación'}
        </button>

        {inviteLink && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 text-xs text-orange-800 bg-transparent border-none outline-none truncate font-mono"
              />
              <button
                onClick={copiarLink}
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 transition"
              >
                {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {inviteExpires && (
              <p className="text-xs text-orange-600 mt-1.5">
                Expira: {new Date(inviteExpires).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lista de miembros */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Miembros del equipo</h3>
          <button
            onClick={() => { setCargando(true); cargarMiembros() }}
            className="text-gray-400 hover:text-gray-600 transition"
            title="Actualizar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando…
          </div>
        ) : miembros.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">
            Aún no hay vendedores en tu equipo.
          </p>
        ) : (
          <div className="space-y-2">
            {miembros.map((m) => (
              <div
                key={m.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  m.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-70'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.nombre || '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {m.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => toggleMiembro(m.id, m.activo)}
                    disabled={accionando === m.id}
                    title={m.activo ? 'Desactivar acceso' : 'Reactivar acceso'}
                    className="text-gray-400 hover:text-gray-600 transition disabled:opacity-40"
                  >
                    {accionando === m.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : m.activo
                      ? <UserX className="w-4 h-4 text-red-400 hover:text-red-600" />
                      : <UserCheck className="w-4 h-4 text-green-500 hover:text-green-700" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
