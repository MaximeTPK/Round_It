import { useState, useRef, useEffect } from 'react'

// ─── Moteur de réponse local ─────────────────────────────────────

function analyzeRoute(allJobs, plan, lang) {
  const fr = lang === 'fr'
  const pending = allJobs.filter(j => j.status === 'pending')
  const todo = allJobs.filter(j => j.status === 'todo')
  const done = allJobs.filter(j => j.status === 'done')
  const ecarte = allJobs.filter(j => j.status === 'ecarte')
  const highPrio = todo.filter(j => j.priority === 'high')
  const withWindow = allJobs.filter(j => j.timeFrom != null || j.timeTo != null)
  const strictJobs = allJobs.filter(j => j.timeStrict)

  let totalKm = 0, totalStops = 0, trucks = [], lateStops = [], waitStops = []
  if (plan) {
    plan.forEach(day => {
      day.trucks.forEach(truck => {
        totalKm += truck.totalDistance || 0
        totalStops += truck.stops.length
        trucks.push(truck)
        truck.stops.forEach(s => {
          if (s.lateBy > 0) lateStops.push(s)
          if (s.waitTime > 0) waitStops.push(s)
        })
      })
    })
  }

  const longestTruck = trucks.length > 0 ? trucks.reduce((a, b) => (a.totalDistance || 0) > (b.totalDistance || 0) ? a : b) : null
  const shortestTruck = trucks.length > 0 ? trucks.reduce((a, b) => (a.totalDistance || 0) < (b.totalDistance || 0) ? a : b) : null
  const busiestTruck = trucks.length > 0 ? trucks.reduce((a, b) => a.stops.length > b.stops.length ? a : b) : null

  return {
    pending, todo, done, ecarte, highPrio, withWindow, strictJobs,
    totalKm: Math.round(totalKm * 10) / 10, totalStops, trucks,
    lateStops, waitStops, longestTruck, shortestTruck, busiestTruck,
    plan, allJobs
  }
}

