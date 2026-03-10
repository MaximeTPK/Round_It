import { useState, useRef, useEffect } from 'react'

// ─── Analyse complète de la tournée ──────────────────────────────

function deepAnalyze(allJobs, plan, lang) {
  const fr = lang === 'fr'
  const pending = allJobs.filter(j => j.status === 'pending')
  const todo = allJobs.filter(j => j.status === 'todo')
  const done = allJobs.filter(j => j.status === 'done')
  const ecarte = allJobs.filter(j => j.status === 'ecarte')
  const highPrio = allJobs.filter(j => j.priority === 'high')
  const lowPrio = allJobs.filter(j => j.priority === 'low')
  const withWindow = allJobs.filter(j => j.timeFrom != null || j.timeTo != null)
  const strictJobs = allJobs.filter(j => j.timeStrict)
  const flexJobs = withWindow.filter(j => !j.timeStrict)
  const twoDriverJobs = allJobs.filter(j => j.orderVolumes && j.orderVolumes.some(v => v >= 1.5))
  const totalParcels = allJobs.reduce((s, j) => s + (j.parcels || 0), 0)
  const totalVolume = allJobs.reduce((s, j) => s + (j.volumeM3 || 0), 0)
  const pickingJobs = allJobs.filter(j => j.type === 'picking')
  const deliveryJobs = allJobs.filter(j => j.type === 'delivery')

  let totalKm = 0, totalStops = 0, totalDuration = 0, totalWait = 0
  let trucks = [], lateStops = [], waitStops = [], twoDriverStops = []
  let longestServiceStop = null, maxServiceTime = 0

  if (plan) {
    plan.forEach(day => {
      day.trucks.forEach(truck => {
        totalKm += truck.totalDistance || 0
        totalDuration += truck.totalDuration || 0
        totalWait += truck.totalWait || 0
        totalStops += truck.stops.length
        trucks.push({ ...truck, dayNum: day.day })
        truck.stops.forEach(s => {
          if (s.lateBy > 0) lateStops.push({ ...s, truckId: truck.truckId, dayNum: day.day })
          if (s.waitTime > 0) waitStops.push({ ...s, truckId: truck.truckId, dayNum: day.day })
          if (s.needsTwoDrivers || (s.orderVolumes && s.orderVolumes.some(v => v >= 1.5))) {
            twoDriverStops.push({ ...s, truckId: truck.truckId, dayNum: day.day })
          }
          if ((s.serviceTime || 0) > maxServiceTime) {
            maxServiceTime = s.serviceTime || 0
            longestServiceStop = { ...s, truckId: truck.truckId }
          }
        })
      })
    })
  }

  const longestTruck = trucks.length > 0 ? trucks.reduce((a, b) => (a.totalDistance || 0) > (b.totalDistance || 0) ? a : b) : null
  const shortestTruck = trucks.length > 0 ? trucks.reduce((a, b) => (a.totalDistance || 0) < (b.totalDistance || 0) ? a : b) : null
  const busiestTruck = trucks.length > 0 ? trucks.reduce((a, b) => a.stops.length > b.stops.length ? a : b) : null
  const lightestTruck = trucks.length > 0 ? trucks.reduce((a, b) => a.stops.length < b.stops.length ? a : b) : null

  return {
    pending, todo, done, ecarte, highPrio, lowPrio, withWindow, strictJobs, flexJobs,
    twoDriverJobs, totalParcels, totalVolume: Math.round(totalVolume * 100) / 100,
    pickingJobs, deliveryJobs,
    totalKm: Math.round(totalKm * 10) / 10, totalStops, totalDuration, totalWait: Math.round(totalWait),
    trucks, lateStops, waitStops, twoDriverStops,
    longestTruck, shortestTruck, busiestTruck, lightestTruck,
    longestServiceStop, maxServiceTime,
    plan, allJobs,
  }
}

// ─── Moteur de réponses ──────────────────────────────────────────

