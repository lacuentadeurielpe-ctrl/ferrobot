import { useState, useMemo } from 'react'
import { matchesFuzzy } from '@/lib/utils'

export function useOrderFilters(pedidos: any[]) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')

  function estaEnRango(fecha: string, rango: string): boolean {
    if (!rango) return true
    const d = new Date(fecha)
    const ahora = new Date()
    ahora.setHours(23, 59, 59, 999)
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    if (rango === 'hoy') return d >= inicio && d <= ahora
    if (rango === 'semana') {
      inicio.setDate(inicio.getDate() - inicio.getDay())
      return d >= inicio && d <= ahora
    }
    if (rango === 'mes') {
      inicio.setDate(1)
      return d >= inicio && d <= ahora
    }
    return true
  }

  const filtrados = useMemo(() => {
    return pedidos.filter((p) => {
      const nombreCliente = p.clientes?.nombre ?? p.nombre_cliente ?? ''
      const telefono = p.clientes?.telefono ?? p.telefono_cliente ?? ''

      const matchBusqueda = matchesFuzzy(`${nombreCliente} ${telefono} ${p.numero_pedido}`, busqueda)

      const matchEstado = !filtroEstado || p.estado === filtroEstado
      const matchFecha = estaEnRango(p.created_at, filtroFecha)

      return matchBusqueda && matchEstado && matchFecha
    })
  }, [pedidos, busqueda, filtroEstado, filtroFecha])

  const hayFiltros = busqueda || filtroEstado || filtroFecha

  return {
    busqueda,
    setBusqueda,
    filtroEstado,
    setFiltroEstado,
    filtroFecha,
    setFiltroFecha,
    filtrados,
    hayFiltros
  }
}
