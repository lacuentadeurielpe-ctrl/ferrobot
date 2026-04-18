'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

interface DayData {
  dia: string      // etiqueta del eje X
  pedidos: number
  cotizaciones: number
}

interface ActivityChartProps {
  datos: DayData[]
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 4px rgba(0,0,0,.08)',
}

const LEGEND_FORMATTER = (value: string) => (
  <span style={{ fontSize: 12, color: '#6b7280' }}>{value}</span>
)

export default function ActivityChart({ datos }: ActivityChartProps) {
  // ≤7 puntos → barras verticales; más → área suavizada
  if (datos.length <= 7) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={datos} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f9fafb' }} />
          <Legend iconType="square" iconSize={10} formatter={LEGEND_FORMATTER} />
          <Bar dataKey="cotizaciones" name="Cotizaciones" fill="#93c5fd" radius={[3, 3, 0, 0]} />
          <Bar dataKey="pedidos"      name="Pedidos"      fill="#fb923c" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Gráfico de área para períodos largos (semana, mes, 30d)
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={datos} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gCot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#93c5fd" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#93c5fd" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gPed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#fb923c" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="square" iconSize={10} formatter={LEGEND_FORMATTER} />
        <Area type="monotone" dataKey="cotizaciones" name="Cotizaciones"
          stroke="#93c5fd" strokeWidth={2} fill="url(#gCot)" />
        <Area type="monotone" dataKey="pedidos" name="Pedidos"
          stroke="#fb923c" strokeWidth={2} fill="url(#gPed)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