function findAnswer(input, d, lang) {
  const fr = lang === 'fr'
  const q = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // ─── Briefing complet / Résumé global ───
  if (match(q, ['briefing', 'brief', 'resume', 'summary', 'overview', 'recap', 'global', 'tournee', 'route', 'explain', 'explique', 'raconte', 'detail', 'complet'])) {
    return generateFullBriefing(d, fr)
  }

  // ─── Alertes / Problèmes / Dangers ───
  if (match(q, ['alerte', 'alert', 'probleme', 'problem', 'danger', 'attention', 'warning', 'risque', 'risk', 'issue'])) {
    return generateAlerts(d, fr)
  }

  // ─── 2 drivers / Gros colis ───
  if (match(q, ['2 driver', 'deux driver', 'deux chauffeur', '2 chauffeur', 'lourd', 'heavy', 'gros', 'big', 'bras', '💪', 'costaud'])) {
    return generateTwoDriversReport(d, fr)
  }

  // ─── Retard / Fenêtres / RDV ───
  if (match(q, ['retard', 'late', 'fenetre', 'window', 'horaire', 'rdv', 'creneau', 'rendez', 'appointment', 'time'])) {
    return generateTimeReport(d, fr)
  }

  // ─── Attente ───
  if (match(q, ['attente', 'wait', 'attend', 'idle', 'mort'])) {
    return generateWaitReport(d, fr)
  }

  // ─── Camion spécifique ───
  const truckNum = q.match(/(?:camion|truck|véhicule|vehicle)\s*(\d+)/i) || q.match(/(\d+)\s*(?:camion|truck)/i)
  if (truckNum || match(q, ['camion', 'truck', 'vehicule', 'vehicle', 'plus de km', 'more km', 'longest', 'equilibre', 'balance', 'repartition'])) {
    const num = truckNum ? parseInt(truckNum[1]) : null
    return generateTruckReport(d, fr, num)
  }

  // ─── Priorité ───
  if (match(q, ['priorite', 'priority', 'haute', 'high', 'basse', 'low', 'premier', 'first', 'dernier', 'last'])) {
    return generatePriorityReport(d, fr)
  }

  // ─── Temps sur place / Service time / Durée ───
  if (match(q, ['temps', 'duree', 'duration', 'service', 'sur place', 'on site', 'minute', 'long', 'combien de temps'])) {
    return generateServiceTimeReport(d, fr)
  }

  // ─── Stats / Chiffres / KPI ───
  if (match(q, ['stat', 'chiffre', 'kpi', 'number', 'data', 'donnee', 'total', 'combien', 'how many', 'how much'])) {
    return generateStats(d, fr)
  }

  // ─── Picking / Ramasse ───
  if (match(q, ['picking', 'ramasse', 'ramassage', 'collecte', 'pickup', 'pick up'])) {
    return generateTypeReport(d, fr, 'picking')
  }

  // ─── Delivery / Livraison ───
  if (match(q, ['delivery', 'livraison', 'livrer', 'deliver'])) {
    return generateTypeReport(d, fr, 'delivery')
  }

  // ─── Pending / Sélection ───
  if (match(q, ['pending', 'attente', 'selectionner', 'select', 'todo', 'en attente'])) {
    return generatePendingReport(d, fr)
  }

  // ─── Import / CSV ───
  if (match(q, ['import', 'csv', 'fichier', 'file', 'ajouter', 'add', 'remplacer', 'replace', 'merge', 'colonne', 'column'])) {
    return generateImportHelp(fr)
  }

  // ─── Drag & drop ───
  if (match(q, ['drag', 'drop', 'glisser', 'deplacer', 'move', 'reorganiser', 'bouger'])) {
    return generateDragDropHelp(fr)
  }

  // ─── Capacité / Volume ───
  if (match(q, ['capacite', 'capacity', 'colis', 'parcel', 'volume', 'm3', 'max', 'plein', 'full'])) {
    return generateCapacityReport(d, fr)
  }

  // ─── Algorithme ───
  if (match(q, ['algo', 'algorithm', 'comment ca marche', 'how does it work', 'optimisation', 'optimization', '2-opt', 'methode', 'method', 'logique', 'logic'])) {
    return generateAlgoHelp(fr)
  }

  // ─── Jour spécifique ───
  const dayNum = q.match(/(?:jour|day)\s*(\d+)/i)
  if (dayNum) {
    return generateDayReport(d, fr, parseInt(dayNum[1]))
  }

  // ─── Suggestions / Tips ───
  if (match(q, ['conseil', 'tip', 'suggestion', 'ameliorer', 'improve', 'mieux', 'better', 'optimiser'])) {
    return generateSuggestions(d, fr)
  }

  // ─── Job spécifique par nom ───
  const jobMatch = findJobByName(q, d.allJobs)
  if (jobMatch) return generateJobReport(jobMatch, d, fr)

  // ─── Fallback ───
  return fr
    ? `🎈 Je suis It ! Voici ce que je peux vous dire :\n\n• "briefing" → résumé complet de la tournée\n• "alertes" → tous les problèmes détectés\n• "retards" → fenêtres horaires et RDV\n• "2 drivers" → stops nécessitant 2 chauffeurs\n• "camion 1" → détail d'un camion\n• "stats" → chiffres clés\n• "priorités" → analyse des priorités\n• "attentes" → temps morts\n• "suggestions" → conseils d'amélioration\n• Tapez un nom de client → ses détails\n• "comment importer" → aide CSV\n• "drag & drop" → aide manipulation`
    : `🎈 I'm It! Here's what I can tell you:\n\n• "briefing" → full route summary\n• "alerts" → all detected issues\n• "late" → time windows & appointments\n• "2 drivers" → stops needing 2 drivers\n• "truck 1" → truck details\n• "stats" → key figures\n• "priorities" → priority analysis\n• "waiting" → idle times\n• "suggestions" → improvement tips\n• Type a client name → their details\n• "how to import" → CSV help\n• "drag & drop" → manipulation help`
}

// ─── Générateurs de réponses ─────────────────────────────────────

function generateFullBriefing(d, fr) {
  if (d.trucks.length === 0) return fr
    ? `📋 Aucune tournée optimisée.\n\n1. Importez vos CSV (picking/delivery)\n2. Sélectionnez les jobs (Pending → Todo)\n3. Cliquez Optimiser`
    : `📋 No route optimized yet.\n\n1. Import your CSVs (picking/delivery)\n2. Select jobs (Pending → Todo)\n3. Click Optimize`

  let b = fr ? `📋 BRIEFING TOURNÉE\n${'─'.repeat(25)}\n\n` : `📋 ROUTE BRIEFING\n${'─'.repeat(25)}\n\n`

  // Vue d'ensemble
  b += fr
    ? `🗺 ${d.totalStops} stops sur ${d.trucks.length} camion(s), ${d.totalKm} km, ~${Math.round(d.totalDuration / 60)}h${d.totalDuration % 60}min\n\n`
    : `🗺 ${d.totalStops} stops across ${d.trucks.length} truck(s), ${d.totalKm} km, ~${Math.round(d.totalDuration / 60)}h${d.totalDuration % 60}min\n\n`

  // Par camion
  d.trucks.forEach(t => {
    const firstStop = t.stops[0]
    const lastStop = t.stops[t.stops.length - 1]
    b += fr
      ? `🚛 Camion ${t.truckId} — ${t.stops.length} stops, ${t.totalDistance} km, retour ${t.returnTime}\n`
      : `🚛 Truck ${t.truckId} — ${t.stops.length} stops, ${t.totalDistance} km, return ${t.returnTime}\n`
    if (firstStop) b += fr
      ? `   Premier : ${firstStop.arrivalTime} ${firstStop.owner_name || firstStop.address}\n`
      : `   First: ${firstStop.arrivalTime} ${firstStop.owner_name || firstStop.address}\n`
    if (lastStop && lastStop !== firstStop) b += fr
      ? `   Dernier : ${lastStop.arrivalTime} ${lastStop.owner_name || lastStop.address}\n`
      : `   Last: ${lastStop.arrivalTime} ${lastStop.owner_name || lastStop.address}\n`
    if (t.totalParcels > 0) b += `   📦 ${t.totalParcels} ${fr ? 'colis' : 'parcels'}, 📐 ${t.totalVolumeM3} m³\n`
    b += '\n'
  })

  // Alertes
  const alerts = []
  if (d.lateStops.length > 0) alerts.push(fr ? `⚠️ ${d.lateStops.length} retard(s)` : `⚠️ ${d.lateStops.length} late`)
  if (d.twoDriverStops.length > 0) alerts.push(fr ? `💪 ${d.twoDriverStops.length} stop(s) 2 chauffeurs` : `💪 ${d.twoDriverStops.length} stop(s) 2 drivers`)
  if (d.waitStops.length > 0) alerts.push(fr ? `⏸ ${d.totalWait} min d'attente totale` : `⏸ ${d.totalWait} min total wait`)
  if (d.strictJobs.length > 0) alerts.push(fr ? `🔒 ${d.strictJobs.length} RDV strict(s)` : `🔒 ${d.strictJobs.length} strict appointment(s)`)
  if (d.pending.length > 0) alerts.push(fr ? `📋 ${d.pending.length} job(s) encore en attente` : `📋 ${d.pending.length} job(s) still pending`)

  if (alerts.length > 0) {
    b += fr ? `⚡ POINTS D'ATTENTION :\n` : `⚡ ATTENTION:\n`
    alerts.forEach(a => { b += `  ${a}\n` })
  } else {
    b += fr ? `✅ Aucun problème détecté — tournée propre !` : `✅ No issues detected — clean route!`
  }

  return b
}

