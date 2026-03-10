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

// ─── Service time auto-calculé depuis volume ──────────────────────
// Base 5 min + 2 min/colis + 5 min/m³
// Le champ serviceTimeManual override le calcul auto

const DEFAULT_BASE_MIN = 5
const MIN_PER_PARCEL = 2
const MIN_PER_M3 = 5

export function computeServiceTime(stop) {
  if (stop.serviceTimeManual != null) return stop.serviceTimeManual

  const base = DEFAULT_BASE_MIN
  const parcelTime = (stop.parcels || 0) * MIN_PER_PARCEL
  const volumeTime = (stop.volumeM3 || 0) * MIN_PER_M3
  const computed = base + parcelTime + volumeTime

  return Math.max(computed, DEFAULT_BASE_MIN)
}

// ─── Priorité : poids pour le tri ─────────────────────────────────

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 }

function priorityOf(stop) {
  return PRIORITY_WEIGHT[stop.priority] ?? PRIORITY_WEIGHT.medium
}

function sortByPriority(stops) {
  return [...stops].sort((a, b) => priorityOf(a) - priorityOf(b))
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

// ─── Cheapest insertion ───────────────────────────────────────────

function cheapestInsertionIndex(depot, route, stop) {
  let bestCost = Infinity
  let bestIdx = 0

  for (let i = 0; i <= route.length; i++) {
    const prev = i === 0 ? depot : route[i - 1]
    const next = i === route.length ? depot : route[i]
    const cost =
      haversine(prev, stop) + haversine(stop, next) - haversine(prev, next)
    if (cost < bestCost) {
      bestCost = cost
      bestIdx = i
    }
  }
  return bestIdx
}

// ─── Faisabilité : horaire + capacité ─────────────────────────────

function routeLoad(route) {
  let parcels = 0
  let volumeM3 = 0
  for (const stop of route) {
    parcels += stop.parcels || 0
    volumeM3 += stop.volumeM3 || 0
  }
  return { parcels, volumeM3 }
}

function isFeasible(depot, route, startMin, endMin, truckCapacity) {
  // Contrainte horaire
  let time = startMin
  let prev = depot
  for (const stop of route) {
    time += travelTime(prev, stop)
    time += computeServiceTime(stop)
    prev = stop
  }
  time += travelTime(prev, depot)
  if (time > endMin) return false

  // Contrainte capacité
  if (truckCapacity) {
    const load = routeLoad(route)
    if (
      truckCapacity.maxParcels != null &&
      load.parcels > truckCapacity.maxParcels
    )
      return false
    if (
      truckCapacity.maxVolumeM3 != null &&
      load.volumeM3 > truckCapacity.maxVolumeM3
    )
      return false
  }

  return true
}

// ─── Stats d'une tournée ──────────────────────────────────────────

function computeRouteStats(depot, route, startMin) {
  let time = startMin
  let totalDist = 0
  let prev = depot
  let totalParcels = 0
  let totalVolumeM3 = 0
  const detailed = []

  for (const stop of route) {
    const travel = travelTime(prev, stop)
    const arrival = time + travel
    const serviceTime = computeServiceTime(stop)
    detailed.push({
      ...stop,
      serviceTime,
      arrivalTime: formatTime(arrival),
      departureTime: formatTime(arrival + serviceTime),
    })
    totalDist += haversine(prev, stop)
    time = arrival + serviceTime
    prev = stop
    totalParcels += stop.parcels || 0
    totalVolumeM3 += stop.volumeM3 || 0
  }

  const returnDist = haversine(prev, depot)
  const returnTravel = travelTime(prev, depot)

  return {
    stops: detailed,
    totalDistance: Math.round((totalDist + returnDist) * 10) / 10,
    totalDuration: Math.round(time - startMin + returnTravel),
    returnTime: formatTime(time + returnTravel),
    totalParcels,
    totalVolumeM3: Math.round(totalVolumeM3 * 100) / 100,
  }
}

// ─── Rééquilibrage inter-camions ──────────────────────────────────

function rebalanceTrucks(depot, truckRoutes, startMin, endMin, truckCapacity) {
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

        for (let i = 0; i < truckRoutes[a].length; i++) {
          const stop = truckRoutes[a][i]
          const routeAWithout = [
            ...truckRoutes[a].slice(0, i),
            ...truckRoutes[a].slice(i + 1),
          ]

          const insertIdx = cheapestInsertionIndex(
            depot,
            truckRoutes[b],
            stop
          )
          const routeBWith = [
            ...truckRoutes[b].slice(0, insertIdx),
            stop,
            ...truckRoutes[b].slice(insertIdx),
          ]

          if (!isFeasible(depot, routeBWith, startMin, endMin, truckCapacity))
            continue

          const newDistA = routeDistance(depot, routeAWithout)
          const newDistB = routeDistance(depot, routeBWith)

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
//
// Chaque stop peut avoir :
//   parcels          : nombre de colis (int)
//   volumeM3         : volume en m³ (float)
//   priority         : 'high' | 'medium' | 'low'
//   serviceTimeManual: override manuel en minutes (optionnel)
//
// truckCapacity (optionnel) :
//   { maxParcels: number, maxVolumeM3: number }

export function solveMultiDayVRP(
  depot,
  stops,
  numTrucks,
  numDays,
  startMin,
  endMin,
  truckCapacity = null
) {
  if (!stops.length) return []

  const days = []
  const remaining = sortByPriority(stops)

  for (let d = 0; d < numDays && remaining.length > 0; d++) {
    const truckRoutes = Array.from({ length: numTrucks }, () => [])

    // Phase 1 : Seed — un stop éloigné par camion
    const sorted = remaining
      .map((s, i) => ({ idx: i, dist: haversine(depot, s) }))
      .sort((a, b) => b.dist - a.dist)

    for (let t = 0; t < numTrucks && sorted.length > 0; t++) {
      const seed = sorted.shift()
      if (!seed) break
      const stop = remaining[seed.idx]
      const candidateRoute = [stop]

      if (isFeasible(depot, candidateRoute, startMin, endMin, truckCapacity)) {
        truckRoutes[t].push(stop)
        remaining.splice(
          remaining.findIndex((s) => s === stop),
          1
        )
        sorted.forEach((item) => {
          if (item.idx > seed.idx) item.idx--
        })
      }
    }

    // Phase 2 : Cheapest insertion (priorité haute favorisée)
    let assigned = true
    while (assigned && remaining.length > 0) {
      assigned = false

      let bestGlobalCost = Infinity
      let bestTruck = -1
      let bestInsertIdx = -1
      let bestStopIdx = -1

      for (let s = 0; s < remaining.length; s++) {
        const stop = remaining[s]

        for (let t = 0; t < numTrucks; t++) {
          const insertIdx = cheapestInsertionIndex(
            depot,
            truckRoutes[t],
            stop
          )
          const candidateRoute = [
            ...truckRoutes[t].slice(0, insertIdx),
            stop,
            ...truckRoutes[t].slice(insertIdx),
          ]

          if (
            !isFeasible(depot, candidateRoute, startMin, endMin, truckCapacity)
          )
            continue

          const prev =
            insertIdx === 0 ? depot : truckRoutes[t][insertIdx - 1]
          const next =
            insertIdx === truckRoutes[t].length
              ? depot
              : truckRoutes[t][insertIdx]
          const insertionCost =
            haversine(prev, stop) +
            haversine(stop, next) -
            haversine(prev, next)

          // Bonus priorité : high = 0, medium = +10km, low = +20km de pénalité
          const priorityBonus = priorityOf(stop) * 10
          const cost = insertionCost + priorityBonus

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

    // Phase 3 : 2-opt
    for (let t = 0; t < numTrucks; t++) {
      if (truckRoutes[t].length >= 3) {
        truckRoutes[t] = twoOpt(depot, truckRoutes[t])
      }
    }

    // Phase 4 : Rééquilibrage inter-camions
    const activeCount = truckRoutes.filter((r) => r.length > 0).length
    if (activeCount > 1) {
      rebalanceTrucks(depot, truckRoutes, startMin, endMin, truckCapacity)

      for (let t = 0; t < numTrucks; t++) {
        if (truckRoutes[t].length >= 3) {
          truckRoutes[t] = twoOpt(depot, truckRoutes[t])
        }
      }
    }

    // Phase 5 : Résultats du jour
    const dayTrucks = truckRoutes
      .map((route, idx) => {
        if (route.length === 0) return null
        const stats = computeRouteStats(depot, route, startMin)
        return { truckId: idx + 1, ...stats }
      })
      .filter(Boolean)

    if (dayTrucks.length > 0) {
      days.push({ day: d + 1, trucks: dayTrucks })
    }
  }

  return days
}
