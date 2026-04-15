'use client'

import { Plus, X, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ReglaForm {
  id?: string
  cantidad_min: number
  cantidad_max: number | null
  precio_unitario: number
  modo: 'automatico' | 'consultar_dueno'
}

interface DiscountRulesEditorProps {
  reglas: ReglaForm[]
  onChange: (reglas: ReglaForm[]) => void
  unidad: string
  precioCompra?: number   // para calcular margen por rango
  margenMinimo?: number   // umbral de alerta (%)
}

export default function DiscountRulesEditor({
  reglas,
  onChange,
  unidad,
  precioCompra = 0,
  margenMinimo = 10,
}: DiscountRulesEditorProps) {
  function agregar() {
    const ultima = reglas[reglas.length - 1]
    onChange([
      ...reglas,
      {
        cantidad_min: ultima ? (ultima.cantidad_max ?? ultima.cantidad_min) + 1 : 1,
        cantidad_max: null,
        precio_unitario: 0,
        modo: 'automatico',
      },
    ])
  }

  function actualizar(idx: number, campo: keyof ReglaForm, valor: unknown) {
    onChange(reglas.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)))
  }

  function quitar(idx: number) {
    onChange(reglas.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-3">
      {reglas.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          Sin rangos de descuento. El bot usará el precio base para cualquier cantidad.
        </p>
      )}

      {reglas.map((regla, idx) => {
        const precioVenta = regla.precio_unitario
        const utilidad = precioVenta - precioCompra
        const margen = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0
        const tieneCosto = precioCompra > 0 && precioVenta > 0
        const margenBajo = tieneCosto && margen < margenMinimo

        return (
          <div key={idx} className={cn(
            'rounded-xl p-4 space-y-3',
            margenBajo ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
          )}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Rango {idx + 1}
              </span>
              <button onClick={() => quitar(idx)} className="text-gray-400 hover:text-red-500 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cantidad mínima y máxima */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Desde ({unidad})</label>
                <input
                  type="number"
                  min={1}
                  value={regla.cantidad_min}
                  onChange={(e) => actualizar(idx, 'cantidad_min', parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hasta ({unidad})</label>
                <input
                  type="number"
                  min={regla.cantidad_min}
                  placeholder="Sin límite"
                  value={regla.cantidad_max ?? ''}
                  onChange={(e) => actualizar(idx, 'cantidad_max', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Precio venta (S/)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={regla.precio_unitario || ''}
                  onChange={(e) => actualizar(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white"
                />
              </div>
            </div>

            {/* Resumen de ganancia por rango */}
            {tieneCosto && (
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
                margenBajo
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-50 text-green-700'
              )}>
                {margenBajo && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span>
                  {margenBajo
                    ? <>⚠️ Ganancia: <strong>S/{utilidad.toFixed(2)}</strong> ({margen.toFixed(1)}%) — por debajo del mínimo de {margenMinimo}%</>
                    : <>Ganancia: <strong>S/{utilidad.toFixed(2)}</strong> por {unidad} ({margen.toFixed(1)}%)</>
                  }
                </span>
              </div>
            )}

            {/* Modo */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">¿Qué hace el bot con este precio?</label>
              <div className="flex gap-2">
                {[
                  { value: 'automatico', label: 'Aplica automáticamente' },
                  { value: 'consultar_dueno', label: 'Consulta al encargado' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => actualizar(idx, 'modo', value)}
                    className={cn(
                      'flex-1 text-xs py-1.5 px-2 rounded-lg border transition font-medium',
                      regla.modo === value
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={agregar}
        className="flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600 font-medium transition"
      >
        <Plus className="w-4 h-4" />
        Agregar rango de precio
      </button>

      {reglas.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Automático:</strong> el bot aplica el precio directamente en la cotización.{' '}
            <strong>Consulta al encargado:</strong> el bot avisa al cliente que hay precio especial y notifica al dueño para que confirme.
          </span>
        </div>
      )}
    </div>
  )
}