function generateAlerts(d, fr) {
  const alerts = []

  // Retards
  d.lateStops.forEach(s => {
    alerts.push(fr
      ? `⚠️ RETARD : ${s.owner_name || s.address} — arrivée +${s.lateBy} min après la fenêtre (camion ${s.truckId})`
      : `⚠️ LATE: ${s.owner_name || s.address} — arriving +${s.lateBy} min after window (truck ${s.truckId})`)
  })

  // 2 drivers
  d.twoDriverStops.forEach(s => {
    const bigOrder = (s.orderVolumes || []).find(v => v >= 1.5)
    alerts.push(fr
      ? `💪 2 CHAUFFEURS : ${s.owner_name || s.address} — order de ${bigOrder} m³ (camion ${s.truckId})`
      : `💪 2 DRIVERS: ${s.owner_name || s.address} — order of ${bigOrder} m³ (truck ${s.truckId})`)
  })

  // Strict RDV à surveiller
  d.strictJobs.filter(j => j.status === 'todo').forEach(j => {
    alerts.push(fr
      ? `🔒 RDV STRICT : ${j.owner_name || j.address} — ${fmtMin(j.timeFrom) || '?'}→${fmtMin(j.timeTo) || '?'} (pas de marge)`
      : `🔒 STRICT APPT: ${j.owner_name || j.address} — ${fmtMin(j.timeFrom) || '?'}→${fmtMin(j.timeTo) || '?'} (no margin)`)
  })

  // Attentes longues (>15min)
  d.waitStops.filter(s => s.waitTime > 15).forEach(s => {
    alerts.push(fr
      ? `⏸ ATTENTE LONGUE : ${s.owner_name || s.address} — ${s.waitTime} min d'attente (camion ${s.truckId})`
      : `⏸ LONG WAIT: ${s.owner_name || s.address} — ${s.waitTime} min waiting (truck ${s.truckId})`)
  })

  // Pending non sélectionnés
  if (d.pending.length > 0) {
    alerts.push(fr
      ? `📋 ${d.pending.length} job(s) en attente non sélectionnés pour la tournée`
      : `📋 ${d.pending.length} pending job(s) not selected for route`)
  }

  if (alerts.length === 0) return fr ? `✅ Aucune alerte — tout est en ordre !` : `✅ No alerts — everything looks good!`

  return (fr ? `🚨 ${alerts.length} ALERTE(S) DÉTECTÉE(S) :\n\n` : `🚨 ${alerts.length} ALERT(S) DETECTED:\n\n`) + alerts.join('\n\n')
}

function generateTwoDriversReport(d, fr) {
  if (d.twoDriverStops.length === 0 && d.twoDriverJobs.length === 0) return fr
    ? `✅ Aucun stop ne nécessite 2 chauffeurs. Le seuil est de 1.5 m³ par order individuelle.`
    : `✅ No stops need 2 drivers. Threshold is 1.5 m³ per individual order.`

  let msg = fr
    ? `💪 STOPS 2 CHAUFFEURS (order ≥ 1.5 m³) :\n\n`
    : `💪 2 DRIVER STOPS (order ≥ 1.5 m³):\n\n`

  const items = d.twoDriverStops.length > 0 ? d.twoDriverStops : d.twoDriverJobs
  items.forEach(s => {
    const bigOrders = (s.orderVolumes || []).filter(v => v >= 1.5)
    msg += `• ${s.owner_name || s.address}\n`
    bigOrders.forEach(v => {
      msg += fr ? `  → Order de ${v} m³ ⚠️💪\n` : `  → Order of ${v} m³ ⚠️💪\n`
    })
    if (s.truckId) msg += fr ? `  Camion ${s.truckId}, arrivée ${s.arrivalTime || '?'}\n` : `  Truck ${s.truckId}, arrival ${s.arrivalTime || '?'}\n`
    msg += '\n'
  })

  msg += fr
    ? `📌 Prévoyez un deuxième chauffeur ou un équipement de manutention pour ces stops.`
    : `📌 Plan for a second driver or handling equipment at these stops.`

  return msg
}

