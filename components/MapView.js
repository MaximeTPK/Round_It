import { useEffect, useRef } from 'react'

const COLORS = ['#2ECC8F', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const STATUS_COLORS = { pending: '#6366F1', todo: '#2563EB', done: '#059669', ecarte: '#D97706' }
const REGISTRY = {}

// Decode Google encoded polyline
function decodePolyline(encoded) {
  const points = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let shift = 0, result = 0, byte
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

// Fetch real route polyline from our API proxy
async function fetchRoutePolyline(depot, stops) {
  if (!stops || stops.length === 0) return null
  try {
    const origin = `${depot.lat},${depot.lon || depot.lng}`
    const destination = origin // Return to depot
    const waypoints = stops.map(s => `${s.lat},${s.lon || s.lng}`).filter(w => !w.includes('undefined') && !w.includes('null'))
    if (waypoints.length === 0) return null

    const res = await fetch('/api/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, waypoints }),
    })

    if (!res.ok) return null
    const data = await res.json()
    if (data.overviewPolyline) {
      return decodePolyline(data.overviewPolyline)
    }
    return null
  } catch {
    return null
  }
}

export default function MapView({ jobs, routes, depot, highlightTruck, onStatusChange, onSelect, selectedIds = [], lang = 'fr', showRoutes = true }) {
  const mapRef = useRef(null)
  const instanceRef = useRef(null)
  const layersRef = useRef([])
  const routeCacheRef = useRef({}) // Cache polylines by truckId

  const t = lang === 'en'
    ? { done: 'Done', ecarte: 'Skipped', select: '+ Select', depot: 'Depot' }
    : { done: 'Fait', ecarte: 'Écarté', select: '+ Sélect.', depot: 'Dépôt' }

  useEffect(() => {
    if (instanceRef.current) return
    const L = require('leaflet')
    instanceRef.current = L.map(mapRef.current, { center: [48.8566, 2.3522], zoom: 12, zoomControl: false })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/">OSM</a>',
      maxZoom: 19, subdomains: 'abcd',
    }).addTo(instanceRef.current)
    L.control.zoom({ position: 'bottomright' }).addTo(instanceRef.current)

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

    const getLon = (obj) => obj?.lon ?? obj?.lng ?? null
    const depotLon = getLon(depot)

    // Draw routes
    if (showRoutes && routes && depot && depot.lat && depotLon) {
      routes.forEach(async (truck, ti) => {
        const color = COLORS[ti % COLORS.length]
        const opacity = highlightTruck == null || highlightTruck === truck.truckId ? 0.8 : 0.15

        // Try to fetch real route polyline
        const cacheKey = truck.truckId + '_' + truck.stops.map(s => s.lat).join(',')

        if (!routeCacheRef.current[cacheKey]) {
          const polyline = await fetchRoutePolyline(depot, truck.stops)
          routeCacheRef.current[cacheKey] = polyline
        }

        const cachedPolyline = routeCacheRef.current[cacheKey]

        if (cachedPolyline) {
          // Real route from Google
          const line = L.polyline(cachedPolyline, { color, weight: 3, opacity, smoothFactor: 1 })
          line.addTo(map)
          layersRef.current.push(line)
        } else {
          // Fallback: straight lines
          const pts = [[depot.lat, depotLon]]
          truck.stops.forEach(s => {
            const sLon = getLon(s)
            if (s.lat && sLon) pts.push([s.lat, sLon])
          })
          pts.push([depot.lat, depotLon])
          if (pts.length > 2) {
            const line = L.polyline(pts, { color, weight: 2.5, opacity, dashArray: '7 4' })
            line.addTo(map)
            layersRef.current.push(line)
          }
        }
      })
    }

    // Depot marker
    if (depot && depot.lat && depotLon) {
      const icon = L.divIcon({
        html: '<div style="width:16px;height:16px;background:white;border:3px solid #1B7A6B;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>',
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      })
      const dm = L.marker([depot.lat, depotLon], { icon }).bindPopup('<b>' + t.depot + '</b>')
      dm.addTo(map)
      layersRef.current.push(dm)
      bounds.push([depot.lat, depotLon])
    }

    // Job markers
    jobs.forEach(job => {
      const jobLon = getLon(job)
      if (!job.lat || !jobLon) return
      bounds.push([job.lat, jobLon])
      const isSelected = selectedIds.includes(job.id)
      const color = isSelected ? '#0F2D52' : (STATUS_COLORS[job.status] || '#2563EB')
      const opacity = job.status === 'done' ? 0.5 : job.status === 'pending' ? 0.6 : 1
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

      const mk = L.marker([job.lat, jobLon], { icon }).bindPopup(popupHtml)
      mk.addTo(map)
      layersRef.current.push(mk)
    })

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
    else if (depot && depot.lat && depotLon) map.setView([depot.lat, depotLon], 12)
  }, [jobs, routes, depot, highlightTruck, selectedIds, lang, showRoutes, onStatusChange, onSelect])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