function findAnswer(input, data, lang) {
  const fr = lang === 'fr'
  const q = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // ─── Résumé / Overview ───
  if (match(q, ['resume', 'summary', 'overview', 'recapitule', 'recap', 'tournee', 'route', 'explain', 'explique', 'choix', 'choices', 'justifie'])) {
    if (data.trucks.length === 0) return fr
      ? `Aucune tournée n'a encore été optimisée. Importez vos CSV, sélectionnez les jobs (Pending → Todo), puis cliquez Optimiser.`
      : `No route has been optimized yet. Import your CSVs, select jobs (Pending → Todo), then click Optimize.`
    return fr
      ? `📊 Tournée : ${data.totalStops} stops répartis sur ${data.trucks.length} camion(s), ${data.totalKm} km total.\n\n` +
        `${data.pending.length} job(s) en attente, ${data.todo.length} sélectionné(s), ${data.done.length} fait(s), ${data.ecarte.length} écarté(s).\n` +
        (data.highPrio.length > 0 ? `⚡ ${data.highPrio.length} job(s) en haute priorité sont traités en premier.\n` : '') +
        (data.lateStops.length > 0 ? `⚠️ ${data.lateStops.length} stop(s) en retard par rapport à la fenêtre horaire.\n` : '') +
        (data.waitStops.length > 0 ? `⏸ ${data.waitStops.length} stop(s) avec attente avant la fenêtre.\n` : '') +
        `\nL'algorithme optimise par insertion au moindre coût, puis améliore avec 2-opt et rééquilibrage entre camions.`
      : `📊 Route: ${data.totalStops} stops across ${data.trucks.length} truck(s), ${data.totalKm} km total.\n\n` +
        `${data.pending.length} pending, ${data.todo.length} selected, ${data.done.length} done, ${data.ecarte.length} skipped.\n` +
        (data.highPrio.length > 0 ? `⚡ ${data.highPrio.length} high priority job(s) are handled first.\n` : '') +
        (data.lateStops.length > 0 ? `⚠️ ${data.lateStops.length} stop(s) arriving late.\n` : '') +
        (data.waitStops.length > 0 ? `⏸ ${data.waitStops.length} stop(s) with waiting time.\n` : '') +
        `\nThe algorithm uses cheapest insertion, 2-opt improvement, and inter-truck rebalancing.`
  }

  // ─── Pourquoi tel camion fait plus ───
  if (match(q, ['camion', 'truck', 'plus de km', 'more km', 'longest', 'plus long', 'difference', 'equilibre', 'balance'])) {
    if (!data.longestTruck) return fr ? `Pas encore de tournée optimisée.` : `No route optimized yet.`
    return fr
      ? `🚛 Le camion ${data.longestTruck.truckId} fait le plus de km (${data.longestTruck.totalDistance} km, ${data.longestTruck.stops.length} stops)` +
        (data.shortestTruck && data.shortestTruck.truckId !== data.longestTruck.truckId
          ? ` vs camion ${data.shortestTruck.truckId} (${data.shortestTruck.totalDistance} km, ${data.shortestTruck.stops.length} stops).`
          : '.') +
        `\n\nLe rééquilibrage essaie de minimiser la distance totale, pas d'égaliser les camions. Un camion peut faire plus de km si ses stops sont éloignés du dépôt.`
      : `🚛 Truck ${data.longestTruck.truckId} has the most km (${data.longestTruck.totalDistance} km, ${data.longestTruck.stops.length} stops)` +
        (data.shortestTruck && data.shortestTruck.truckId !== data.longestTruck.truckId
          ? ` vs truck ${data.shortestTruck.truckId} (${data.shortestTruck.totalDistance} km, ${data.shortestTruck.stops.length} stops).`
          : '.') +
        `\n\nRebalancing minimizes total distance, not equal distribution. A truck may drive more if its stops are far from the depot.`
  }

  // ─── Priorité ───
  if (match(q, ['priorite', 'priority', 'haute', 'high', 'premier', 'first', 'ordre', 'order'])) {
    if (data.highPrio.length === 0) return fr
      ? `Aucun job n'est en haute priorité actuellement. Pour changer la priorité, glissez un job dans la zone "Haute priorité" dans l'onglet Jobs.`
      : `No jobs are high priority currently. To change priority, drag a job to the "High priority" zone in the Jobs tab.`
    const names = data.highPrio.slice(0, 5).map(j => j.owner_name || j.address).join(', ')
    return fr
      ? `⚡ ${data.highPrio.length} job(s) en haute priorité : ${names}.\n\nCes jobs sont insérés en premier dans la tournée et placés en début de chaque camion. L'algo leur donne un bonus de -10km dans le coût d'insertion.`
      : `⚡ ${data.highPrio.length} high priority job(s): ${names}.\n\nThese are inserted first and placed at the start of each truck's route. The algorithm gives them a -10km bonus in insertion cost.`
  }

  // ─── Retard ───
  if (match(q, ['retard', 'late', 'depasse', 'fenetre', 'window', 'horaire', 'time', 'rdv', 'creneau'])) {
    if (data.lateStops.length === 0 && data.waitStops.length === 0) return fr
      ? `✅ Aucun retard ni attente dans la tournée actuelle. Toutes les fenêtres horaires sont respectées.`
      : `✅ No delays or waiting in the current route. All time windows are respected.`
    let msg = ''
    if (data.lateStops.length > 0) {
      const names = data.lateStops.slice(0, 3).map(s => `${s.owner_name||s.address} (+${s.lateBy}min)`).join(', ')
      msg += fr
        ? `⚠️ ${data.lateStops.length} stop(s) en retard : ${names}.\n`
        : `⚠️ ${data.lateStops.length} late stop(s): ${names}.\n`
    }
    if (data.waitStops.length > 0) {
      const names = data.waitStops.slice(0, 3).map(s => `${s.owner_name||s.address} (${s.waitTime}min)`).join(', ')
      msg += fr
        ? `⏸ ${data.waitStops.length} stop(s) avec attente : ${names}.\n`
        : `⏸ ${data.waitStops.length} stop(s) with waiting: ${names}.\n`
    }
    msg += fr
      ? `\nLes stops "strict" hors fenêtre ne sont pas planifiés. Les stops "souples" sont planifiés avec une alerte. Vous pouvez réorganiser les stops par drag & drop dans l'onglet Planning.`
      : `\nStrict stops outside their window are not planned. Flexible stops are planned with a late alert. You can reorganize stops by drag & drop in the Planning tab.`
    return msg
  }

  // ─── Pending / Sélection ───
  if (match(q, ['pending', 'attente', 'selectionner', 'select', 'todo', 'comment'])) {
    return fr
      ? `📋 ${data.pending.length} job(s) en attente, ${data.todo.length} sélectionné(s).\n\nPour sélectionner un job : cliquez "Sélectionner →" sur le job, ou utilisez "Tout sélectionner" pour tout passer en Todo d'un coup. Ensuite cliquez Optimiser.`
      : `📋 ${data.pending.length} pending job(s), ${data.todo.length} selected.\n\nTo select a job: click "Select →" on the job, or use "Select all" to move everything to Todo. Then click Optimize.`
  }

  // ─── Import / CSV ───
  if (match(q, ['import', 'csv', 'fichier', 'file', 'ajouter', 'add', 'remplacer', 'replace', 'merge'])) {
    return fr
      ? `📂 Pour importer : cliquez sur "Picking CSV" ou "Delivery CSV" dans la barre du haut.\n\nSi des jobs existent déjà, une fenêtre vous demande "Ajouter" (merge) ou "Remplacer" (tout effacer). Les doublons par order_id sont automatiquement ignorés.\n\nColonnes supportées : order_id, owner_name, address, parcels, volume_m3, time_from, time_to, time_strict.`
      : `📂 To import: click "Picking CSV" or "Delivery CSV" in the top bar.\n\nIf jobs already exist, a dialog asks "Add" (merge) or "Replace" (clear all). Duplicates by order_id are automatically ignored.\n\nSupported columns: order_id, owner_name, address, parcels, volume_m3, time_from, time_to, time_strict.`
  }

  // ─── Drag & drop ───
  if (match(q, ['drag', 'drop', 'glisser', 'deplacer', 'deplace', 'move', 'reorganiser'])) {
    return fr
      ? `🖱 Deux zones de drag & drop :\n\n1. **Onglet Jobs** : glissez les jobs entre les zones Haute/Moyenne/Basse priorité.\n\n2. **Onglet Planning** : glissez les stops pour réordonner au sein d'un camion ou déplacer un stop vers un autre camion. Les horaires sont recalculés automatiquement.`
      : `🖱 Two drag & drop areas:\n\n1. **Jobs tab**: drag jobs between High/Normal/Low priority zones.\n\n2. **Planning tab**: drag stops to reorder within a truck or move a stop to another truck. Times are recalculated automatically.`
  }

  // ─── Capacité ───
  if (match(q, ['capacite', 'capacity', 'colis', 'parcel', 'volume', 'm3', 'max'])) {
    const totalParcels = data.allJobs.reduce((s, j) => s + (j.parcels || 0), 0)
    const totalVol = data.allJobs.reduce((s, j) => s + (j.volumeM3 || 0), 0)
    return fr
      ? `📦 Total : ${totalParcels} colis, ${Math.round(totalVol * 100) / 100} m³.\n\nVous pouvez limiter la capacité par camion dans la barre du haut (Max colis, Max m³). L'algo ne dépassera pas ces limites.\n\nLe temps sur place est calculé automatiquement : 5 min (base) + 2 min/colis + 5 min/m³.`
      : `📦 Total: ${totalParcels} parcels, ${Math.round(totalVol * 100) / 100} m³.\n\nYou can limit capacity per truck in the top bar (Max parcels, Max m³). The algorithm won't exceed these limits.\n\nOn-site time is auto-calculated: 5 min (base) + 2 min/parcel + 5 min/m³.`
  }

  // ─── Algorithme ───
  if (match(q, ['algo', 'algorithm', 'comment ca marche', 'how does it work', 'optimisation', 'optimization', '2-opt', '2opt', 'methode', 'method'])) {
    return fr
      ? `🧠 L'algorithme fonctionne en 6 phases :\n\n1. **Seed** : un stop éloigné par camion\n2. **Cheapest insertion** : chaque stop est inséré à la position optimale\n3. **2-opt** : on inverse des segments pour réduire les croisements\n4. **Rééquilibrage** : on déplace des stops entre camions si ça réduit la distance\n5. **Tri priorité** : les stops haute priorité sont placés en début de tournée\n6. **Calcul horaires** : arrivée, attente, temps sur place, retard\n\nLa vitesse moyenne est fixée à 35 km/h (haversine).`
      : `🧠 The algorithm works in 6 phases:\n\n1. **Seed**: one distant stop per truck\n2. **Cheapest insertion**: each stop inserted at optimal position\n3. **2-opt**: reverse segments to reduce crossings\n4. **Rebalancing**: move stops between trucks if it reduces total distance\n5. **Priority sort**: high priority stops placed at start of route\n6. **Time calc**: arrival, waiting, service time, late alerts\n\nAverage speed is fixed at 35 km/h (haversine).`
  }

  // ─── Job spécifique ───
  const jobMatch = findJobByName(q, data.allJobs)
  if (jobMatch) {
    const j = jobMatch
    let info = fr
      ? `📍 **${j.owner_name || j.address}**\n${j.address}\nType: ${j.type === 'picking' ? 'Ramasse' : 'Livraison'} | Statut: ${j.status}`
      : `📍 **${j.owner_name || j.address}**\n${j.address}\nType: ${j.type === 'picking' ? 'Pickup' : 'Delivery'} | Status: ${j.status}`
    if (j.parcels) info += ` | ${j.parcels} ${fr ? 'colis' : 'parcels'}`
    if (j.volumeM3) info += ` | ${j.volumeM3} m³`
    if (j.priority && j.priority !== 'medium') info += ` | ${fr ? 'Priorité' : 'Priority'}: ${j.priority}`
    if (j.timeFrom != null || j.timeTo != null) {
      info += `\n${fr ? 'Fenêtre' : 'Window'}: ${fmtMin(j.timeFrom) || '...'}-${fmtMin(j.timeTo) || '...'} (${j.timeStrict ? (fr ? 'strict' : 'strict') : (fr ? 'souple' : 'flexible')})`
    }
    // Find in plan
    if (data.plan) {
      data.plan.forEach(day => {
        day.trucks.forEach(truck => {
          const stopIdx = truck.stops.findIndex(s => s.order_id === j.order_id || s.address === j.address)
          if (stopIdx >= 0) {
            const s = truck.stops[stopIdx]
            info += fr
              ? `\n\n🚛 Camion ${truck.truckId}, stop #${stopIdx + 1} — arrivée ${s.arrivalTime}, ~${s.serviceTime || 0} min sur place`
              : `\n\n🚛 Truck ${truck.truckId}, stop #${stopIdx + 1} — arrival ${s.arrivalTime}, ~${s.serviceTime || 0} min on site`
            if (s.waitTime > 0) info += ` (${fr ? 'attente' : 'wait'} ${s.waitTime} min)`
            if (s.lateBy > 0) info += ` (${fr ? 'retard' : 'late'} +${s.lateBy} min)`
          }
        })
      })
    }
    return info
  }

  // ─── Fallback ───
  return fr
    ? `🤔 Je ne suis pas sûr de comprendre. Essayez :\n• "Résumé de la tournée"\n• "Pourquoi le camion 1 fait plus de km ?"\n• "Quels jobs sont en retard ?"\n• "Comment importer un CSV ?"\n• "Comment fonctionne l'algorithme ?"\n• Le nom d'un client pour ses détails`
    : `🤔 I'm not sure I understand. Try:\n• "Route summary"\n• "Why does truck 1 have more km?"\n• "Which jobs are late?"\n• "How to import a CSV?"\n• "How does the algorithm work?"\n• A client name for their details`
}

