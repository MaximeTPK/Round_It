/**
 * RoundIT Solver — Autonomous VRP Microservice
 * 
 * Pure input/output: receives JSON, returns JSON.
 * Zero dependency on app internals (no Supabase, no React, no Next.js).
 * Designed to be extractable into a standalone repo.
 * 
 * USAGE:
 *   const result = await solve(input)
 * 
 * INPUT CONTRACT:
 *   {
 *     depot: { lat, lon, address },
 *     stops: [{ id, lat, lon, address, type, owner_name, orders, orderVolumes,
 *               parcels, volumeM3, priority, timeFrom, timeTo, timeStrict }],
 *     config: {
 *       numTrucks, numDays, startMin, endMin,
 *       truckCapacity: { maxParcels, maxVolumeM3 } | null,
 *       googleApiKey: string | null,      // if null, falls back to haversine
 *       speedKmh: number (default 35),     // used only in haversine fallback
 *     }
 *   }
 * 
 * OUTPUT CONTRACT:
 *   {
 *     days: [{ day, trucks: [{ truckId, stops, totalDistance, totalDuration,
 *              totalWait, returnTime, totalParcels, totalVolumeM3 }] }],
 *     unassigned: [{ stop, reason }],
 *     warnings: [{ type, stopId, message }],
 *     stats: { totalKm, totalDuration, totalStops, totalWait, trucksUsed }
 *   }
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: DISTANCE MATRIX
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch real driving distances/durations from Google Distance Matrix API.
 * Returns a 2D matrix: matrix[i][j] = { distanceKm, durationMin }
 * Points array = [depot, ...stops] (depot is index 0)
 */
