import { parsePickingCSV, parseDeliveryCSV } from '../../lib/parser'
import { geocodeAll, geocode } from '../../lib/geocode'
import { solveMultiDayVRP } from '../../lib/vrp'
import { supabase } from '../../lib/supabase'

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

    const cfg = configPart ? JSON.parse(configPart.data.toString()) : {}
    const numTrucks = parseInt(cfg.numTrucks) || 4
    const numDays = parseInt(cfg.numDays) || 1
    const depotAddress = cfg.depotAddress || ''
    const startTime = cfg.startTime || '08:00'
    const endTime = cfg.endTime || '18:00'
    const sessionDate = cfg.sessionDate || new Date().toISOString().slice(0, 10)
    const selectedIds = cfg.selectedIds || null

    let newStops = []
    if (pickingPart) newStops = [...newStops, ...parsePickingCSV(pickingPart.data.toString('utf-8'))]
    if (deliveryPart) newStops = [...newStops, ...parseDeliveryCSV(deliveryPart.data.toString('utf-8'))]

    const { data: existingJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('session_date', sessionDate)

    const existingMap = {}
    if (existingJobs) existingJobs.forEach(j => { existingMap[j.order_id] = j })

    const depotCoords = await geocode(depotAddress)
    if (!depotCoords) return res.status(400).json({ error: 'Depot introuvable: ' + depotAddress })
    const depot = { ...depotCoords, address: depotAddress }

    const stopsToGeocode = newStops.filter(s => {
      const existing = existingMap[s.orders?.[0]]
      return !existing || !existing.lat
    })

    if (stopsToGeocode.length > 0) {
      await new Promise(r => setTimeout(r, 1100))
    }
    const geocoded = await geocodeAll(stopsToGeocode)

    // Récupérer le user depuis le token
    const authHeader = req.headers.authorization
    const token = authHeader?.replace('Bearer ', '')
    let userId = null
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    const allJobs = newStops.map(stop => {
      const orderId = stop.orders?.[0] || stop.address
      const existing = existingMap[orderId]
      const geo = geocoded.find(g => g.address === stop.address)
      return {
        order_id: orderId,
        owner_name: stop.owner,
        address: stop.address,
        type: stop.type,
        status: existing?.status || 'todo',
        lat: existing?.lat || geo?.lat || null,
        lon: existing?.lon || geo?.lon || null,
        orders: stop.orders,
        session_date: sessionDate,
        user_id: userId,
      }
    })

    const { data: savedJobs } = await supabase
      .from('jobs')
      .upsert(allJobs, { onConflict: 'order_id,session_date' })
      .select()

    const jobs = savedJobs || allJobs

    const jobsToOptimize = jobs.filter(j => {
      if (j.status !== 'todo') return false
      if (!j.lat || !j.lon) return false
      if (selectedIds && selectedIds.length > 0) return selectedIds.includes(j.id)
      return true
    })

    const failed = jobs.filter(j => !j.lat || !j.lon)

    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const startMin = sh * 60 + (sm || 0)
    const endMin = eh * 60 + (em || 0)

    const plan = solveMultiDayVRP(depot, jobsToOptimize, numTrucks, numDays, startMin, endMin)

    res.status(200).json({ plan, allJobs: jobs, failed, depot, sessionDate })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}

function parseMultipart(buffer, boundary) {
  const sep = Buffer.from('--' + boundary)
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
