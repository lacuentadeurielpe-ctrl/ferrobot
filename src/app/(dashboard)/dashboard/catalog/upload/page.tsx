'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, X, Download, Copy } from 'lucide-react'
import Papa from 'papaparse'
import type { FilaProducto } from '@/app/api/upload/products/route'

// ── Detección de duplicados ────────────────────────────────────────────────────

/** Normaliza un nombre para comparación: minúsculas, sin tildes, sin espacios extra */
function normalizarNombre(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

/** Detecta si dos nombres son probablemente el mismo producto (umbral ~75%) */
function nombresSimilares(a: string, b: string): boolean {
  const na = normalizarNombre(a)
  const nb = normalizarNombre(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Contención directa
  if (na.includes(nb) || nb.includes(na)) return true
  // Solapamiento de tokens ≥ 50% del más corto
  const ta = na.split(/\s+/).filter((w) => w.length >= 3)
  const tb = nb.split(/\s+/).filter((w) => w.length >= 3)
  if (ta.length === 0 || tb.length === 0) return false
  const comunes = ta.filter((t) => tb.includes(t))
  return comunes.length / Math.min(ta.length, tb.length) >= 0.5
}

const UNIDADES_VALIDAS = ['unidad', 'bolsa', 'saco', 'metro', 'metro cuadrado', 'galón', 'litro', 'kilo', 'tonelada', 'rollo', 'plancha', 'caja', 'par']

// Parsea y valida una fila cruda del CSV
function parsearFila(raw: Record<string, string>, idx: number): FilaProducto {
  const errores: string[] = []
  const nombre = raw['nombre']?.trim() ?? ''
  const precioRaw = raw['precio_base'] ?? raw['precio'] ?? ''
  const precio_base = parseFloat(precioRaw.replace(',', '.'))
  const stockRaw = raw['stock'] ?? '0'
  const stock = parseInt(stockRaw) || 0
  const unidad = (raw['unidad'] ?? 'unidad').toLowerCase().trim()

  if (!nombre) errores.push('Nombre vacío')
  if (isNaN(precio_base) || precio_base < 0) errores.push('Precio inválido')
  if (!UNIDADES_VALIDAS.includes(unidad) && unidad) errores.push(`Unidad "${unidad}" no reconocida`)

  return {
    fila: idx + 2, // +2 porque la fila 1 es el header
    nombre,
    descripcion: raw['descripcion']?.trim() || undefined,
    categoria: raw['categoria']?.trim() || undefined,
    precio_base: isNaN(precio_base) ? 0 : precio_base,
    unidad: UNIDADES_VALIDAS.includes(unidad) ? unidad : 'unidad',
    stock,
    errores,
  }
}

function descargarPlantilla() {
  const csv = [
    'nombre,descripcion,categoria,precio_base,unidad,stock',
    'Cemento Portland Tipo I,Bolsa de 42.5 kg,Cemento y concreto,28.50,bolsa,100',
    'Varilla de acero 3/8,Corrugada 9m,Acero y fierro,25.00,unidad,200',
    'Pintura látex blanco,Galón interior/exterior,Pinturas,35.00,galón,50',
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_productos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [filas, setFilas] = useState<FilaProducto[]>([])
  const [archivo, setArchivo] = useState<string | null>(null)
  const [parseando, setParseando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ importados: number; categorias_creadas: number } | null>(null)
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null)
  // Detección de duplicados: fila → nombre del producto existente que coincide
  const [duplicados, setDuplicados] = useState<Record<number, string>>({})

  const filasValidas   = filas.filter((f) => f.errores.length === 0)
  const filasConError  = filas.filter((f) => f.errores.length > 0)
  const filasConDuplic = Object.keys(duplicados).length

  /** Compara las filas parseadas contra los productos existentes del catálogo */
  async function detectarDuplicados(filasParsed: FilaProducto[]) {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) return
      const existentes: { nombre: string }[] = await res.json()
      const nombreExistentes = existentes.map((p) => p.nombre)
      const mapa: Record<number, string> = {}
      for (const fila of filasParsed) {
        if (!fila.nombre) continue
        const match = nombreExistentes.find((e) => nombresSimilares(fila.nombre, e))
        if (match) mapa[fila.fila] = match
      }
      setDuplicados(mapa)
    } catch {
      // Si falla el fetch de existentes, simplemente no marcamos duplicados
    }
  }

  function handleArchivo(file: File) {
    setArchivo(file.name)
    setFilas([])
    setDuplicados({})
    setResultado(null)
    setErrorGlobal(null)
    setParseando(true)

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsed = (results.data as Record<string, string>[]).map(parsearFila)
          setFilas(parsed)
          setParseando(false)
          detectarDuplicados(parsed)
        },
        error: () => {
          setErrorGlobal('Error al leer el archivo CSV.')
          setParseando(false)
        },
      })
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const { Workbook } = await import('exceljs')
          const wb = new Workbook()
          await wb.xlsx.load(e.target!.result as ArrayBuffer)
          const ws = wb.worksheets[0]

          const headers: string[] = []
          ws.getRow(1).eachCell((cell) => {
            headers.push(String(cell.value ?? '').toLowerCase().trim())
          })

          const filasParsed: FilaProducto[] = []
          ws.eachRow((row, rowIdx) => {
            if (rowIdx === 1) return // skip header
            const raw: Record<string, string> = {}
            row.eachCell((cell, colIdx) => {
              const header = headers[colIdx - 1]
              if (header) raw[header] = String(cell.value ?? '').trim()
            })
            if (Object.values(raw).some((v) => v)) {
              filasParsed.push(parsearFila(raw, rowIdx - 1))
            }
          })
          setFilas(filasParsed)
          detectarDuplicados(filasParsed)
        } catch {
          setErrorGlobal('Error al leer el archivo Excel.')
        }
        setParseando(false)
      }
      reader.readAsArrayBuffer(file)
    } else {
      setErrorGlobal('Formato no soportado. Use CSV o XLSX.')
      setParseando(false)
    }
  }

  async function importar() {
    if (filasValidas.length === 0) return
    setImportando(true)
    setErrorGlobal(null)

    const res = await fetch('/api/upload/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filas: filasValidas }),
    })
    const data = await res.json()
    setImportando(false)

    if (!res.ok) {
      setErrorGlobal(data.error ?? 'Error al importar.')
      return
    }
    setResultado(data)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/catalog"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition">
          <ArrowLeft className="w-4 h-4" />
          Volver al catálogo
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Carga masiva de productos</h1>
        <p className="text-sm text-gray-500 mt-1">Importa múltiples productos desde un archivo CSV o Excel</p>
      </div>

      {resultado ? (
        // ── RESULTADO ──
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Importación exitosa!</h2>
          <p className="text-gray-600 mb-1">
            <strong>{resultado.importados}</strong> producto{resultado.importados !== 1 ? 's' : ''} importado{resultado.importados !== 1 ? 's' : ''}
          </p>
          {resultado.categorias_creadas > 0 && (
            <p className="text-sm text-gray-400">
              {resultado.categorias_creadas} categoría{resultado.categorias_creadas !== 1 ? 's' : ''} nueva{resultado.categorias_creadas !== 1 ? 's' : ''} creada{resultado.categorias_creadas !== 1 ? 's' : ''}
            </p>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={() => { setResultado(null); setFilas([]); setArchivo(null) }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
              Importar más
            </button>
            <Link href="/dashboard/catalog"
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Ver catálogo
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Zona de carga */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Archivo</h2>
              <button onClick={descargarPlantilla}
                className="flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-600 font-medium transition">
                <Download className="w-3.5 h-3.5" />
                Descargar plantilla CSV
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleArchivo(e.target.files[0])}
            />

            {!archivo ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-orange-300 hover:bg-orange-50/30 transition group"
              >
                <FileSpreadsheet className="w-10 h-10 text-gray-400 group-hover:text-orange-400 mx-auto mb-3 transition" />
                <p className="text-sm font-medium text-gray-600 group-hover:text-orange-600">
                  Haz clic para seleccionar el archivo
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV, XLSX o XLS · Máx. 5 MB</p>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <FileSpreadsheet className="w-8 h-8 text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{archivo}</p>
                  {parseando && <p className="text-xs text-gray-400 mt-0.5">Leyendo archivo...</p>}
                  {!parseando && <p className="text-xs text-gray-400 mt-0.5">{filas.length} filas detectadas</p>}
                </div>
                <button onClick={() => { setArchivo(null); setFilas([]); setErrorGlobal(null) }}
                  className="text-gray-400 hover:text-gray-600 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Instrucciones de columnas */}
            <div className="mt-4 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              <strong>Columnas del archivo:</strong>{' '}
              <code>nombre</code> (requerido) · <code>precio_base</code> (requerido) · <code>descripcion</code> · <code>categoria</code> · <code>unidad</code> · <code>stock</code>
            </div>
          </div>

          {/* Error global */}
          {errorGlobal && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {errorGlobal}
            </div>
          )}

          {/* Preview de filas */}
          {filas.length > 0 && !parseando && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-gray-900">Vista previa</h2>
                  {filasValidas.length > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {filasValidas.length} válidas
                    </span>
                  )}
                  {filasConError.length > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      {filasConError.length} con error
                    </span>
                  )}
                  {filasConDuplic > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {filasConDuplic} posible{filasConDuplic !== 1 ? 's' : ''} duplicado{filasConDuplic !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={importar}
                  disabled={filasValidas.length === 0 || importando}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {importando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importando ? 'Importando...' : `Importar ${filasValidas.length} productos`}
                </button>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fila</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filas.map((fila) => {
                      const dupNombre = duplicados[fila.fila]
                      const rowCls = fila.errores.length > 0 ? 'bg-red-50/50' : dupNombre ? 'bg-amber-50/60' : ''
                      return (
                        <tr key={fila.fila} className={rowCls}>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{fila.fila}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{fila.nombre || <span className="text-red-400 italic">vacío</span>}</p>
                            {fila.descripcion && <p className="text-xs text-gray-400 truncate max-w-xs">{fila.descripcion}</p>}
                            {dupNombre && (
                              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                                <Copy className="w-2.5 h-2.5" />
                                Posible duplicado de: <em>{dupNombre}</em>
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{fila.categoria ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-700">
                            S/ {fila.precio_base.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{fila.unidad}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-gray-700">{fila.stock}</td>
                          <td className="px-4 py-2.5">
                            {fila.errores.length > 0 ? (
                              <div className="group relative">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                <div className="hidden group-hover:block absolute right-0 bottom-full mb-1 bg-gray-900 text-white text-xs rounded-lg p-2 w-48 z-10">
                                  {fila.errores.join(' · ')}
                                </div>
                              </div>
                            ) : dupNombre ? (
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