async function fetchGoogleDistanceMatrix(points, apiKey) {
  // Google Distance Matrix API limits: max 25 origins × 25 destinations per request
  // For larger sets, we batch
  const n = points.length
  const matrix = Array.from({ length: n }, () => Array(n).fill(null))

  // Fill diagonal with zeros
  for (let i = 0; i < n; i++) {
    matrix[i][i] = { distanceKm: 0, durationMin: 0 }
  }

  const BATCH_SIZE = 25
  const origins = points.map(p => `${p.lat},${p.lon}`)

  for (let oi = 0; oi < n; oi += BATCH_SIZE) {
    const originSlice = origins.slice(oi, Math.min(oi + BATCH_SIZE, n))
    for (let di = 0; di < n; di += BATCH_SIZE) {
      const destSlice = origins.slice(di, Math.min(di + BATCH_SIZE, n))

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${originSlice.join('|')}` +
        `&destinations=${destSlice.join('|')}` +
        `&mode=driving&language=en&key=${apiKey}`

      try {
        const res = await fetch(url)
        const data = await res.json()

        if (data.status !== 'OK') {
          console.error('Google Distance Matrix error:', data.status, data.error_message)
          return null // Fallback to haversine
        }

        for (let r = 0; r < data.rows.length; r++) {
          for (let c = 0; c < data.rows[r].elements.length; c++) {
            const el = data.rows[r].elements[c]
            const origIdx = oi + r
            const destIdx = di + c
            if (el.status === 'OK') {
              matrix[origIdx][destIdx] = {
                distanceKm: Math.round((el.distance.value / 1000) * 10) / 10,
                durationMin: Math.round(el.duration.value / 60 * 10) / 10,
              }
            } else {
              matrix[origIdx][destIdx] = { distanceKm: Infinity, durationMin: Infinity }
            }
          }
        }
      } catch (err) {
        console.error('Google Distance Matrix fetch error:', err)
        return null // Fallback to haversine
      }

      // Rate limit: small delay between batches
      if (di + BATCH_SIZE < n) await sleep(100)
    }
    if (oi + BATCH_SIZE < n) await sleep(100)
  }

  return matrix
}

/**
 * Build haversine-based distance matrix (fallback if no Google API key)
 */
function buildHaversineMatrix(points, speedKmh) {
  const n = points.length
  const matrix = Array.from({ length: n }, () => Array(n).fill(null))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = { distanceKm: 0, durationMin: 0 }
      } else {
        const d = haversine(points[i], points[j])
        matrix[i][j] = {
          distanceKm: Math.round(d * 10) / 10,
          durationMin: Math.round((d / speedKmh) * 60 * 10) / 10,
        }
      }
    }
  }

  return matrix
}

function haversine(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = (((b.lon || b.lng) - (a.lon || a.lng)) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: SERVICE TIME & CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

const BASE_SERVICE_MIN = 15

function orderTimeByVolume(vol) {
  if (vol <= 0.1) return 3
  if (vol <= 0.2) return 7
  if (vol <= 1) return 10
  return 15
}

function computeServiceTime(stop) {
  if (stop.serviceTimeManual != null) return stop.serviceTimeManual
  const volumes = stop.orderVolumes || []
  if (volumes.length === 0) return BASE_SERVICE_MIN
  let total = BASE_SERVICE_MIN
  for (let i = 1; i < volumes.length; i++) {
    total += orderTimeByVolume(volumes[i])
  }
  return Math.max(total, BASE_SERVICE_MIN)
}

function needsTwoDrivers(stop) {
  return (stop.orderVolumes || []).some(v => v >= 1.5)
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: PRIORITY ALGEBRA
// ═══════════════════════════════════════════════════════════════════

/**
 * Priority scoring system (lower = better):
 * 
 * HIERARCHY (strict ordering, never violated):
 *   1. Strict time window    → HARD CONSTRAINT (violate = reject stop)
 *   2. High priority         → weight -100 (strongly favored for insertion)
 *   3. Distance/efficiency   → actual travel cost in minutes
 *   4. Two drivers flag      → informational only (warning, no penalty)
 *   5. Soft time window      → penalty +2 per minute late
 * 
 * Insertion cost for a stop S at position P in truck T:
 *   cost(S, P, T) = travelCost(P, S) + priorityBonus(S) + windowPenalty(S, arrivalTime)
 */

const PRIORITY_BONUS = {
  high: -100,    // Strongly favored
  medium: 0,     // Neutral
  low: 50,       // Deprioritized
}

function priorityBonus(stop) {
  return PRIORITY_BONUS[stop.priority] ?? 0
}

/**
 * Calculate the penalty for arriving at a stop at a given time.
 * Returns { feasible, waitMin, lateMin, penalty }
 */
function timeWindowEval(stop, arrivalMin) {
  let waitMin = 0
  let lateMin = 0
  let penalty = 0
  let feasible = true
  let effectiveArrival = arrivalMin

  // Wait if arriving before window opens
  if (stop.timeFrom != null && arrivalMin < stop.timeFrom) {
    waitMin = stop.timeFrom - arrivalMin
    effectiveArrival = stop.timeFrom
  }

  // Late if arriving after window closes
  if (stop.timeTo != null && effectiveArrival > stop.timeTo) {
    lateMin = Math.round(effectiveArrival - stop.timeTo)

    if (stop.timeStrict) {
      // HARD CONSTRAINT: strict window violated → infeasible
      feasible = false
      penalty = Infinity
    } else {
      // SOFT CONSTRAINT: penalty proportional to lateness
      penalty = lateMin * 2
    }
  }

  return { feasible, waitMin, lateMin, penalty, effectiveArrival }
}

/**
 * Compute total insertion cost for inserting stop at position in a route.
 * Uses the distance matrix for real travel times.
 * 
 * @param {number} stopIdx - Index in points array
 * @param {number} insertPos - Position in route to insert
 * @param {number[]} route - Current route as array of point indices
 * @param {number} depotIdx - Depot index in points array (always 0)
 * @param {object[][]} matrix - Distance matrix
 * @param {number} startMin - Start time of day in minutes
 * @returns {{ cost, feasible, arrivalMin }}
 */
function insertionCost(stopIdx, insertPos, route, depotIdx, matrix, startMin, stops) {
  const stop = stops[stopIdx - 1] // stopIdx is 1-based (0 = depot)

  // Calculate arrival time at this stop if inserted at insertPos
  let time = startMin
  let prevIdx = depotIdx

  for (let i = 0; i < insertPos; i++) {
    const currIdx = route[i]
    const currStop = stops[currIdx - 1]
    time += matrix[prevIdx][currIdx].durationMin

    // Wait for time window
    if (currStop.timeFrom != null && time < currStop.timeFrom) {
      time = currStop.timeFrom
    }
    time += computeServiceTime(currStop)
    prevIdx = currIdx
  }

  // Travel to the new stop
  const travelToStop = matrix[prevIdx][stopIdx].durationMin
  const arrivalMin = time + travelToStop

  // Evaluate time window
  const twEval = timeWindowEval(stop, arrivalMin)
  if (!twEval.feasible) return { cost: Infinity, feasible: false, arrivalMin }

  // Distance cost: extra km added by this insertion
  const prevPoint = prevIdx
  const nextPoint = insertPos < route.length ? route[insertPos] : depotIdx
  const distAdded =
    matrix[prevPoint][stopIdx].distanceKm +
    matrix[stopIdx][nextPoint].distanceKm -
    matrix[prevPoint][nextPoint].distanceKm

  // Total cost = distance (in minutes equivalent) + priority bonus + window penalty
  const distCostMin = (distAdded / 35) * 60 // normalize km to approximate minutes
  const cost = distCostMin + priorityBonus(stop) + twEval.penalty

  return { cost, feasible: true, arrivalMin }
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: ROUTE FEASIBILITY CHECK
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a route is feasible (time + capacity constraints).
 */
function isRouteFeasible(route, depotIdx, matrix, startMin, endMin, stops, truckCapacity) {
  let time = startMin
  let prevIdx = depotIdx
  let totalParcels = 0
  let totalVolumeM3 = 0

  for (const idx of route) {
    const stop = stops[idx - 1]
    time += matrix[prevIdx][idx].durationMin

    // Wait for window
    if (stop.timeFrom != null && time < stop.timeFrom) {
      time = stop.timeFrom
    }

    // Strict window check
    if (stop.timeStrict && stop.timeTo != null && time > stop.timeTo) {
      return false
    }

    time += computeServiceTime(stop)
    prevIdx = idx

    totalParcels += stop.parcels || 0
    totalVolumeM3 += stop.volumeM3 || 0
  }

  // Return to depot
  time += matrix[prevIdx][depotIdx].durationMin
  if (time > endMin) return false

  // Capacity
  if (truckCapacity) {
    if (truckCapacity.maxParcels != null && totalParcels > truckCapacity.maxParcels) return false
    if (truckCapacity.maxVolumeM3 != null && totalVolumeM3 > truckCapacity.maxVolumeM3) return false
  }

  return true
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: 2-OPT IMPROVEMENT
// ═══════════════════════════════════════════════════════════════════

function routeDistanceFromMatrix(route, depotIdx, matrix) {
  let dist = 0
  let prev = depotIdx
  for (const idx of route) {
    dist += matrix[prev][idx].distanceKm
    prev = idx
  }
  dist += matrix[prev][depotIdx].distanceKm
  return dist
}

function twoOpt(route, depotIdx, matrix, startMin, endMin, stops, truckCapacity, maxIter = 100) {
  if (route.length < 3) return route
  let best = [...route]
  let bestDist = routeDistanceFromMatrix(best, depotIdx, matrix)
  let improved = true
  let iter = 0

  while (improved && iter < maxIter) {
    improved = false
    iter++
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        // Check feasibility of reversed segment
        if (!isRouteFeasible(candidate, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) continue
        const candidateDist = routeDistanceFromMatrix(candidate, depotIdx, matrix)
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

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: INTER-TRUCK REBALANCING
// ═══════════════════════════════════════════════════════════════════

function rebalanceTrucks(truckRoutes, depotIdx, matrix, startMin, endMin, stops, truckCapacity) {
  let improved = true
  let iter = 0

  while (improved && iter < 50) {
    improved = false
    iter++

    for (let a = 0; a < truckRoutes.length; a++) {
      for (let b = 0; b < truckRoutes.length; b++) {
        if (a === b) continue
        const distA = routeDistanceFromMatrix(truckRoutes[a], depotIdx, matrix)
        const distB = routeDistanceFromMatrix(truckRoutes[b], depotIdx, matrix)

        for (let i = 0; i < truckRoutes[a].length; i++) {
          const stopIdx = truckRoutes[a][i]
          const routeAWithout = [...truckRoutes[a].slice(0, i), ...truckRoutes[a].slice(i + 1)]

          // Find best insertion position in truck B
          let bestPos = 0
          let bestCost = Infinity
          for (let p = 0; p <= truckRoutes[b].length; p++) {
            const routeBWith = [...truckRoutes[b].slice(0, p), stopIdx, ...truckRoutes[b].slice(p)]
            if (!isRouteFeasible(routeBWith, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) continue
            const cost = routeDistanceFromMatrix(routeBWith, depotIdx, matrix)
            if (cost < bestCost) { bestCost = cost; bestPos = p }
          }

          const routeBWith = [...truckRoutes[b].slice(0, bestPos), stopIdx, ...truckRoutes[b].slice(bestPos)]
          if (!isRouteFeasible(routeBWith, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) continue

          const newDistA = routeDistanceFromMatrix(routeAWithout, depotIdx, matrix)
          const newDistB = routeDistanceFromMatrix(routeBWith, depotIdx, matrix)

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

// ═══════════════════════════════════════════════════════════════════
// SECTION 7: PRIORITY REORDERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Reorder stops within each truck: high priority first, then medium, then low.
 * Within each group, optimize by distance using 2-opt.
 */
function priorityReorder(route, depotIdx, matrix, startMin, endMin, stops, truckCapacity) {
  if (route.length < 2) return route

  const highStops = route.filter(idx => (stops[idx - 1].priority || 'medium') === 'high')
  const medStops = route.filter(idx => (stops[idx - 1].priority || 'medium') === 'medium')
  const lowStops = route.filter(idx => (stops[idx - 1].priority || 'medium') === 'low')

  const orderedHigh = highStops.length >= 3 ? twoOpt(highStops, depotIdx, matrix, startMin, endMin, stops, truckCapacity, 50) : highStops
  const orderedMed = medStops.length >= 3 ? twoOpt(medStops, depotIdx, matrix, startMin, endMin, stops, truckCapacity, 50) : medStops
  const orderedLow = lowStops.length >= 3 ? twoOpt(lowStops, depotIdx, matrix, startMin, endMin, stops, truckCapacity, 50) : lowStops

  const reordered = [...orderedHigh, ...orderedMed, ...orderedLow]

  if (isRouteFeasible(reordered, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) {
    return reordered
  }
  return route // Keep original if reorder breaks feasibility
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 8: ROUTE STATS COMPUTATION
// ═══════════════════════════════════════════════════════════════════

function computeRouteStats(route, depotIdx, matrix, startMin, stops) {
  let time = startMin
  let totalDist = 0
  let totalWait = 0
  let prevIdx = depotIdx
  let totalParcels = 0
  let totalVolumeM3 = 0
  const detailed = []

  for (const idx of route) {
    const stop = stops[idx - 1]
    const travel = matrix[prevIdx][idx]
    let arrival = time + travel.durationMin
    let waitTime = 0

    if (stop.timeFrom != null && arrival < stop.timeFrom) {
      waitTime = stop.timeFrom - arrival
      arrival = stop.timeFrom
    }

    const serviceTime = computeServiceTime(stop)
    const lateBy = (stop.timeTo != null && arrival > stop.timeTo) ? Math.round(arrival - stop.timeTo) : 0
    const twoDrivers = needsTwoDrivers(stop)

    detailed.push({
      ...stop,
      serviceTime,
      arrivalTime: formatTime(arrival),
      departureTime: formatTime(arrival + serviceTime),
      waitTime: Math.round(waitTime),
      lateBy,
      needsTwoDrivers: twoDrivers,
      travelFromPrev: Math.round(travel.durationMin),
      distFromPrev: travel.distanceKm,
    })

    totalDist += travel.distanceKm
    totalWait += waitTime
    time = arrival + serviceTime
    prevIdx = idx
    totalParcels += stop.parcels || 0
    totalVolumeM3 += stop.volumeM3 || 0
  }

  const returnTravel = matrix[prevIdx][depotIdx]
  totalDist += returnTravel.distanceKm

  return {
    stops: detailed,
    totalDistance: Math.round(totalDist * 10) / 10,
    totalDuration: Math.round(time - startMin + returnTravel.durationMin),
    totalWait: Math.round(totalWait),
    returnTime: formatTime(time + returnTravel.durationMin),
    totalParcels,
    totalVolumeM3: Math.round(totalVolumeM3 * 100) / 100,
  }
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 9: MAIN SOLVER
// ═══════════════════════════════════════════════════════════════════

/**
 * Main solver entry point.
 * Pure function: JSON in → JSON out.
 */
export async function solve(input) {
  const { depot, stops, config } = input
  const {
    numTrucks = 4,
    numDays = 1,
    startMin = 480,
    endMin = 1080,
    truckCapacity = null,
    googleApiKey = null,
    speedKmh = 35,
  } = config

  if (!stops || stops.length === 0) {
    return { days: [], unassigned: [], warnings: [], stats: emptyStats() }
  }

  // ─── Step 1: Build distance matrix ───
  const points = [depot, ...stops] // index 0 = depot, 1..n = stops
  const depotIdx = 0

  let matrix
  if (googleApiKey) {
    matrix = await fetchGoogleDistanceMatrix(points, googleApiKey)
    if (!matrix) {
      // Fallback to haversine if Google fails
      matrix = buildHaversineMatrix(points, speedKmh)
    }
  } else {
    matrix = buildHaversineMatrix(points, speedKmh)
  }

  // ─── Step 2: Sort stops by priority (high first) ───
  const sortedIndices = stops
    .map((_, i) => i + 1) // 1-based indices (0 = depot)
    .sort((a, b) => {
      const pa = priorityBonus(stops[a - 1])
      const pb = priorityBonus(stops[b - 1])
      return pa - pb // Lower bonus = higher priority
    })

  // ─── Step 3: Multi-day construction ───
  const days = []
  const remaining = [...sortedIndices]
  const unassigned = []
  const warnings = []

  for (let d = 0; d < numDays && remaining.length > 0; d++) {
    const truckRoutes = Array.from({ length: numTrucks }, () => [])

    // Phase A: Seed — assign farthest stop to each truck
    const sorted = remaining
      .map(idx => ({ idx, dist: matrix[depotIdx][idx].distanceKm }))
      .sort((a, b) => b.dist - a.dist)

    for (let t = 0; t < numTrucks && sorted.length > 0; t++) {
      const seed = sorted.shift()
      if (!seed) break
      const candidateRoute = [seed.idx]
      if (isRouteFeasible(candidateRoute, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) {
        truckRoutes[t].push(seed.idx)
        remaining.splice(remaining.indexOf(seed.idx), 1)
      }
    }

    // Phase B: Cheapest insertion with priority algebra
    let assigned = true
    while (assigned && remaining.length > 0) {
      assigned = false
      let bestCost = Infinity
      let bestTruck = -1
      let bestPos = -1
      let bestStopRemIdx = -1

      for (let s = 0; s < remaining.length; s++) {
        const stopIdx = remaining[s]

        for (let t = 0; t < numTrucks; t++) {
          for (let p = 0; p <= truckRoutes[t].length; p++) {
            const ic = insertionCost(stopIdx, p, truckRoutes[t], depotIdx, matrix, startMin, stops)
            if (!ic.feasible) continue

            // Verify full route feasibility
            const candidateRoute = [...truckRoutes[t].slice(0, p), stopIdx, ...truckRoutes[t].slice(p)]
            if (!isRouteFeasible(candidateRoute, depotIdx, matrix, startMin, endMin, stops, truckCapacity)) continue

            if (ic.cost < bestCost) {
              bestCost = ic.cost
              bestTruck = t
              bestPos = p
              bestStopRemIdx = s
            }
          }
        }
      }

      if (bestStopRemIdx >= 0) {
        const stopIdx = remaining.splice(bestStopRemIdx, 1)[0]
        truckRoutes[bestTruck].splice(bestPos, 0, stopIdx)
        assigned = true
      }
    }

    // Phase C: 2-opt improvement
    for (let t = 0; t < numTrucks; t++) {
      if (truckRoutes[t].length >= 3) {
        truckRoutes[t] = twoOpt(truckRoutes[t], depotIdx, matrix, startMin, endMin, stops, truckCapacity)
      }
    }

    // Phase D: Inter-truck rebalancing
    const activeCount = truckRoutes.filter(r => r.length > 0).length
    if (activeCount > 1) {
      rebalanceTrucks(truckRoutes, depotIdx, matrix, startMin, endMin, stops, truckCapacity)
      // Re-2-opt after rebalancing
      for (let t = 0; t < numTrucks; t++) {
        if (truckRoutes[t].length >= 3) {
          truckRoutes[t] = twoOpt(truckRoutes[t], depotIdx, matrix, startMin, endMin, stops, truckCapacity)
        }
      }
    }

    // Phase E: Priority reordering (high first in each truck)
    for (let t = 0; t < numTrucks; t++) {
      if (truckRoutes[t].length >= 2) {
        truckRoutes[t] = priorityReorder(truckRoutes[t], depotIdx, matrix, startMin, endMin, stops, truckCapacity)
      }
    }

    // Phase F: Compute stats & build output
    const dayTrucks = truckRoutes
      .map((route, idx) => {
        if (route.length === 0) return null
        const stats = computeRouteStats(route, depotIdx, matrix, startMin, stops)
        return { truckId: idx + 1, ...stats }
      })
      .filter(Boolean)

    if (dayTrucks.length > 0) {
      days.push({ day: d + 1, trucks: dayTrucks })
    }
  }

  // ─── Step 4: Collect unassigned stops ───
  for (const idx of remaining) {
    const stop = stops[idx - 1]
    let reason = 'No feasible position found'
    if (stop.timeStrict && stop.timeTo != null) {
      reason = `Strict time window ${formatTime(stop.timeFrom || 0)}-${formatTime(stop.timeTo)} cannot be met`
    }
    unassigned.push({ stop, reason })
  }

  // ─── Step 5: Generate warnings ───
  days.forEach(day => {
    day.trucks.forEach(truck => {
      truck.stops.forEach(s => {
        if (s.needsTwoDrivers) {
          warnings.push({
            type: 'TWO_DRIVERS',
            stopId: s.id || s.order_id,
            message: `${s.owner_name || s.address}: order ≥ 1.5m³ requires 2 drivers`,
          })
        }
        if (s.lateBy > 0) {
          warnings.push({
            type: 'LATE_ARRIVAL',
            stopId: s.id || s.order_id,
            message: `${s.owner_name || s.address}: arriving ${s.lateBy} min late (soft window)`,
          })
        }
        if (s.waitTime > 15) {
          warnings.push({
            type: 'LONG_WAIT',
            stopId: s.id || s.order_id,
            message: `${s.owner_name || s.address}: ${s.waitTime} min idle wait`,
          })
        }
      })
    })
  })

  // ─── Step 6: Compute global stats ───
  let totalKm = 0, totalDuration = 0, totalStops = 0, totalWait = 0, trucksUsed = 0
  days.forEach(day => {
    day.trucks.forEach(truck => {
      totalKm += truck.totalDistance
      totalDuration += truck.totalDuration
      totalStops += truck.stops.length
      totalWait += truck.totalWait
      trucksUsed++
    })
  })

  const stats = {
    totalKm: Math.round(totalKm * 10) / 10,
    totalDuration,
    totalStops,
    totalWait,
    trucksUsed,
    unassignedCount: unassigned.length,
    warningCount: warnings.length,
    matrixSource: googleApiKey ? 'google' : 'haversine',
  }

  return { days, unassigned, warnings, stats }
}

function emptyStats() {
  return { totalKm: 0, totalDuration: 0, totalStops: 0, totalWait: 0, trucksUsed: 0, unassignedCount: 0, warningCount: 0, matrixSource: 'none' }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 10: LEGACY EXPORTS (backward compatibility with vrp.js)
// ═══════════════════════════════════════════════════════════════════

export { haversine, formatTime, computeServiceTime, needsTwoDrivers }
export function travelTime(a, b, speedKmh = 35) {
  return (haversine(a, b) / speedKmh) * 60
}
export function checkNeedsTwoDrivers(stop) {
  return needsTwoDrivers(stop)
}
