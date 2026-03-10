// ─── Helpers ───────────────────────────────────────────────────────

export function haversine(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
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

// ─── 2-opt : inverse un segment pour réduire la distance ──────────

function routeDistance(depot, stops) {
  let dist = 0
  let prev = depot
  for (const s of stops) {
    dist += haversine(prev, s)
    prev = s
  }
  dist += haversine(prev, depot)
  return dist
}

function twoOpt(depot, stops, maxIterations = 100) {
  if (stops.length < 3) return stops
  let best = [...stops]
  let bestDist = routeDistance(depot, best)
  let improved = true
  let iterations = 0

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        // Reverse segment [i, j]
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        const candidateDist = routeDistance(depot, candidate)
        if (candidateDist < bestDist - 0.01) {
          best = candidate
          bestDist = candidateDist
          improved = true
        }
      }
    }
  }
  return best
}

// ─── Cheapest insertion : trouve la meilleure position d'un stop ──

function cheapestInsertionIndex(depot, route, stop) {
  let bestCost = Infinity
  let bestIdx = 0

  for (let i = 0; i <= route.length; i++) {
    const prev = i === 0 ? depot : route[i - 1]
    const next = i === route.length ? depot : route[i]
    // Coût d'insertion = nouveau trajet - ancien trajet direct
    const cost =
      haversine(prev, stop) +
      haversine(stop, next) -
      haversine(prev, next)
    if (cost < bestCost) {
      bestCost = cost
      bestIdx = i
    }
  }
  return bestIdx
}

// ─── Vérifie si une tournée respecte la fenêtre horaire ───────────

function isFeasible(depot, route, startMin, endMin) {
  let time = startMin
  let prev = depot
  for (const stop of route) {
    time += travelTime(prev, stop)
    time += stop.serviceTime || 15
    prev = stop
  }
  time += travelTime(prev, depot)
  return time <= endMin
}

// ─── Calcul des stats d'une tournée ──────────────────────────────

function computeRouteStats(depot, route, startMin) {
  let time = startMin
  let totalDist = 0
  let prev = depot
  const detailed = []

  for (const stop of route) {
    const travel = travelTime(prev, stop)
    const arrival = time + travel
    const serviceTime = stop.serviceTime || 15
    detailed.push({
      ...stop,
      arrivalTime: formatTime(arrival),
      departureTime: formatTime(arrival + serviceTime),
    })
    totalDist += haversine(prev, stop)
    time = arrival + serviceTime
    prev = stop
  }

  const returnDist = haversine(prev, depot)
  const returnTravel = travelTime(prev, depot)

  return {
    stops: detailed,
    totalDistance: Math.round((totalDist + returnDist) * 10) / 10,
    totalDuration: Math.round(time - startMin + returnTravel),
    returnTime: formatTime(time + returnTravel),
  }
}

// ─── Rééquilibrage inter-camions ──────────────────────────────────
// Essaie de déplacer un stop d'un camion chargé vers un camion léger

function rebalanceTrucks(depot, truckRoutes, startMin, endMin) {
  let improved = true
  let iterations = 0

  while (improved && iterations < 50) {
    improved = false
    iterations++

    for (let a = 0; a < truckRoutes.length; a++) {
      for (let b = 0; b < truckRoutes.length; b++) {
        if (a === b) continue

        const distA = routeDistance(depot, truckRoutes[a])
        const distB = routeDistance(depot, truckRoutes[b])

        // Essaie de déplacer chaque stop de A vers B
        for (let i = 0; i < truckRoutes[a].length; i++) {
          const stop = truckRoutes[a][i]
          const routeAWithout = [
            ...truckRoutes[a].slice(0, i),
            ...truckRoutes[a].slice(i + 1),
          ]

          const insertIdx = cheapestInsertionIndex(depot, truckRoutes[b], stop)
          const routeBWith = [
            ...truckRoutes[b].slice(0, insertIdx),
            stop,
            ...truckRoutes[b].slice(insertIdx),
          ]

          // Vérifie faisabilité
          if (!isFeasible(depot, routeBWith, startMin, endMin)) continue

          const newDistA = routeDistance(depot, routeAWithout)
          const newDistB = routeDistance(depot, routeBWith)

          // Accepte si la distance totale diminue
          if (newDistA + newDistB < distA + distB - 0.01) {
            truckRoutes[a] = routeAWithout
            truckRoutes[b] = routeBWith
            improved = true
            break
          }
        }
        if (improved) break
      }
      if (improved) break
    }
  }

  return truckRoutes
}

