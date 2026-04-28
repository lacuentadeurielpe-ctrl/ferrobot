'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Mic, MicOff, Loader2, Check, Trash2, AlertTriangle,
  RefreshCw, Package, Search, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ItemParseado, PedidoParseado } from '@/app/api/orders/voz/route'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Producto {
  id: string
  nombre: string
  unidad: string
  precio_base: number
  precio_compra: number
  stock: number
}

interface Zona {
  id: string
  nombre: string
  tiempo_estimado_min: number
}

interface PedidoVozModalProps {
  productos: Producto[]
  zonas: Zona[]
  onClose: () => void
}

// ── Sub-componente: badge de confianza ────────────────────────────────────────

function ConfianzaBadge({ c }: { c: ItemParseado['confianza'] }) {
  if (c === 'exacto')    return <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">✓ exacto</span>
  if (c === 'aproximado') return <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">≈ aprox.</span>
  return <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">? manual</span>
}

// ── Componente principal ──────────────────────────────────────────────────────

type Paso = 'escuchar' | 'interpretando' | 'confirmar'

export default function PedidoVozModal({ productos, zonas, onClose }: PedidoVozModalProps) {
  const router = useRouter()

  // ── Estado de pasos
  const [paso, setPaso]               = useState<Paso>('escuchar')
  const [transcript, setTranscript]   = useState('')
  const [escuchando, setEscuchando]   = useState(false)
  const [errorIA, setErrorIA]         = useState<string | null>(null)
  const [soportaVoz, setSoportaVoz]   = useState(false)
  const recognitionRef                = useRef<any>(null)

  // ── Estado del pedido parseado (editable)
  const [items, setItems]             = useState<ItemParseado[]>([])
  const [nombreCliente, setNombreCliente] = useState('')
  const [telefonoCliente, setTelefonoCliente] = useState('')
  const [modalidad, setModalidad]     = useState<'recojo' | 'delivery'>('recojo')
  const [direccion, setDireccion]     = useState('')
  const [zonaId, setZonaId]           = useState('')
  const [notas, setNotas]             = useState('')
  const [advertencias, setAdvertencias] = useState<string[]>([])

  // ── Estado de guardado
  const [guardando, setGuardando]     = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSoportaVoz(!!SR)
  }, [])

  // ── Control del micrófono ─────────────────────────────────────────────────

  function toggleMic() {
    if (escuchando) {
      recognitionRef.current?.stop?.()
      setEscuchando(false)
      return
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.lang = 'es-PE'
    rec.continuous = true
    rec.interimResults = false

    rec.onresult = (e: any) => {
      const texto = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim()
      setTranscript(texto)
    }

    rec.onerror = () => { setEscuchando(false) }
    rec.onend   = () => { setEscuchando(false) }

    recognitionRef.current = rec
    rec.start()
    setEscuchando(true)
  }

  function reiniciar() {
    recognitionRef.current?.stop?.()
    setEscuchando(false)
    setTranscript('')
    setErrorIA(null)
    setItems([])
    setNombreCliente('')
    setTelefonoCliente('')
    setModalidad('recojo')
    setDireccion('')
    setZonaId('')
    setNotas('')
    setAdvertencias([])
    setErrorGuardar(null)
    setPaso('escuchar')
  }

  // ── Interpretar con IA ────────────────────────────────────────────────────

  async function interpretar() {
    if (!transcript.trim()) return
    recognitionRef.current?.stop?.()
    setEscuchando(false)
    setPaso('interpretando')
    setErrorIA(null)

    try {
      const res = await fetch('/api/orders/voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const data: PedidoParseado & { error?: string } = await res.json()

      if (!res.ok) {
        setErrorIA(data.error ?? 'Error al interpretar el dictado')
        setPaso('escuchar')
        return
      }

      // Rellenar estado con los datos parseados
      setItems(data.items)
      setNombreCliente(data.nombre_cliente)
      setTelefonoCliente(data.telefono_cliente)
      setModalidad(data.modalidad)
      setDireccion(data.direccion_entrega ?? '')
      setNotas(data.notas ?? '')
      setAdvertencias(data.advertencias)
      setPaso('confirmar')
    } catch {
      setErrorIA('Error de red al interpretar')
      setPaso('escuchar')
    }
  }

  // ── Edición de items ─────────────────────────────────────────────────────

  function actualizarItem(idx: number, campo: 'cantidad' | 'precio_unitario' | 'nombre_producto', valor: string | number) {
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, [campo]: valor } : it
    ))
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Crear pedido ──────────────────────────────────────────────────────────

  const total = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)

  async function guardar() {
    if (!items.length)            { setErrorGuardar('Agrega al menos un producto'); return }
    if (!nombreCliente.trim())    { setErrorGuardar('El nombre del cliente es obligatorio'); return }
    if (!telefonoCliente.trim())  { setErrorGuardar('El teléfono del cliente es obligatorio'); return }
    if (modalidad === 'delivery' && !direccion.trim()) { setErrorGuardar('La dirección es obligatoria para delivery'); return }

    setGuardando(true)
    setErrorGuardar(null)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_cliente:    nombreCliente.trim(),
          telefono_cliente:  telefonoCliente.trim(),
          modalidad,
          direccion_entrega: modalidad === 'delivery' ? direccion.trim() : undefined,
          zona_delivery_id:  modalidad === 'delivery' && zonaId ? zonaId : undefined,
          notas:             notas.trim() || undefined,
          items: items.map((it) => ({
            producto_id:    it.producto_id,
            nombre_producto: it.nombre_producto,
            unidad:          it.unidad,
            cantidad:        it.cantidad,
            precio_unitario: it.precio_unitario,
            costo_unitario:  it.costo_unitario,
          })),
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Error al crear pedido')
      }

      router.refresh()
      onClose()
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
              <Mic className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Pedido por voz</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {paso === 'escuchar'     && 'Dicta el pedido y lo interpretamos con IA'}
                {paso === 'interpretando' && 'Analizando el dictado…'}
                {paso === 'confirmar'    && 'Revisa y confirma antes de crear'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── PASO 1: ESCUCHAR ─────────────────────────────────────────── */}
        {paso === 'escuchar' && (
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
            {/* Indicador de pasos */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
              <span className="text-violet-700 font-medium">Escuchar</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-bold">2</span>
              <span>Interpretar</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-bold">3</span>
              <span>Confirmar</span>
            </div>

            {/* Botón de micrófono */}
            {soportaVoz ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <button
                  onClick={toggleMic}
                  className={cn(
                    'w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-200',
                    escuchando
                      ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-200 animate-pulse'
                      : 'bg-violet-600 hover:bg-violet-700 ring-4 ring-violet-100'
                  )}
                >
                  {escuchando
                    ? <MicOff className="w-10 h-10 text-white" />
                    : <Mic className="w-10 h-10 text-white" />
                  }
                </button>
                <p className="text-sm text-gray-500">
                  {escuchando ? 'Escuchando… toca para detener' : 'Toca para empezar a dictar'}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                Tu navegador no soporta dictado por voz. Escribe el pedido a continuación.
              </div>
            )}

            {/* Transcript / textarea fallback */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {soportaVoz ? 'Transcripción del dictado' : 'Describe el pedido'}
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                placeholder={
                  soportaVoz
                    ? 'La transcripción aparecerá aquí… también puedes editar o escribir directamente.'
                    : 'Ej: 3 bolsas de cemento, 2 tubos PVC 4 pulgadas, para Juan Pérez, teléfono 987654321, recojo en tienda'
                }
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition resize-none text-gray-800 placeholder:text-gray-300"
              />
            </div>

            {/* Ejemplo */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-600">💡 Ejemplo de dictado:</p>
              <p className="italic">"Tres bolsas de cemento sol, dos tubos PVC cuatro pulgadas, un kilo de clavos dos pulgadas. Cliente María Torres, teléfono novecientos ochenta y siete seis cinco cuatro tres dos uno. Recojo en tienda."</p>
            </div>

            {errorIA && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-xl">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorIA}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── PASO 2: INTERPRETANDO ────────────────────────────────────── */}
        {paso === 'interpretando' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-12">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800">Interpretando el dictado…</p>
              <p className="text-sm text-gray-400 mt-1">La IA está identificando productos, cliente y modalidad</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 max-w-sm w-full">
              <p className="text-xs text-gray-400 mb-1 font-medium">Dictado enviado:</p>
              <p className="text-sm text-gray-600 italic line-clamp-4">"{transcript}"</p>
            </div>
          </div>
        )}

        {/* ─── PASO 3: CONFIRMAR ────────────────────────────────────────── */}
        {paso === 'confirmar' && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Indicador de pasos */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-[10px] font-bold">1</span>
              <span>Escuchar</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-[10px] font-bold">2</span>
              <span>Interpretar</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
              <span className="text-violet-700 font-medium">Confirmar</span>
            </div>

            {/* Advertencias de matching */}
            {advertencias.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Verificar antes de guardar
                </p>
                {advertencias.map((a, i) => (
                  <p key={i} className="text-xs text-amber-600">• {a}</p>
                ))}
              </div>
            )}

            {/* Transcripción original (colapsada) */}
            <details className="group">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition select-none">
                Ver dictado original
              </summary>
              <p className="mt-1.5 text-xs text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">"{transcript}"</p>
            </details>

            {/* Productos */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Sin productos detectados — agrega uno manualmente</p>
              ) : (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className={cn(
                      'rounded-xl px-3 py-2.5 border',
                      item.confianza === 'exacto'     && 'bg-emerald-50/50 border-emerald-100',
                      item.confianza === 'aproximado' && 'bg-amber-50/50 border-amber-100',
                      item.confianza === 'manual'     && 'bg-red-50/50 border-red-100',
                    )}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-6 h-6 rounded-lg bg-white border flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <input
                          value={item.nombre_producto}
                          onChange={(e) => actualizarItem(idx, 'nombre_producto', e.target.value)}
                          className="flex-1 text-sm font-medium text-gray-800 bg-transparent focus:outline-none focus:bg-white focus:border focus:border-violet-300 focus:rounded px-1"
                        />
                        <ConfianzaBadge c={item.confianza} />
                        <button onClick={() => eliminarItem(idx)} className="text-gray-300 hover:text-red-500 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {item.confianza !== 'exacto' && item.confianza === 'aproximado' && (
                        <p className="text-[10px] text-amber-600 ml-8 mb-1">
                          Dictado: "<span className="italic">{item.nombre_buscado}</span>"
                        </p>
                      )}
                      {item.confianza === 'manual' && (
                        <p className="text-[10px] text-red-500 ml-8 mb-1">
                          No encontrado en catálogo — ajusta el precio manualmente
                        </p>
                      )}
                      <div className="flex items-center gap-2 ml-8">
                        <input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => actualizarItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                          min={1}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                        <span className="text-xs text-gray-400">{item.unidad} ×</span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">S/</span>
                          <input
                            type="number"
                            value={item.precio_unitario || ''}
                            onChange={(e) => actualizarItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                            min={0}
                            step={0.01}
                            placeholder="0.00"
                            className={cn(
                              'w-24 pl-7 pr-2 py-1 border rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-violet-400',
                              item.precio_unitario === 0 ? 'border-red-300' : 'border-gray-200'
                            )}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 tabular-nums ml-auto">
                          S/{(item.cantidad * item.precio_unitario).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-2">
                <span className="text-sm font-bold text-gray-900">
                  Total: S/{total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Cliente */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Datos del cliente</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input
                    value={nombreCliente}
                    onChange={(e) => setNombreCliente(e.target.value)}
                    placeholder="Juan Pérez"
                    className={cn(
                      'w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition',
                      !nombreCliente.trim() ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teléfono <span className="text-red-500">*</span></label>
                  <input
                    value={telefonoCliente}
                    onChange={(e) => setTelefonoCliente(e.target.value)}
                    placeholder="51987654321"
                    className={cn(
                      'w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition',
                      !telefonoCliente.trim() ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Modalidad */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Modalidad de entrega</h3>
              <div className="flex gap-2 mb-3">
                {(['recojo', 'delivery'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalidad(m)}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg text-sm font-medium transition border',
                      modalidad === m
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    )}
                  >
                    {m === 'recojo' ? 'Recojo en tienda' : 'Delivery'}
                  </button>
                ))}
              </div>

              {modalidad === 'delivery' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dirección <span className="text-red-500">*</span></label>
                    <input
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Jr. Los Ferreros 123"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
                    />
                  </div>
                  {zonas.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Zona de delivery</label>
                      <select
                        value={zonaId}
                        onChange={(e) => setZonaId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition bg-white"
                      >
                        <option value="">Sin zona específica</option>
                        {zonas.map((z) => (
                          <option key={z.id} value={z.id}>{z.nombre} ({z.tiempo_estimado_min} min)</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notas internas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Observaciones adicionales…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition resize-none"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {/* Error de guardado */}
          {errorGuardar && (
            <div className="mb-3 flex items-start gap-2 bg-red-50 text-red-700 text-xs px-3 py-2.5 rounded-xl">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorGuardar}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Botón reiniciar (en confirmar) */}
            {paso === 'confirmar' && (
              <button
                type="button"
                onClick={reiniciar}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reintentar
              </button>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancelar
            </button>

            {/* Botón principal según paso */}
            {paso === 'escuchar' && (
              <button
                type="button"
                onClick={interpretar}
                disabled={!transcript.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition"
              >
                <Search className="w-4 h-4" />
                Interpretar
              </button>
            )}

            {paso === 'confirmar' && (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition"
              >
                {guardando
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />
                }
                {guardando ? 'Creando pedido…' : `Crear pedido · S/${total.toFixed(2)}`}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
