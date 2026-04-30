'use client'

import { useEffect, useRef } from 'react'

interface TrackingMapProps {
  repartidorLat: number | null
  repartidorLng: number | null
  clienteLat:    number | null
  clienteLng:    number | null
}

export default function TrackingMap({
  repartidorLat,
  repartidorLng,
  clienteLat,
  clienteLng,
}: TrackingMapProps) {
  const mapRef     = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repMarker  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef    = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current) return

    // Centro inicial: repartidor si tiene coords, si no cliente, si no Lima
    const centerLat = repartidorLat ?? clienteLat ?? -12.0464
    const centerLng = repartidorLng ?? clienteLng ?? -77.0428

    // Carga Leaflet dinámicamente (es browser-only)
    import('leaflet').then((L) => {
      // Fix icono default de Leaflet en bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      if (mapObjRef.current) {
        // Ya inicializado — solo actualizar posición del repartidor
        if (repartidorLat && repartidorLng) {
          const newPos = L.latLng(repartidorLat, repartidorLng)
          repMarker.current?.setLatLng(newPos)
          lineRef.current?.setLatLngs(
            clienteLat && clienteLng
              ? [newPos, L.latLng(clienteLat, clienteLng)]
              : [newPos],
          )
        }
        return
      }

      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: true })
        .setView([centerLat, centerLng], 15)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Icono del repartidor (naranja)
      const truckIcon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#f97316;border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;line-height:1;
        ">🚚</div>`,
        className: '',
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
      })

      // Icono del destino (verde)
      const homeIcon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#22c55e;border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;line-height:1;
        ">📍</div>`,
        className: '',
        iconSize:   [36, 36],
        iconAnchor: [18, 36],
      })

      // Marcador repartidor
      if (repartidorLat && repartidorLng) {
        repMarker.current = L.marker([repartidorLat, repartidorLng], { icon: truckIcon })
          .addTo(map)
          .bindPopup('🚚 Repartidor')
      }

      // Marcador destino
      if (clienteLat && clienteLng) {
        L.marker([clienteLat, clienteLng], { icon: homeIcon })
          .addTo(map)
          .bindPopup('📍 Tu dirección')
      }

      // Línea entre repartidor y destino
      if (repartidorLat && repartidorLng && clienteLat && clienteLng) {
        lineRef.current = L.polyline(
          [[repartidorLat, repartidorLng], [clienteLat, clienteLng]],
          { color: '#f97316', weight: 3, dashArray: '6, 8', opacity: 0.7 },
        ).addTo(map)

        // Ajustar vista para ver ambos puntos
        map.fitBounds([
          [repartidorLat, repartidorLng],
          [clienteLat,    clienteLng],
        ], { padding: [40, 40] })
      }

      mapObjRef.current = map
    })

    return () => {
      mapObjRef.current?.remove()
      mapObjRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo inicializa una vez — las actualizaciones usan las refs

  // Actualizar marker cuando cambian coords (sin reinicializar el mapa)
  useEffect(() => {
    if (!mapObjRef.current) return
    import('leaflet').then((L) => {
      if (repartidorLat && repartidorLng) {
        const newPos = L.latLng(repartidorLat, repartidorLng)
        repMarker.current?.setLatLng(newPos)
        if (clienteLat && clienteLng) {
          lineRef.current?.setLatLngs([newPos, L.latLng(clienteLat, clienteLng)])
        }
      }
    })
  }, [repartidorLat, repartidorLng, clienteLat, clienteLng])

  return (
    <div
      ref={mapRef}
      style={{ height: '100%', width: '100%', minHeight: '280px' }}
    />
  )
}
