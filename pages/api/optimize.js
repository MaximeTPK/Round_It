import { parsePickingCSV, parseDeliveryCSV } from '../../lib/parser'
import { geocode, geocodeAll } from '../../lib/geocode'
import { solveVRP } from '../../lib/vrp'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)
    const boundary = (req.headers['content-type'] || '').split('boundary=')[1]
    if (!boundary) return res.status(400).json({ error: 'No boundary' })

    const parts = parseMultipart(buffer, boundary)
    const pickingPart = parts.find(p => p.name === 'picking')
    const deliveryPart = parts.find(p => p.name === 'delivery')
    const configPart = parts.find(p => p.name === 'config')

    if (!pickingPart && !deliveryPart) {
      return res.status(400).json({ error: 'Aucun fichier fourni' })
    }

    const cfg = configPart ? JSON.parse(configPart.data.toString()) : {}
    const numTrucks = parseInt(cfg.numTrucks) || 4
    const depotAddress = cfg.depotAddress || ''
    const startTime = cfg.startTime || '08:00'
    const [sh, sm] = startTime.split(':').map(Number)
    const startMin = sh * 60 + (sm || 0)

    let stops = []
    if (pickingPart) {
      const text = pickingPart.data.toString('utf-8')
      stops = [...stops, ...parsePickingCSV(text)]
    }
    if (deliveryPart) {
      const text = deliveryPart.data.toString('utf-8')
      stops = [...stops, ...parseDeliveryCSV(text)]
    }

    const depotCoords = await geocode(depotAddress)
    if (!depotCoords) return res.status(400).json({ error: `Impossible de géolocaliser le dépôt: ${depotAddress}` })
    const depot = { ...depotCoords, address: depotAddress, name: 'Dépôt' }

    await new Promise(r => setTimeout(r, 1100))
    const geocoded = await geocodeAll(stops)
    const valid = geocoded.filter(s => s.lat && s.lon)
    const failed = geocoded.filter(s => !s.lat || !s.lon)

    const routes = solveVRP(depot, valid, numTrucks, startMin)

    res.status(200).json({ routes, failed, depot, totalStops: stops.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}

function parseMultipart(buffer, boundary) {
  const sep = Buffer.from(`--${boundary}`)
  const parts = []
  let start = 0
  while (start < buffer.length) {
    const idx = buffer.indexOf(sep, start)
    if (idx === -1) break
    const end = buffer.indexOf(sep, idx + sep.length)
    if (end === -1) break
    const part = buffer.slice(idx + sep.length + 2, end - 2)
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) { start = end; continue }
    const headerStr = part.slice(0, headerEnd).toString()
    const data = part.slice(headerEnd + 4)
    const nameMatch = headerStr.match(/name="([^"]+)"/)
    parts.push({ name: nameMatch?.[1], data })
    start = end
  }
  return parts
}
