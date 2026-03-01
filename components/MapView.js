import { useEffect, useRef } from 'react'

const COLORS = ['#2563EB', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']

export default function MapView({ routes, depot, highlightTruck }) {
  const mapRef = useRef(null)
  const instanceRef = useRef(null)
  const layersRef = useRef([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const L = require('leaflet')
    if (!instanceRef.current) {
      instanceRef.current = L.map(mapRef.current, {
        center: depot ? [depot.lat, depot.lon] : [48.8566, 2.3522],
        zoom: 12,
        zoomControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(instanceRef.current)
    }

    const map = instanceRef.current
    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []
    const bounds = []

    if (depot) {
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:white;border:3px solid #2563EB;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>`,
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const m = L.marker([depot.lat, depot.lon], { icon }).bindPopup(`<b>Dépôt</b><br/>${depot.address}`)
      m.addTo(map)
      layersRef.current.push(m)
      bounds.push([depot.lat, depot.lon])
    }

    routes.forEach((route, ri) => {
      const color = COLORS[ri % COLORS.length]
      const opacity = highlightTruck === null || highlightTruck === route.truckId ? 1 : 0.2
      const pts = depot ? [[depot.lat, depot.lon]] : []

      route.stops.forEach((stop, si) => {
        if (!stop.lat || !stop.lon) return
        pts.push([stop.lat, stop.lon])
        bounds.push([stop.lat, stop.lon])

        const label = stop.type === 'picking' ? 'P' : 'D'
        const bg = stop.type === 'picking' ? color : '#fff'
        const txtColor = stop.type === 'picking' ? '#fff' : color
        const border = stop.type === 'picking' ? 'none' : `2px solid ${color}`

        const icon = L.divIcon({
          html: `<div style="width:26px;height:26px;background:${bg};border:${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${txtColor};box-shadow:0 2px 6px rgba(0,0,0,0.15);opacity:${opacity}">${si + 1}${label}</div>`,
          className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        })

        const popup = `<div style="font-family:DM Sans,sans-serif;min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">${stop.owner || stop.address}</div>
          <div style="font-size:12px;color:#64748B;margin-bottom:6px">${stop.address}</div>
          <div style="font-size:11px">
            <span style="background:${stop.type === 'picking' ? '#FEF3C7' : '#DBEAFE'};color:${stop.type === 'picking' ? '#B45309' : '#1D4ED8'};padding:2px 6px;border-radius:4px;font-weight:600">
              ${stop.type === 'picking' ? 'Ramasse' : 'Livraison'}
            </span>
            · ${stop.orders?.length || 1} order(s)
          </div>
          <div style="font-size:11px;margin-top:4px;color:#2563EB">Arrivée ${stop.arrivalTime}</div>
        </div>`

        const mk = L.marker([stop.lat, stop.lon], { icon }).bindPopup(popup)
        mk.addTo(map)
        layersRef.current.push(mk)
      })

      if (pts.length > 1) {
        pts.push([depot.lat, depot.lon])
        const line = L.polyline(pts, { color, weight: 2.5, opacity, dashArray: '7 4' })
        line.addTo(map)
        layersRef.current.push(line)
      }
    })

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
  }, [routes, depot, highlightTruck])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
