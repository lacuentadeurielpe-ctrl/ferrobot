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
  borderRadius: 10,
  border: '1px solid #e4e4e7',
  boxShadow: '0 1px 6px rgba(0,0,0,.07)',
}

const LEGEND_FORMATTER = (value: string) => (
  <span style={{ fontSize: 12, color: '#71717a' }}>{value}</span>
)

const TICK_STYLE = { fontSize: 11, fill: '#a1a1aa' }

export default function ActivityChart({ datos }: ActivityChartProps) {
  // ≤7 puntos → barras verticales; más → área suavizada
  if (datos.length <= 7) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={datos} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis dataKey="dia" tick={TICK_STYLE} />
          <YAxis allowDecimals={false} tick={TICK_STYLE} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#fafafa' }} />
          <Legend iconType="square" iconSize={10} formatter={LEGEND_FORMATTER} />
          <Bar dataKey="cotizaciones" name="Cotizaciones" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
          <Bar dataKey="pedidos"      name="Pedidos"      fill="#18181b" radius={[3, 3, 0, 0]} />
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
            <stop offset="5%"  stopColor="#a1a1aa" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="gPed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#18181b" stopOpacity={0.2}  />
            <stop offset="95%" stopColor="#18181b" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#a1a1aa' }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={TICK_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="square" iconSize={10} formatter={LEGEND_FORMATTER} />
        <Area type="monotone" dataKey="cotizaciones" name="Cotizaciones"
          stroke="#a1a1aa" strokeWidth={2} fill="url(#gCot)" />
        <Area type="monotone" dataKey="pedidos" name="Pedidos"
          stroke="#18181b" strokeWidth={2} fill="url(#gPed)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
