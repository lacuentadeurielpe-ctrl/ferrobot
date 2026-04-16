'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

interface Props {
  token: string
  isLoggedIn: boolean
  userEmail: string | null
}

export default function InviteAcceptButton({ token, isLoggedIn, userEmail }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function aceptar() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/invite/${token}/accept`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al aceptar')
      setDone(true)
      // Redirigir al dashboard después de 1.5s
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-green-600 font-semibold text-sm mb-1">✅ ¡Bienvenido al equipo!</p>
        <p className="text-xs text-gray-400">Redirigiendo al panel…</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 mb-4">
          Primero inicia sesión o crea una cuenta para unirte.
        </p>
        <Link
          href={`/auth/login?redirect=/invite/${token}`}
          className="block w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition"
        >
          Iniciar sesión
        </Link>
        <Link
          href={`/auth/register?redirect=/invite/${token}`}
          className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl text-sm transition"
        >
          Crear cuenta nueva
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Entrando como <span className="font-medium text-gray-600">{userEmail}</span>
      </p>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={aceptar}
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Procesando…' : 'Unirme al equipo'}
      </button>

      <p className="text-xs text-gray-400">
        ¿No es tu cuenta?{' '}
        <Link href="/auth/login" className="text-orange-500 hover:underline">
          Cambiar cuenta
        </Link>
      </p>
    </div>
  )
}
