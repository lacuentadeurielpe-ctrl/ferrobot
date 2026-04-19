'use client'

import { useState } from 'react'
import { FileText, Download, RefreshCw, CheckCircle, BookOpen } from 'lucide-react'
import type { LibroContable } from '@/types/database'

interface Props {
  libros:       LibroContable[]
  ferreteriaId: string
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function periodoLabel(periodo: string): string {
  const year  = periodo.slice(0, 4)
  const month = parseInt(periodo.slice(4, 6)) - 1
  return `${MESES[month]} ${year}`
}

export default function ContabilidadPanel({ libros: librosIniciales, ferreteriaId: _ferreteriaId }: Props) {
  const hoy    = new Date()
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth() + 1)
  const [libros,    setLibros]    = useState<LibroContable[]>(librosIniciales)
  const [generando, setGenerando] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [exito,     setExito]     = useState<string | null>(null)

  const periodo = `${year}${String(month).padStart(2, '0')}`
  const libroActual = libros.find(l => l.periodo === periodo && l.tipo_libro === 'ventas')

  async function generar() {
    setGenerando(true)
    setError(null)
    setExito(null)
    try {
      const res = await fetch('/api/contabilidad/generar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ periodo, tipo_libro: 'ventas' }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Error al generar el libro')
      } else {
        setExito(`Libro generado: ${d.libro.total_registros} comprobante(s) — S/ ${Number(d.libro.total_ventas).toFixed(2)}`)
        // Actualizar lista local
        setLibros(prev => {
          const sin = prev.filter(l => !(l.periodo === periodo && l.tipo_libro === 'ventas'))
          return [d.libro, ...sin].sort((a,b) => b.periodo.localeCompare(a.periodo))
        })
      }
    } catch {
      setError('Error de red al generar el libro')
    } finally {
      setGenerando(false)
    }
  }

  function descargar(id: string, formato: 'ple' | 'csv' | 'excel') {
    window.open(`/api/contabilidad/exportar/${id}?formato=${formato}`, '_blank')
  }

  async function cerrarLibro(id: string) {
    const res = await fetch(`/api/contabilidad/cerrar/${id}`, { method: 'POST' })
    if (res.ok) {
      setLibros(prev => prev.map(l => l.id === id ? { ...l, estado: 'cerrado' as const } : l))
    }
  }

  async function eliminarLibro(id: string) {
    if (!confirm('¿Eliminar este libro? Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/contabilidad/eliminar/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setLibros(prev => prev.filter(l => l.id !== id))
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Selector de periodo + botón generar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Generar Registro de Ventas</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mes</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {MESES.map((m, i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Año</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button
            onClick={generar}
            disabled={generando}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${generando ? 'animate-spin' : ''}`} />
            {generando ? 'Generando...' : 'Generar / Actualizar'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {exito && (
          <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✅ {exito}</p>
        )}

        {/* Cards resumen del periodo seleccionado */}
        {libroActual && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Comprobantes', value: libroActual.total_registros.toString() },
              { label: 'Boletas', value: libroActual.total_boletas.toString() },
              { label: 'Facturas', value: libroActual.total_facturas.toString() },
              { label: 'Total Ventas', value: `S/ ${Number(libroActual.total_ventas).toFixed(2)}` },
            ].map(card => (
              <div key={card.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Botones de descarga */}
        {libroActual && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => descargar(libroActual.id, 'excel')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg border border-emerald-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Excel Formato 14.1 SUNAT
            </button>
            <button
              onClick={() => descargar(libroActual.id, 'ple')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm rounded-lg border border-blue-200 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              PLE .txt (SUNAT electrónico)
            </button>
            <button
              onClick={() => descargar(libroActual.id, 'csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm rounded-lg border border-gray-200 transition"
            >
              <Download className="w-3.5 h-3.5" />
              CSV simple
            </button>
            {libroActual.estado === 'borrador' && (
              <button
                onClick={() => cerrarLibro(libroActual.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm rounded-lg border border-gray-200 transition"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Marcar como declarado
              </button>
            )}
          </div>
        )}
      </div>

      {/* Historial de libros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Historial de libros generados
        </h2>
        {libros.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aún no has generado ningún libro. Selecciona un mes y haz clic en &quot;Generar&quot;.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left pb-2">Periodo</th>
                  <th className="text-left pb-2">Tipo</th>
                  <th className="text-right pb-2">Registros</th>
                  <th className="text-right pb-2">IGV</th>
                  <th className="text-right pb-2">Total</th>
                  <th className="text-left pb-2">Estado</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {libros.map(libro => (
                  <tr key={libro.id} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-900">{periodoLabel(libro.periodo)}</td>
                    <td className="py-2.5 text-gray-600 capitalize">{libro.tipo_libro}</td>
                    <td className="py-2.5 text-right text-gray-700">{libro.total_registros}</td>
                    <td className="py-2.5 text-right text-gray-700">S/ {Number(libro.total_igv).toFixed(2)}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">S/ {Number(libro.total_ventas).toFixed(2)}</td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        libro.estado === 'cerrado'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {libro.estado === 'cerrado' ? '✓ Declarado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => descargar(libro.id, 'excel')}
                          title="Excel Formato 14.1 SUNAT"
                          className="p-1 text-gray-400 hover:text-emerald-600"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => descargar(libro.id, 'ple')}
                          title="Descargar PLE .txt"
                          className="p-1 text-gray-400 hover:text-blue-600"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {libro.estado === 'cerrado' && (
                          <button
                            onClick={() => eliminarLibro(libro.id)}
                            title="Eliminar libro"
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nota informativa */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Sobre el formato PLE SUNAT</p>
        <p>El archivo .txt generado sigue la estructura del <strong>Libro 14 — Registro de Ventas e Ingresos</strong> del PLE de SUNAT.</p>
        <p>Compártelo con tu contador o súbelo directamente al portal PLE de SUNAT. Puedes regenerar el libro cuantas veces necesites antes de declarar.</p>
      </div>
    </div>
  )
}