// ─── Solver principal ─────────────────────────────────────────────

export function solveMultiDayVRP(depot, stops, numTrucks, numDays, startMin, endMin) {
  if (!stops.length) return []

  const days = []
  const remaining = [...stops]

  for (let d = 0; d < numDays && remaining.length > 0; d++) {
    // Phase 1 : Construction par cheapest insertion
    const truckRoutes = Array.from({ length: numTrucks }, () => [])
    const truckTimes = new Array(numTrucks).fill(startMin)

    // Seed : assigner le stop le plus éloigné du dépôt à chaque camion
    const sorted = remaining
      .map((s, i) => ({ idx: i, dist: haversine(depot, s) }))
      .sort((a, b) => b.dist - a.dist)

    for (let t = 0; t < numTrucks && sorted.length > 0; t++) {
      const seed = sorted.shift()
      if (!seed) break
      const stop = remaining[seed.idx]
      const travel = travelTime(depot, stop)
      const serviceTime = stop.serviceTime || 15
      const returnTravel = travelTime(stop, depot)

      if (startMin + travel + serviceTime + returnTravel <= endMin) {
        truckRoutes[t].push(stop)
        truckTimes[t] = startMin + travel + serviceTime
        remaining.splice(
          remaining.findIndex(s => s === stop),
          1
        )
      }
    }

    // Insertion des stops restants par cheapest insertion
    let assigned = true
    while (assigned && remaining.length > 0) {
      assigned = false

      // Pour chaque stop restant, trouve le meilleur (camion, position)
      let bestGlobalCost = Infinity
      let bestTruck = -1
      let bestInsertIdx = -1
      let bestStopIdx = -1

      for (let s = 0; s < remaining.length; s++) {
        const stop = remaining[s]

        for (let t = 0; t < numTrucks; t++) {
          const insertIdx = cheapestInsertionIndex(depot, truckRoutes[t], stop)
          const candidateRoute = [
            ...truckRoutes[t].slice(0, insertIdx),
            stop,
            ...truckRoutes[t].slice(insertIdx),
          ]

          // Vérifie contrainte horaire
          if (!isFeasible(depot, candidateRoute, startMin, endMin)) continue

          // Coût d'insertion
          const prev = insertIdx === 0 ? depot : truckRoutes[t][insertIdx - 1]
          const next =
            insertIdx === truckRoutes[t].length
              ? depot
              : truckRoutes[t][insertIdx]
          const cost =
            haversine(prev, stop) +
            haversine(stop, next) -
            haversine(prev, next)

          if (cost < bestGlobalCost) {
            bestGlobalCost = cost
            bestTruck = t
            bestInsertIdx = insertIdx
            bestStopIdx = s
          }
        }
      }

      if (bestStopIdx >= 0) {
        const stop = remaining.splice(bestStopIdx, 1)[0]
        truckRoutes[bestTruck].splice(bestInsertIdx, 0, stop)
        assigned = true
      }
    }

    // Phase 2 : 2-opt sur chaque tournée
    for (let t = 0; t < numTrucks; t++) {
      if (truckRoutes[t].length >= 3) {
        truckRoutes[t] = twoOpt(depot, truckRoutes[t])
      }
    }

    // Phase 3 : Rééquilibrage inter-camions
    const activeRoutes = truckRoutes.filter(r => r.length > 0)
    if (activeRoutes.length > 1) {
      rebalanceTrucks(depot, truckRoutes, startMin, endMin)

      // Re-2-opt après rééquilibrage
      for (let t = 0; t < numTrucks; t++) {
        if (truckRoutes[t].length >= 3) {
          truckRoutes[t] = twoOpt(depot, truckRoutes[t])
        }
      }
    }

    // Phase 4 : Construire le résultat du jour
    const dayTrucks = truckRoutes
      .map((route, idx) => {
        if (route.length === 0) return null
        const stats = computeRouteStats(depot, route, startMin)
        return {
          truckId: idx + 1,
          ...stats,
        }
      })
      .filter(Boolean)

    if (dayTrucks.length > 0) {
      days.push({ day: d + 1, trucks: dayTrucks })
    }
  }

  return days
}