function generateTimeReport(d, fr) {
  let msg = fr ? `🕐 RAPPORT HORAIRES & RDV\n\n` : `🕐 TIME & APPOINTMENTS REPORT\n\n`

  if (d.strictJobs.length > 0) {
    msg += fr ? `🔒 ${d.strictJobs.length} RDV STRICT(S) :\n` : `🔒 ${d.strictJobs.length} STRICT APPOINTMENT(S):\n`
    d.strictJobs.forEach(j => {
      msg += `• ${j.owner_name || j.address} : ${fmtMin(j.timeFrom) || '?'}→${fmtMin(j.timeTo) || '?'}\n`
    })
    msg += '\n'
  }

  if (d.flexJobs.length > 0) {
    msg += fr ? `🕐 ${d.flexJobs.length} fenêtre(s) souple(s) :\n` : `🕐 ${d.flexJobs.length} flexible window(s):\n`
    d.flexJobs.forEach(j => {
      msg += `• ${j.owner_name || j.address} : ${fmtMin(j.timeFrom) || '?'}→${fmtMin(j.timeTo) || '?'}\n`
    })
    msg += '\n'
  }

  if (d.lateStops.length > 0) {
    msg += fr ? `⚠️ ${d.lateStops.length} RETARD(S) :\n` : `⚠️ ${d.lateStops.length} LATE ARRIVAL(S):\n`
    d.lateStops.forEach(s => {
      msg += fr
        ? `• ${s.owner_name || s.address} — retard +${s.lateBy} min (camion ${s.truckId})\n`
        : `• ${s.owner_name || s.address} — late +${s.lateBy} min (truck ${s.truckId})\n`
    })
    msg += fr ? `\n💡 Réorganisez les stops par drag & drop dans le Planning pour corriger.\n` : `\n💡 Reorganize stops via drag & drop in Planning to fix.\n`
  }

  if (d.lateStops.length === 0 && d.strictJobs.length === 0 && d.flexJobs.length === 0) {
    msg += fr ? `✅ Aucune contrainte horaire définie.` : `✅ No time constraints defined.`
  } else if (d.lateStops.length === 0) {
    msg += fr ? `✅ Tous les RDV sont respectés !` : `✅ All appointments are met!`
  }

  return msg
}

function generateWaitReport(d, fr) {
  if (d.waitStops.length === 0) return fr
    ? `✅ Aucun temps d'attente dans la tournée. Les camions arrivent toujours après l'ouverture des fenêtres.`
    : `✅ No waiting time in the route. Trucks always arrive after window opens.`

  let msg = fr ? `⏸ TEMPS D'ATTENTE (${d.totalWait} min au total) :\n\n` : `⏸ WAITING TIMES (${d.totalWait} min total):\n\n`
  d.waitStops.sort((a, b) => b.waitTime - a.waitTime).forEach(s => {
    msg += fr
      ? `• ${s.owner_name || s.address} — ${s.waitTime} min (camion ${s.truckId}, arrive à ${s.arrivalTime} mais fenêtre à ${fmtMin(s.timeFrom)})\n`
      : `• ${s.owner_name || s.address} — ${s.waitTime} min (truck ${s.truckId}, arrives ${s.arrivalTime} but window at ${fmtMin(s.timeFrom)})\n`
  })
  msg += fr
    ? `\n💡 L'attente est due à l'arrivée en avance. Vous pouvez réorganiser les stops pour mieux combler ces temps morts.`
    : `\n💡 Waiting is caused by early arrival. You can reorganize stops to fill these idle times.`
  return msg
}

function generateTruckReport(d, fr, num) {
  if (d.trucks.length === 0) return fr ? `Pas de tournée optimisée.` : `No route optimized.`

  if (num) {
    const truck = d.trucks.find(t => t.truckId === num)
    if (!truck) return fr ? `Camion ${num} introuvable.` : `Truck ${num} not found.`
    return generateSingleTruckReport(truck, d, fr)
  }

  // Comparaison de tous les camions
  let msg = fr ? `🚛 COMPARAISON DES CAMIONS :\n\n` : `🚛 TRUCK COMPARISON:\n\n`
  d.trucks.forEach(t => {
    const lates = d.lateStops.filter(s => s.truckId === t.truckId).length
    const waits = d.waitStops.filter(s => s.truckId === t.truckId).length
    const twoD = d.twoDriverStops.filter(s => s.truckId === t.truckId).length
    msg += fr
      ? `Camion ${t.truckId} : ${t.stops.length} stops, ${t.totalDistance} km, retour ${t.returnTime}`
      : `Truck ${t.truckId}: ${t.stops.length} stops, ${t.totalDistance} km, return ${t.returnTime}`
    if (t.totalParcels > 0) msg += ` | ${t.totalParcels}📦 ${t.totalVolumeM3}m³`
    if (lates > 0) msg += ` | ⚠️${lates}`
    if (waits > 0) msg += ` | ⏸${waits}`
    if (twoD > 0) msg += ` | 💪${twoD}`
    msg += '\n'
  })

  if (d.longestTruck && d.shortestTruck && d.longestTruck.truckId !== d.shortestTruck.truckId) {
    const diff = Math.round((d.longestTruck.totalDistance - d.shortestTruck.totalDistance) * 10) / 10
    msg += fr
      ? `\n📊 Écart max : ${diff} km entre camion ${d.longestTruck.truckId} et ${d.shortestTruck.truckId}. L'algo minimise la distance totale, pas l'écart entre camions.`
      : `\n📊 Max gap: ${diff} km between truck ${d.longestTruck.truckId} and ${d.shortestTruck.truckId}. Algorithm minimizes total distance, not gap between trucks.`
  }

  return msg
}

