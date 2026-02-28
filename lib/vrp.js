export function haversine(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function travelTime(a, b, speedKmh = 35) {
  return (haversine(a, b) / speedKmh) * 60
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function solveVRP(depot, stops, numTrucks, startTimeMin = 480) {
  const routes = Array.from({ length: numTrucks }, (_, i) => ({
    truckId: i + 1,
    stops: [],
    currentPos: depot,
    currentTime: startTimeMin,
    totalDistance: 0,
    totalDuration: 0,
  }))

  const remaining = [...stops]

  while (remaining.length > 0) {
    let assigned = false
    for (const route of routes) {
      if (remaining.length === 0) break
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = haversine(route.currentPos, remaining[i])
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      if (bestIdx >= 0) {
        const stop = remaining.splice(bestIdx, 1)[0]
        const travel = travelTime(route.currentPos, stop)
        const arrivalTime = route.currentTime + travel
        const serviceTime = stop.serviceTime || 20
        route.stops.push({
          ...stop,
          arrivalTime: formatTime(arrivalTime),
          departureTime: formatTime(arrivalTime + serviceTime),
        })
        route.totalDistance += haversine(route.currentPos, stop)
        route.totalDuration += travel + serviceTime
        route.currentTime = arrivalTime + serviceTime
        route.currentPos = stop
        assigned = true
      }
    }
    if (!assigned) break
  }

  return routes
    .filter(r => r.stops.length > 0)
    .map(r => {
      const returnDist = haversine(r.currentPos, depot)
      const returnTime = travelTime(r.currentPos, depot)
      return {
        truckId: r.truckId,
        stops: twoOpt(r.stops, depot),
        totalDistance: Math.round((r.totalDistance + returnDist) * 10) / 10,
        totalDuration: Math.round(r.totalDuration + returnTime),
        returnTime: formatTime(r.currentTime + returnTime),
      }
    })
}

function twoOpt(stops, depot) {
  if (stops.length < 3) return stops
  let best = [...stops]
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        if (routeDist(newRoute, depot) < routeDist(best, depot)) {
          best = newRoute
          improved = true
        }
      }
    }
  }
  return best
}

function routeDist(stops, depot) {
  let d = haversine(depot, stops[0])
  for (let i = 0; i < stops.length - 1; i++) d += haversine(stops[i], stops[i + 1])
  d += haversine(stops[stops.length - 1], depot)
  return d
}
