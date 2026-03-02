import { useEffect, useRef } from 'react'

const COLORS = ['#2563EB', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const STATUS_COLORS = { todo: '#2563EB', done: '#059669', ecarte: '#D97706' }
const REGISTRY = {}

export default function MapView({ jobs, routes, depot, highlightTruck, onStatusChange, onSelect, selectedIds = [], lang = 'fr' }) {
  const mapRef = useRef(null)
  const instanceRef = useRef(null)
  const layersRef = useRef([])

  const t = lang === 'en'
    ? { done: 'Done', ecarte: 'Skipped', select: '+ Select', depot: 'Depot' }
    : { done: 'Fait', ecarte: 'Écarté', select: '+ Sélect.', depot: 'Dépôt' }

  useEffect(() => {
    if (instanceRef.current) return
    const L = require('leaflet')
    instanceRef.current = L.map(mapRef.current, { center: [48.8566, 2.3522], zoom: 12 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(instanceRef.current)

    window.__ri = (id, action, status) => {
      const r = REGISTRY[id]
      if (!r) return
      if (action === 's') r.onStatus(status)
      if (action === 'x') r.onSelect()
    }
  }, [])

  useEffect(() => {
    if (!instanceRef.current) return
    const L = require('leaflet')
    const map = instanceRef.current

    jobs.forEach(job => {
      REGISTRY[job.id] = {
        onStatus: (s) => { onStatusChange(job.id, s); map.closePopup() },
        onSelect: () => { onSelect(job.id); map.closePopup() },
      }
    })

    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []
    const bounds = []

    if (routes && depot) {
      routes.forEach((truck, ti) => {
        const color = COLORS[ti % COLORS.length]
        const opacity = highlightTruck == null || highlightTruck === truck.truckId ? 1 : 0.15
        const pts = [[depot.lat, depot.lon]]
        truck.stops.forEach(s => { if (s.lat && s.lon) pts.push([s.lat, s.lon]) })
        pts.push([depot.lat, depot.lon])
        if (pts.length > 2) {
          const line = L.polyline(pts, { color, weight: 2.5, opacity, dashArray: '7 4' })
          line.addTo(map)
          layersRef.current.push(line)
        }
      })
    }

    if (depot) {
      const icon = L.divIcon({
        html: '<div style="width:14px;height:14px;background:white;border:3px solid #2563EB;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>',
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      })
      const dm = L.marker([depot.lat, depot.lon], { icon }).bindPopup('<b>' + t.depot + '</b>')
      dm.addTo(map)
      layersRef.current.push(dm)
      bounds.push([depot.lat, depot.lon])
    }

    jobs.forEach(job => {
      if (!job.lat || !job.lon) return
      bounds.push([job.lat, job.lon])
      const isSelected = selectedIds.includes(job.id)
      const color = isSelected ? '#0F2D52' : (STATUS_COLORS[job.status] || '#2563EB')
      const opacity = job.status === 'done' ? 0.5 : 1
      const ring = isSelected
        ? 'box-shadow:0 0 0 4px rgba(37,99,235,0.3),0 2px 6px rgba(0,0,0,0.15);'
        : 'box-shadow:0 2px 6px rgba(0,0,0,0.15);'

      const icon = L.divIcon({
        html: '<div style="width:26px;height:26px;background:' + color + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;' + ring + 'opacity:' + opacity + ';border:2px solid rgba(255,255,255,0.8)">' + (job.type === 'picking' ? 'P' : 'D') + '</div>',
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      })

      const popupHtml =
        '<div style="font-family:DM Sans,sans-serif;min-width:180px">' +
        '<div style="font-weight:700;margin-bottom:2px;font-size:12px">' + (job.owner_name || job.address) + '</div>' +
        '<div style="font-size:10px;color:#64748B;margin-bottom:8px">' + job.address + '</div>' +
        '<div style="display:flex;gap:4px">' +
        '<button onclick="window.__ri(\'' + job.id + '\',\'s\',\'done\')" style="flex:1;padding:5px 0;border-radius:5px;background:#F0FDF4;color:#059669;font-size:10px;font-weight:700;border:none;cursor:pointer">✅ ' + t.done + '</button>' +
        '<button onclick="window.__ri(\'' + job.id + '\',\'s\',\'ecarte\')" style="flex:1;padding:5px 0;border-radius:5px;background:#FFFBEB;color:#D97706;font-size:10px;font-weight:700;border:none;cursor:pointer">🔶 ' + t.ecarte + '</button>' +
        '<button onclick="window.__ri(\'' + job.id + '\',\'x\')" style="flex:1;padding:5px 0;border-radius:5px;background:#EFF6FF;color:#2563EB;font-size:10px;font-weight:700;border:none;cursor:pointer">' + t.select + '</button>' +
        '</div></div>'

      const mk = L.marker([job.lat, job.lon], { icon }).bindPopup(popupHtml)
      mk.addTo(map)
      layersRef.current.push(mk)
    })

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
    else if (depot) map.setView([depot.lat, depot.lon], 12)
  }, [jobs, routes, depot, highlightTruck, selectedIds, lang, onStatusChange, onSelect])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