function generateSingleTruckReport(t, d, fr) {
  let msg = fr
    ? `🚛 CAMION ${t.truckId} — DÉTAIL\n\n${t.stops.length} stops, ${t.totalDistance} km, retour ${t.returnTime}\n`
    : `🚛 TRUCK ${t.truckId} — DETAIL\n\n${t.stops.length} stops, ${t.totalDistance} km, return ${t.returnTime}\n`
  if (t.totalParcels > 0) msg += `📦 ${t.totalParcels} ${fr ? 'colis' : 'parcels'}, 📐 ${t.totalVolumeM3} m³\n`
  msg += '\n'

  t.stops.forEach((s, i) => {
    msg += `${i + 1}. ${s.arrivalTime} — ${s.owner_name || s.address}`
    msg += ` (${s.type === 'picking' ? 'P' : 'D'}, ⏱${s.serviceTime || 0}min)`
    if (s.waitTime > 0) msg += ` ⏸${s.waitTime}min`
    if (s.lateBy > 0) msg += ` ⚠️+${s.lateBy}min`
    if (s.needsTwoDrivers) msg += ` 💪`
    if (s.timeFrom != null || s.timeTo != null) msg += ` [${s.timeStrict ? '🔒' : '🕐'}${fmtMin(s.timeFrom) || '?'}-${fmtMin(s.timeTo) || '?'}]`
    msg += '\n'
  })

  return msg
}

function generatePriorityReport(d, fr) {
  let msg = fr ? `⚡ ANALYSE DES PRIORITÉS :\n\n` : `⚡ PRIORITY ANALYSIS:\n\n`

  if (d.highPrio.length > 0) {
    msg += fr ? `▲ HAUTE (${d.highPrio.length}) — traités en premier :\n` : `▲ HIGH (${d.highPrio.length}) — processed first:\n`
    d.highPrio.forEach(j => { msg += `  • ${j.owner_name || j.address}\n` })
    msg += '\n'
  }

  const medPrio = d.allJobs.filter(j => !j.priority || j.priority === 'medium')
  if (medPrio.length > 0) msg += fr ? `● NORMALE (${medPrio.length})\n\n` : `● NORMAL (${medPrio.length})\n\n`

  if (d.lowPrio.length > 0) {
    msg += fr ? `▼ BASSE (${d.lowPrio.length}) — traités en dernier :\n` : `▼ LOW (${d.lowPrio.length}) — processed last:\n`
    d.lowPrio.forEach(j => { msg += `  • ${j.owner_name || j.address}\n` })
    msg += '\n'
  }

  msg += fr
    ? `💡 Les jobs haute priorité sont placés en début de tournée. Glissez-les entre les zones dans l'onglet Jobs.`
    : `💡 High priority jobs are placed at the start of each route. Drag them between zones in the Jobs tab.`

  return msg
}

function generateServiceTimeReport(d, fr) {
  let msg = fr ? `⏱ TEMPS SUR PLACE :\n\n` : `⏱ ON-SITE TIMES:\n\n`
  msg += fr
    ? `Calcul : 15 min (base) + par order supplémentaire :\n  0-0.1 m³ → +3 min\n  0.1-0.2 m³ → +7 min\n  0.2-1 m³ → +10 min\n  ≥1 m³ → +15 min\n\n`
    : `Calculation: 15 min (base) + per extra order:\n  0-0.1 m³ → +3 min\n  0.1-0.2 m³ → +7 min\n  0.2-1 m³ → +10 min\n  ≥1 m³ → +15 min\n\n`

  if (d.longestServiceStop) {
    msg += fr
      ? `⏱ Plus long : ${d.longestServiceStop.owner_name || d.longestServiceStop.address} — ${d.maxServiceTime} min (camion ${d.longestServiceStop.truckId})\n`
      : `⏱ Longest: ${d.longestServiceStop.owner_name || d.longestServiceStop.address} — ${d.maxServiceTime} min (truck ${d.longestServiceStop.truckId})\n`
  }

  return msg
}

function generateStats(d, fr) {
  return fr
    ? `📊 CHIFFRES CLÉS :\n\n` +
      `📍 ${d.allJobs.length} jobs total (${d.pickingJobs.length} picking, ${d.deliveryJobs.length} delivery)\n` +
      `📋 ${d.pending.length} en attente | ${d.todo.length} sélectionnés | ${d.done.length} faits | ${d.ecarte.length} écartés\n` +
      `📦 ${d.totalParcels} colis | 📐 ${d.totalVolume} m³\n` +
      `🚛 ${d.trucks.length} camion(s) | ${d.totalStops} stops planifiés\n` +
      `🗺 ${d.totalKm} km total | ~${Math.round(d.totalDuration / 60)}h${String(d.totalDuration % 60).padStart(2, '0')} de tournée\n` +
      `⏸ ${d.totalWait} min d'attente | ⚠️ ${d.lateStops.length} retard(s)\n` +
      `💪 ${d.twoDriverStops.length} stop(s) 2 chauffeurs | 🔒 ${d.strictJobs.length} RDV strict(s)\n` +
      `⚡ ${d.highPrio.length} haute priorité | ▼ ${d.lowPrio.length} basse priorité`
    : `📊 KEY FIGURES:\n\n` +
      `📍 ${d.allJobs.length} total jobs (${d.pickingJobs.length} picking, ${d.deliveryJobs.length} delivery)\n` +
      `📋 ${d.pending.length} pending | ${d.todo.length} selected | ${d.done.length} done | ${d.ecarte.length} skipped\n` +
      `📦 ${d.totalParcels} parcels | 📐 ${d.totalVolume} m³\n` +
      `🚛 ${d.trucks.length} truck(s) | ${d.totalStops} planned stops\n` +
      `🗺 ${d.totalKm} km total | ~${Math.round(d.totalDuration / 60)}h${String(d.totalDuration % 60).padStart(2, '0')} route time\n` +
      `⏸ ${d.totalWait} min waiting | ⚠️ ${d.lateStops.length} late\n` +
      `💪 ${d.twoDriverStops.length} 2-driver stop(s) | 🔒 ${d.strictJobs.length} strict appointment(s)\n` +
      `⚡ ${d.highPrio.length} high priority | ▼ ${d.lowPrio.length} low priority`
}

