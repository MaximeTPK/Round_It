// force rebuild v3
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not configured' })

  try {
    const { origin, destination, waypoints } = req.body

    let url = `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin}&destination=${destination}&mode=driving&key=${apiKey}`

    if (waypoints && waypoints.length > 0) {
      // Max 25 waypoints per request
      url += `&waypoints=${waypoints.slice(0, 25).join('|')}`
    }

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      return res.status(400).json({ error: data.status, message: data.error_message })
    }

    // Return the encoded polyline for each leg
    const polylines = data.routes[0].legs.map(leg => leg.steps.map(s => s.polyline.points))
    const overviewPolyline = data.routes[0].overview_polyline.points

    res.status(200).json({ overviewPolyline, polylines })
  } catch (err) {
    console.error('Directions API error:', err)
    res.status(500).json({ error: err.message })
  }
}