function match(q, keywords) {
  return keywords.some(k => q.includes(k))
}

function findJobByName(q, jobs) {
  for (const j of jobs) {
    const name = (j.owner_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const orderId = (j.order_id || '').toLowerCase()
    if (name && name.length > 2 && q.includes(name)) return j
    if (orderId && q.includes(orderId)) return j
  }
  return null
}

function fmtMin(m) {
  if (m == null) return null
  const h = Math.floor(m / 60), mm = m % 60
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
}

// ─── Composant ───────────────────────────────────────────────────

export default function ChatPanel({ lang, allJobs, plan, depotCoords }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const t = lang === 'fr'
    ? { placeholder: 'Posez une question à It...', welcome: 'Salut ! Je suis It 🎈 Posez-moi une question sur votre tournée ou l\'app !\n\nEssayez : "résumé", "retards", "comment importer"...' }
    : { placeholder: 'Ask It a question...', welcome: 'Hi! I\'m It 🎈 Ask me about your route or the app!\n\nTry: "summary", "late stops", "how to import"...' }

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

    const data = analyzeRoute(allJobs, plan, lang)
    const answer = findAnswer(userMsg, data, lang)

    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: answer }])
  }

  return (
    <div style={{ borderTop: '1px solid #D6EAE4', display: 'flex', flexDirection: 'column', background: '#F4F7F5', minHeight: isExpanded ? 240 : 46, maxHeight: isExpanded ? 360 : 46, transition: 'all 0.25s ease' }}>
      {/* Header */}
      <div onClick={() => setIsExpanded(!isExpanded)}
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
        <div style={{ width: 26, height: 30, background: 'linear-gradient(145deg, #2ECC8F 0%, #1B7A6B 100%)', borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 6, width: 6, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: '50%', transform: 'rotate(-30deg)' }} />
          It
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1B7A6B', flex: 1 }}>It</span>
        {messages.length > 0 && !isExpanded && (
          <span style={{ fontSize: 10, color: '#94A3B8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {messages[messages.length - 1].content.slice(0, 40)}...
          </span>
        )}
        <span style={{ fontSize: 12, color: '#94A3B8', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {/* Chat body */}
      {isExpanded && (
        <>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ background: '#E8F8F3', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#1B7A6B', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.welcome}</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
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
          <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexShrink: 0 }}>
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