function generateTypeReport(d, fr, type) {
  const jobs = type === 'picking' ? d.pickingJobs : d.deliveryJobs
  const label = fr ? (type === 'picking' ? 'RAMASSES' : 'LIVRAISONS') : (type === 'picking' ? 'PICKUPS' : 'DELIVERIES')
  if (jobs.length === 0) return fr ? `Aucun ${label.toLowerCase()}.` : `No ${label.toLowerCase()}.`

  let msg = `📦 ${label} (${jobs.length}) :\n\n`
  jobs.slice(0, 10).forEach(j => {
    msg += `• ${j.owner_name || j.address}`
    if (j.parcels) msg += ` | ${j.parcels} ${fr ? 'colis' : 'parcels'}`
    if (j.volumeM3) msg += ` | ${j.volumeM3} m³`
    msg += ` | ${j.status}\n`
  })
  if (jobs.length > 10) msg += `... ${fr ? 'et' : 'and'} ${jobs.length - 10} ${fr ? 'autres' : 'more'}\n`
  return msg
}

function generatePendingReport(d, fr) {
  if (d.pending.length === 0) return fr
    ? `✅ Aucun job en attente — tous sont sélectionnés ou traités.`
    : `✅ No pending jobs — all are selected or processed.`

  let msg = fr
    ? `📋 ${d.pending.length} JOB(S) EN ATTENTE :\n\n`
    : `📋 ${d.pending.length} PENDING JOB(S):\n\n`
  d.pending.slice(0, 10).forEach(j => {
    msg += `• ${j.owner_name || j.address} (${j.type === 'picking' ? 'P' : 'D'})`
    if (j.parcels) msg += ` | ${j.parcels}📦`
    msg += '\n'
  })
  if (d.pending.length > 10) msg += `... ${fr ? 'et' : 'and'} ${d.pending.length - 10} ${fr ? 'autres' : 'more'}\n`
  msg += fr
    ? `\n💡 Cliquez "Sélectionner →" sur chaque job ou "Tout sélectionner" pour les passer en Todo.`
    : `\n💡 Click "Select →" on each job or "Select all" to move them to Todo.`
  return msg
}

function generateDayReport(d, fr, dayNum) {
  if (!d.plan) return fr ? `Pas de planning.` : `No planning.`
  const day = d.plan.find(dd => dd.day === dayNum)
  if (!day) return fr ? `Jour ${dayNum} introuvable.` : `Day ${dayNum} not found.`

  let msg = fr ? `📅 JOUR ${dayNum} :\n\n` : `📅 DAY ${dayNum}:\n\n`
  day.trucks.forEach(t => {
    msg += generateSingleTruckReport(t, d, fr) + '\n'
  })
  return msg
}

function generateSuggestions(d, fr) {
  const tips = []

  if (d.pending.length > 0) tips.push(fr
    ? `📋 ${d.pending.length} jobs en attente — pensez à les sélectionner si nécessaire`
    : `📋 ${d.pending.length} pending jobs — consider selecting them if needed`)

  if (d.lateStops.length > 0) tips.push(fr
    ? `⚠️ ${d.lateStops.length} retard(s) — essayez de réorganiser les stops par drag & drop dans le Planning`
    : `⚠️ ${d.lateStops.length} late — try reorganizing stops via drag & drop in Planning`)

  if (d.waitStops.length > 0 && d.totalWait > 30) tips.push(fr
    ? `⏸ ${d.totalWait} min d'attente — réorganisez pour combler les temps morts`
    : `⏸ ${d.totalWait} min waiting — reorganize to fill idle time`)

  if (d.twoDriverStops.length > 0) tips.push(fr
    ? `💪 ${d.twoDriverStops.length} stops nécessitent 2 chauffeurs — planifiez les équipes en conséquence`
    : `💪 ${d.twoDriverStops.length} stops need 2 drivers — plan teams accordingly`)

  if (d.highPrio.length === 0 && d.todo.length > 5) tips.push(fr
    ? `⚡ Aucune haute priorité — si certains clients sont urgents, glissez-les dans la zone haute priorité`
    : `⚡ No high priorities — if some clients are urgent, drag them to the high priority zone`)

  if (d.longestTruck && d.shortestTruck) {
    const ratio = d.longestTruck.totalDistance / Math.max(d.shortestTruck.totalDistance, 0.1)
    if (ratio > 2) tips.push(fr
      ? `🚛 Le camion ${d.longestTruck.truckId} fait ${ratio.toFixed(1)}x plus de km que le camion ${d.shortestTruck.truckId} — essayez de déplacer des stops dans le Planning`
      : `🚛 Truck ${d.longestTruck.truckId} drives ${ratio.toFixed(1)}x more km than truck ${d.shortestTruck.truckId} — try moving stops in Planning`)
  }

  if (d.withWindow.length === 0 && d.allJobs.length > 3) tips.push(fr
    ? `🕐 Aucune fenêtre horaire définie — ajoutez-en pour respecter les RDV clients (cliquez ⋯ sur un job)`
    : `🕐 No time windows set — add them to respect client appointments (click ⋯ on a job)`)

  if (tips.length === 0) return fr ? `✅ Tout semble optimal ! Rien à signaler.` : `✅ Everything looks optimal! Nothing to report.`

  return (fr ? `💡 SUGGESTIONS D'AMÉLIORATION :\n\n` : `💡 IMPROVEMENT SUGGESTIONS:\n\n`) + tips.map((t, i) => `${i + 1}. ${t}`).join('\n\n')
}

function generateImportHelp(fr) {
  return fr
    ? `📂 GUIDE D'IMPORT CSV :\n\nColonnes supportées :\n• order_id — identifiant unique\n• owner_name — nom du client\n• picking_address / delivery_address — adresse\n• parcels — nombre de colis\n• volume_m3 — volume en m³ (ex: 0.03)\n• time_from — heure début RDV (ex: 09:00)\n• time_to — heure fin RDV (ex: 12:00)\n• time_strict — strict ou non (oui/non)\n\nMulti-import : si des jobs existent, on vous demande "Ajouter" ou "Remplacer". Les doublons par order_id sont ignorés.`
    : `📂 CSV IMPORT GUIDE:\n\nSupported columns:\n• order_id — unique identifier\n• owner_name — client name\n• picking_address / delivery_address — address\n• parcels — number of parcels\n• volume_m3 — volume in m³ (e.g. 0.03)\n• time_from — appointment start (e.g. 09:00)\n• time_to — appointment end (e.g. 12:00)\n• time_strict — strict or not (yes/no)\n\nMulti-import: if jobs exist, you're asked "Add" or "Replace". Duplicates by order_id are ignored.`
}

