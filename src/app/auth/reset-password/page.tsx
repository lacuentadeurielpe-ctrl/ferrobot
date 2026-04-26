'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Cliente creado dentro del handler para evitar instanciación durante prerender
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
    })

    if (error) {
      setError('No se pudo enviar el correo. Verifica tu dirección.')
      setLoading(false)
      return
    }

    setEnviado(true)
    setLoading(false)
  }

  if (enviado) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-8 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">Correo enviado</h2>
        <p className="text-sm text-zinc-500 mb-6">
          Revisa tu bandeja de entrada en <strong>{email}</strong> y sigue el enlace para restablecer tu contraseña.
        </p>
        <Link
          href="/auth/login"
          className="text-zinc-900 hover:text-zinc-700 underline text-sm font-medium"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-8">
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">Recuperar contraseña</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:border-transparent transition"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Enviando...' : 'Enviar enlace'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/auth/login" className="text-sm text-zinc-500 hover:text-zinc-700">
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  )
}
