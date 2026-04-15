'use client'

interface DayData {
  dia: string      // "lun", "mar", etc.
  pedidos: number
  cotizaciones: number
}

interface ActivityChartProps {
  datos: DayData[]
}

export default function ActivityChart({ datos }: ActivityChartProps) {
  const maxVal = Math.max(...datos.flatMap((d) => [d.pedidos, d.cotizaciones]), 1)

  const W = 480
  const H = 140
  const padX = 8
  const padY = 12
  const barW = Math.floor((W - padX * 2) / datos.length / 2 - 4)
  const gap = 3

  function barHeight(val: number) {
    return Math.round(((H - padY * 2) * val) / maxVal)
  }

  function xPos(i: number) {
    const slotW = (W - padX * 2) / datos.length
    return padX + slotW * i + slotW / 2
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-auto">
        {/* Líneas guía */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padY + (H - padY * 2) * (1 - pct)
          return (
            <line key={pct} x1={padX} x2={W - padX} y1={y} y2={y}
              stroke="#f3f4f6" strokeWidth={1} />
          )
        })}

        {/* Barras */}
        {datos.map((d, i) => {
          const cx = xPos(i)
          const hPed = barHeight(d.pedidos)
          const hCot = barHeight(d.cotizaciones)

          return (
            <g key={d.dia}>
              {/* Barra cotizaciones (azul) */}
              <rect
                x={cx - barW - gap / 2}
                y={H - padY - hCot}
                width={barW}
                height={hCot || 1}
                rx={2}
                fill="#93c5fd"
                className="hover:fill-blue-400 transition-colors"
              />
              {/* Barra pedidos (naranja) */}
              <rect
                x={cx + gap / 2}
                y={H - padY - hPed}
                width={barW}
                height={hPed || 1}
                rx={2}
                fill="#fb923c"
                className="hover:fill-orange-400 transition-colors"
              />
              {/* Etiqueta día */}
              <text
                x={cx}
                y={H + 15}
                textAnchor="middle"
                fontSize={10}
                fill="#9ca3af"
              >
                {d.dia}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-1 px-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-blue-300 inline-block" />
          Cotizaciones
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" />
          Pedidos
        </span>
      </div>
    </div>
  )
}