function generateDragDropHelp(fr) {
  return fr
    ? `🖱 DRAG & DROP :\n\n1️⃣ Onglet Jobs → glissez les jobs entre les zones Haute / Normale / Basse priorité\n\n2️⃣ Onglet Planning → glissez les stops pour :\n   • Réordonner au sein d'un camion\n   • Déplacer un stop vers un autre camion\n   • Les horaires se recalculent automatiquement\n\n💡 Après réorganisation manuelle, les alertes de retard et d'attente se mettent à jour en temps réel.`
    : `🖱 DRAG & DROP:\n\n1️⃣ Jobs tab → drag jobs between High / Normal / Low priority zones\n\n2️⃣ Planning tab → drag stops to:\n   • Reorder within a truck\n   • Move a stop to another truck\n   • Times recalculate automatically\n\n💡 After manual reorganization, late and wait alerts update in real-time.`
}

function generateAlgoHelp(fr) {
  return fr
    ? `🧠 ALGORITHME EN 6 PHASES :\n\n1️⃣ SEED — Un stop éloigné du dépôt assigné à chaque camion\n\n2️⃣ CHEAPEST INSERTION — Chaque stop restant est inséré à la position qui coûte le moins de km. Les jobs haute priorité ont un bonus de -10 km.\n\n3️⃣ 2-OPT — On inverse des segments de la tournée pour éliminer les croisements (gain 15-25%).\n\n4️⃣ RÉÉQUILIBRAGE — On déplace des stops entre camions si ça réduit la distance totale.\n\n5️⃣ TRI PRIORITÉ — Les stops haute priorité sont placés en début de tournée (premier arrêt).\n\n6️⃣ CALCUL HORAIRES — Arrivée, attente (si avant fenêtre), temps sur place, détection retard.\n\n⚙️ Vitesse : 35 km/h (haversine). Fenêtres strictes : job rejeté si en retard. Capacité : max colis + m³ par camion.`
    : `🧠 ALGORITHM IN 6 PHASES:\n\n1️⃣ SEED — One distant stop assigned to each truck\n\n2️⃣ CHEAPEST INSERTION — Each remaining stop inserted at lowest-cost position. High priority jobs get -10 km bonus.\n\n3️⃣ 2-OPT — Reverse route segments to eliminate crossings (15-25% gain).\n\n4️⃣ REBALANCING — Move stops between trucks if it reduces total distance.\n\n5️⃣ PRIORITY SORT — High priority stops placed at start of route (first stop).\n\n6️⃣ TIME CALC — Arrival, waiting (if before window), service time, late detection.\n\n⚙️ Speed: 35 km/h (haversine). Strict windows: job rejected if late. Capacity: max parcels + m³ per truck.`
}

function generateCapacityReport(d, fr) {
  let msg = fr ? `📦 CAPACITÉ & VOLUME :\n\n` : `📦 CAPACITY & VOLUME:\n\n`
  msg += `${fr ? 'Total' : 'Total'}: ${d.totalParcels} ${fr ? 'colis' : 'parcels'}, ${d.totalVolume} m³\n\n`

  if (d.trucks.length > 0) {
    d.trucks.forEach(t => {
      msg += fr
        ? `Camion ${t.truckId}: ${t.totalParcels || 0} colis, ${t.totalVolumeM3 || 0} m³\n`
        : `Truck ${t.truckId}: ${t.totalParcels || 0} parcels, ${t.totalVolumeM3 || 0} m³\n`
    })
  }

  msg += fr
    ? `\n💡 Configurez les limites dans la barre du haut (Max colis, Max m³). Le temps sur place est calculé par order : 15min base + 3-15min selon le volume de chaque order.`
    : `\n💡 Set limits in the top bar (Max parcels, Max m³). On-site time is calculated per order: 15min base + 3-15min based on each order's volume.`

  return msg
}

function generateJobReport(j, d, fr) {
  let info = fr
    ? `📍 ${j.owner_name || j.address}\n${j.address}\n\nType: ${j.type === 'picking' ? 'Ramasse' : 'Livraison'}\nStatut: ${j.status}`
    : `📍 ${j.owner_name || j.address}\n${j.address}\n\nType: ${j.type === 'picking' ? 'Pickup' : 'Delivery'}\nStatus: ${j.status}`
  if (j.parcels) info += `\n📦 ${j.parcels} ${fr ? 'colis' : 'parcels'}`
  if (j.volumeM3) info += ` | 📐 ${j.volumeM3} m³`
  if (j.priority && j.priority !== 'medium') info += `\n⚡ ${fr ? 'Priorité' : 'Priority'}: ${j.priority}`
  if (j.timeFrom != null || j.timeTo != null) {
    info += `\n${j.timeStrict ? '🔒' : '🕐'} ${fr ? 'Fenêtre' : 'Window'}: ${fmtMin(j.timeFrom) || '...'} → ${fmtMin(j.timeTo) || '...'} (${j.timeStrict ? 'strict' : (fr ? 'souple' : 'flexible')})`
  }
  if (j.orderVolumes && j.orderVolumes.length > 1) {
    info += `\n📋 ${j.orderVolumes.length} orders: ${j.orderVolumes.map(v => v + 'm³').join(', ')}`
  }
  if (j.orderVolumes && j.orderVolumes.some(v => v >= 1.5)) {
    info += fr ? `\n⚠️💪 Nécessite 2 chauffeurs (order ≥ 1.5m³)` : `\n⚠️💪 Needs 2 drivers (order ≥ 1.5m³)`
  }

  // Position dans le planning
  if (d.plan) {
    d.plan.forEach(day => {
      day.trucks.forEach(truck => {
        const si = truck.stops.findIndex(s => s.order_id === j.order_id || s.address === j.address)
        if (si >= 0) {
          const s = truck.stops[si]
          info += fr
            ? `\n\n🚛 Camion ${truck.truckId}, stop #${si + 1}/${truck.stops.length}\n   Arrivée: ${s.arrivalTime} | Départ: ${s.departureTime}\n   ⏱ ${s.serviceTime || 0} min sur place`
            : `\n\n🚛 Truck ${truck.truckId}, stop #${si + 1}/${truck.stops.length}\n   Arrival: ${s.arrivalTime} | Departure: ${s.departureTime}\n   ⏱ ${s.serviceTime || 0} min on site`
          if (s.waitTime > 0) info += fr ? ` | ⏸ ${s.waitTime} min attente` : ` | ⏸ ${s.waitTime} min wait`
          if (s.lateBy > 0) info += fr ? ` | ⚠️ +${s.lateBy} min retard` : ` | ⚠️ +${s.lateBy} min late`
        }
      })
    })
  }

  return info
}

