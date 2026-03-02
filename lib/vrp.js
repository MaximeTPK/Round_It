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
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function solveMultiDayVRP(depot, stops, numTrucks, numDays, startMin, endMin) {
  if (!stops.length) return []
  const days = []
  const remaining = [...stops]

  for (let d = 0; d < numDays && remaining.length > 0; d++) {
    const trucks = Array.from({ length: numTrucks }, (_, i) => ({
      truckId: i + 1,
      stops: [],
      currentPos: depot,
      currentTime: startMin,
      totalDistance: 0,
      totalDuration: 0,
    }))

    let assigned = true
    while (assigned && remaining.length > 0) {
      assigned = false
      for (const truck of trucks) {
        if (remaining.length === 0) break
        let bestIdx = -1
        let bestDist = Infinity
        for (let i = 0; i < remaining.length; i++) {
          const travel = travelTime(truck.currentPos, remaining[i])
          const serviceTime = remaining[i].serviceTime || 15
          const returnTravel = travelTime(remaining[i], depot)
          const totalTime = truck.currentTime + travel + serviceTime + returnTravel
          if (totalTime <= endMin && haversine(truck.currentPos, remaining[i]) < bestDist) {
            bestDist = haversine(truck.currentPos, remaining[i])
            bestIdx = i
          }
        }
        if (bestIdx >= 0) {
          const stop = remaining.splice(bestIdx, 1)[0]
          const travel = travelTime(truck.currentPos, stop)
          const arrival = truck.currentTime + travel
          const serviceTime = stop.serviceTime || 15
          truck.stops.push({
            ...stop,
            arrivalTime: formatTime(arrival),
            departureTime: formatTime(arrival + serviceTime),
          })
          truck.totalDistance += haversine(truck.currentPos, stop)
          truck.totalDuration += travel + serviceTime
          truck.currentTime = arrival + serviceTime
          truck.currentPos = stop
          assigned = true
        }
      }
    }

    const dayTrucks = trucks
      .filter(t => t.stops.length > 0)
      .map(t => {
        const returnDist = haversine(t.currentPos, depot)
        const returnTravel = travelTime(t.currentPos, depot)
        return {
          truckId: t.truckId,
          stops: t.stops,
          totalDistance: Math.round((t.totalDistance + returnDist) * 10) / 10,
          totalDuration: Math.round(t.totalDuration + returnTravel),
          returnTime: formatTime(t.currentTime + returnTravel),
        }
      })

    if (dayTrucks.length > 0) {
      days.push({ day: d + 1, trucks: dayTrucks })
    }
  }

  return days
}
