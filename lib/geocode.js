const CACHE = {}

export async function geocode(address) {
  const clean = address.replace(/[^a-zA-Z0-9\s,\-éèêëàâùûüôîïçæœ]/gi, ' ').trim()
  if (CACHE[clean]) return CACHE[clean]
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'RoundIT/1.0' } })
    const data = await res.json()
    if (data?.[0]) {
      const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
      CACHE[clean] = result
      return result
    }
  } catch (e) {
    console.error('Geocode error:', address, e)
  }
  return null
}

export async function geocodeAll(stops) {
  const results = []
  for (let i = 0; i < stops.length; i++) {
    const coords = await geocode(stops[i].address)
    results.push({ ...stops[i], ...(coords || {}), geocodeError: !coords })
    if (i < stops.length - 1) await new Promise(r => setTimeout(r, 1100))
  }
  return results
}