// ─── Utilitaires ─────────────────────────────────────────────────

function match(q, keywords) { return keywords.some(k => q.includes(k)) }

function findJobByName(q, jobs) {
  for (const j of jobs) {
    const name = (j.owner_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const orderId = (j.order_id || '').toLowerCase()
    if (name && name.length > 2 && q.includes(name)) return j
    if (orderId && orderId.length > 2 && q.includes(orderId)) return j
  }
  return null
}

function fmtMin(m) {
  if (m == null) return null
  const h = Math.floor(m / 60), mm = m % 60
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
}

// ─── Composant UI ────────────────────────────────────────────────

export default function ChatPanel({ lang, allJobs, plan, depotCoords }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const fr = lang === 'fr'
  const t = {
    placeholder: fr ? 'Posez une question à It...' : 'Ask It a question...',
    welcome: fr
      ? `🎈 Salut, je suis It ! Je connais votre tournée par cœur.\nCliquez un raccourci ci-dessous ou tapez un nom de client !`
      : `🎈 Hi, I'm It! I know your route inside out.\nClick a shortcut below or type a client name!`
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (isExpanded && inputRef.current) inputRef.current.focus()
  }, [isExpanded])

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput('')
    const data = deepAnalyze(allJobs, plan, lang)
    const answer = findAnswer(userMsg, data, lang)
    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: answer }])
  }

  return (
    <div style={{ borderTop: '1px solid #D6EAE4', display: 'flex', flexDirection: 'column', background: '#F4F7F5', minHeight: isExpanded ? 260 : 46, maxHeight: isExpanded ? 400 : 46, transition: 'all 0.25s ease' }}>
      <div onClick={() => setIsExpanded(!isExpanded)}
        style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 28 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #5EEDB3, #2ECC8F 40%, #1B7A6B 90%, #145C50)', boxShadow: '0 2px 8px rgba(46,204,143,0.4), inset 0 -2px 4px rgba(0,0,0,0.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, left: 6, width: 7, height: 5, background: 'rgba(255,255,255,0.5)', borderRadius: '50%', transform: 'rotate(-25deg)' }} />
          </div>
          <div style={{ width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '4px solid #1B7A6B', marginTop: -1 }} />
          <div style={{ width: 1, height: 10, background: '#94A3B8', marginTop: 0 }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1B7A6B', flex: 1 }}>It</span>
        {messages.length > 0 && !isExpanded && (
          <span style={{ fontSize: 10, color: '#94A3B8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {messages[messages.length - 1].content.slice(0, 40)}...
          </span>
        )}
        <span style={{ fontSize: 12, color: '#94A3B8', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {isExpanded && (
        <>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ background: '#E8F8F3', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#1B7A6B', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.welcome}</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                <div style={{
                  background: msg.role === 'user' ? '#1B7A6B' : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#1E293B',
                  borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  padding: '8px 12px', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  border: msg.role === 'assistant' ? '1px solid #D6EAE4' : 'none'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          {/* Raccourcis cliquables */}
          <div style={{ padding: '4px 12px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
            {(fr ? [
              { label: '📋 Briefing', cmd: 'briefing' },
              { label: '🚨 Alertes', cmd: 'alertes' },
              { label: '📊 Stats', cmd: 'stats' },
              { label: '⚠️ Retards', cmd: 'retards' },
              { label: '💪 2 drivers', cmd: '2 drivers' },
              { label: '🚛 Camions', cmd: 'camions' },
              { label: '⚡ Priorités', cmd: 'priorités' },
              { label: '💡 Suggestions', cmd: 'suggestions' },
            ] : [
              { label: '📋 Briefing', cmd: 'briefing' },
              { label: '🚨 Alerts', cmd: 'alerts' },
              { label: '📊 Stats', cmd: 'stats' },
              { label: '⚠️ Late', cmd: 'late stops' },
              { label: '💪 2 drivers', cmd: '2 drivers' },
              { label: '🚛 Trucks', cmd: 'trucks' },
              { label: '⚡ Priorities', cmd: 'priorities' },
              { label: '💡 Tips', cmd: 'suggestions' },
            ]).map(s => (
              <button key={s.cmd} onClick={() => { setInput(s.cmd); setTimeout(() => { const data = deepAnalyze(allJobs, plan, lang); const answer = findAnswer(s.cmd, data, lang); setMessages(prev => [...prev, { role: 'user', content: s.cmd }, { role: 'assistant', content: answer }]); setInput('') }, 0) }}
                style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: '#E8F8F3', color: '#1B7A6B', border: '1px solid #D6EAE4', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6, flexShrink: 0 }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={t.placeholder}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #D6EAE4', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif', background: '#fff' }} />
            <button onClick={handleSend} disabled={!input.trim()}
              style={{ padding: '8px 14px', background: !input.trim() ? '#D6EAE4' : '#1B7A6B', color: !input.trim() ? '#94A3B8' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ➤
            </button>
          </div>
        </>
      )}
    </div>
  )
}
