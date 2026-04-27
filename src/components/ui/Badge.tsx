import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'orange' | 'gray' | 'purple'
  className?: string
}

const variants = {
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue:   'bg-blue-100 text-blue-700',
  orange: 'bg-zinc-100 text-zinc-700',
  gray:   'bg-zinc-100 text-zinc-600',
  purple: 'bg-purple-100 text-purple-700',
}

export default function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
