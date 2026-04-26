'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const PERIODOS = [
  { value: 'hoy',    label: 'Hoy' },
  { value: 'ayer',   label: 'Ayer' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes',    label: 'Este mes' },
  { value: '30d',    label: 'Últimos 30d' },
]

export default function PeriodSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const actual = searchParams.get('p') ?? 'hoy'

  return (
    <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl overflow-x-auto shrink-0">
      {PERIODOS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => router.push(`/dashboard?p=${value}`)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap',
            actual === value
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
