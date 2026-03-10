import { useState, useRef, useEffect } from 'react'

const SYSTEM_FR = `Tu es l'assistant IA de RoundIT, un optimiseur de tournées logistiques. Tu as accès au contexte complet de la tournée en cours.

Tes rôles :
1. JUSTIFIER les décisions de la tournée — pourquoi tel job est en premier, pourquoi tel camion fait plus de km, pourquoi un job n'est pas planifié, etc.
2. AIDER l'utilisateur à comprendre les fonctionnalités de l'app — priorités, fenêtres horaires, drag & drop, import multi-CSV, etc.

Règles :
- Réponds toujours en français
- Sois concis et direct (2-4 phrases max)
- Si tu ne connais pas la réponse, dis-le
- Utilise les données de la tournée pour justifier tes réponses
- Ne recommande jamais de modifier le code

Fonctionnalités de l'app :
- Import CSV picking/delivery avec colonnes optionnelles : parcels, volume_m3, time_from, time_to, time_strict
- Statuts : Pending (en attente) → Todo (sélectionné) → Done (livré) / Écarté
- Drag & drop entre 3 zones de priorité (Haute/Moyenne/Basse) dans l'onglet Jobs
- Drag & drop des stops entre camions dans l'onglet Planning
- Fenêtres horaires : strict (job rejeté si en retard) ou souple (planifié avec alerte retard)
- Si le camion arrive avant la fenêtre, il attend sur place
- Capacité camion : max colis et max m³ configurables
- Multi-import : ajouter ou remplacer des fichiers CSV
- Temps sur place calculé automatiquement : 5 min base + 2 min/colis + 5 min/m³
- Algorithme : cheapest insertion + 2-opt + rééquilibrage inter-camions + tri par priorité`

const SYSTEM_EN = `You are the AI assistant for RoundIT, a logistics route optimizer. You have access to the full context of the current route.

Your roles:
1. JUSTIFY route decisions — why a job is first, why a truck has more km, why a job isn't planned, etc.
2. HELP the user understand app features — priorities, time windows, drag & drop, multi-CSV import, etc.

Rules:
- Always respond in English
- Be concise and direct (2-4 sentences max)
- If you don't know the answer, say so
- Use route data to justify your answers
- Never recommend code changes

App features:
- CSV import picking/delivery with optional columns: parcels, volume_m3, time_from, time_to, time_strict
- Statuses: Pending (waiting) → Todo (selected) → Done (delivered) / Skipped
- Drag & drop between 3 priority zones (High/Normal/Low) in Jobs tab
- Drag & drop stops between trucks in Planning tab
- Time windows: strict (job rejected if late) or flexible (planned with late alert)
- If truck arrives before window, it waits on site
- Truck capacity: max parcels and max m³ configurable
- Multi-import: add or replace CSV files
- On-site time auto-calculated: 5 min base + 2 min/parcel + 5 min/m³
- Algorithm: cheapest insertion + 2-opt + inter-truck rebalancing + priority sorting`

function buildContext(allJobs, plan, depotCoords, lang) {
  const lines = []
  const t = lang === 'fr'

  // Jobs summary
  const pending = allJobs.filter(j => j.status === 'pending').length
  const todo = allJobs.filter(j => j.status === 'todo').length
  const done = allJobs.filter(j => j.status === 'done').length
  const ecarte = allJobs.filter(j => j.status === 'ecarte').length
  lines.push(t ? `=== JOBS (${allJobs.length} total) ===` : `=== JOBS (${allJobs.length} total) ===`)
  lines.push(t ? `Pending: ${pending}, Sélectionnés: ${todo}, Faits: ${done}, Écartés: ${ecarte}` : `Pending: ${pending}, Selected: ${todo}, Done: ${done}, Skipped: ${ecarte}`)

  // Job details
  allJobs.forEach(j => {
    let line = `- ${j.owner_name || j.address} | ${j.address} | ${j.type} | ${j.status}`
    if (j.priority && j.priority !== 'medium') line += ` | prio:${j.priority}`
    if (j.parcels) line += ` | ${j.parcels} colis`
    if (j.volumeM3) line += ` | ${j.volumeM3}m³`
    if (j.timeFrom != null || j.timeTo != null) {
      const from = j.timeFrom != null ? fmtMin(j.timeFrom) : '...'
      const to = j.timeTo != null ? fmtMin(j.timeTo) : '...'
      line += ` | ${j.timeStrict ? 'STRICT' : 'souple'} ${from}-${to}`
    }
    lines.push(line)
  })

  // Plan summary
  if (plan && plan.length > 0) {
    lines.push('')
    lines.push(t ? '=== PLANNING ===' : '=== PLANNING ===')
    plan.forEach(day => {
      lines.push(t ? `Jour ${day.day}:` : `Day ${day.day}:`)
      day.trucks.forEach(truck => {
        lines.push(t
          ? `  Camion ${truck.truckId}: ${truck.stops.length} stops, ${truck.totalDistance}km, retour ${truck.returnTime}`
          : `  Truck ${truck.truckId}: ${truck.stops.length} stops, ${truck.totalDistance}km, return ${truck.returnTime}`)
        if (truck.totalParcels) lines.push(`    ${truck.totalParcels} colis, ${truck.totalVolumeM3}m³`)
        truck.stops.forEach((s, i) => {
          let sl = `    ${i + 1}. ${s.arrivalTime} ${s.owner_name || s.address} (${s.type === 'picking' ? 'P' : 'D'}) ~${s.serviceTime || 0}min`
          if (s.waitTime > 0) sl += ` [attente ${s.waitTime}min]`
          if (s.lateBy > 0) sl += ` [RETARD +${s.lateBy}min]`
          lines.push(sl)
        })
      })
    })
  }

  return lines.join('\n')
}

function fmtMin(m) {
  const h = Math.floor(m / 60), mm = m % 60
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
}

export default function ChatBot({ lang, allJobs, plan, depotCoords }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const t = lang === 'fr'
    ? { title: 'It', placeholder: 'Posez votre question...', send: 'Envoyer', thinking: 'Réflexion...', welcome: 'Salut ! Je suis It, votre assistant RoundIT 🎈 Posez-moi une question sur votre tournée ou les fonctionnalités !' }
    : { title: 'It', placeholder: 'Ask a question...', send: 'Send', thinking: 'Thinking...', welcome: 'Hi! I\'m It, your RoundIT assistant 🎈 Ask me anything about your route or the app features!' }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus()
  }, [isOpen])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const context = buildContext(allJobs, plan, depotCoords, lang)
      const systemPrompt = (lang === 'fr' ? SYSTEM_FR : SYSTEM_EN) + '\n\n' + context

      const conversationHistory = [...messages, { role: 'user', content: userMsg }].map(m => ({
        role: m.role, content: m.content
      }))

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: conversationHistory,
        })
      })

      const data = await response.json()
      const assistantText = data.content?.map(b => b.type === 'text' ? b.text : '').join('') || (t.title + ': ...')
      setMessages(prev => [...prev, { role: 'assistant', content: assistantText }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: lang === 'fr' ? '❌ Erreur de connexion. Réessayez.' : '❌ Connection error. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <div onClick={() => setIsOpen(true)} className="it-balloon"
        style={{position:'fixed',bottom:24,right:24,cursor:'pointer',zIndex:900,display:'flex',flexDirection:'column',alignItems:'center',gap:4,transition:'transform 0.2s'}}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1) translateY(-4px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        {/* Ballon */}
        <div style={{width:60,height:72,background:'linear-gradient(145deg, #2ECC8F 0%, #1B7A6B 100%)',borderRadius:'50% 50% 50% 50% / 60% 60% 40% 40%',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 6px 24px rgba(46,204,143,0.4), inset 0 -4px 8px rgba(0,0,0,0.1), inset 0 4px 8px rgba(255,255,255,0.2)',position:'relative'}}>
          {/* Reflet */}
          <div style={{position:'absolute',top:10,left:14,width:14,height:10,background:'rgba(255,255,255,0.3)',borderRadius:'50%',transform:'rotate(-30deg)'}}/>
          <span style={{fontSize:20,fontWeight:800,color:'#fff',textShadow:'0 1px 3px rgba(0,0,0,0.2)',letterSpacing:'-0.5px'}}>It</span>
        </div>
        {/* Ficelle */}
        <div style={{width:2,height:16,background:'linear-gradient(to bottom, #1B7A6B, #94A3B8)',borderRadius:1}}/>
        {/* Petit noeud */}
        <div style={{width:6,height:6,background:'#1B7A6B',borderRadius:'50%',marginTop:-4}}/>
      </div>
    )
  }

  return (
    <div style={{position:'fixed',bottom:24,right:24,width:380,height:520,borderRadius:16,background:'#fff',boxShadow:'0 8px 40px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column',overflow:'hidden',zIndex:900,border:'1px solid #D6EAE4',fontFamily:'DM Sans, sans-serif'}}>
      {/* Header */}
      <div style={{padding:'12px 16px',background:'linear-gradient(135deg, #1B7A6B 0%, #2ECC8F 100%)',color:'#fff',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:32,height:38,background:'rgba(255,255,255,0.2)',borderRadius:'50% 50% 50% 50% / 60% 60% 40% 40%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,flexShrink:0}}>It</div>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700}}>It</div>
          <div style={{fontSize:10,opacity:0.8}}>{lang==='fr'?'Assistant RoundIT':'RoundIT Assistant'}</div>
        </div>
        <span onClick={() => setIsOpen(false)} style={{cursor:'pointer',fontSize:18,opacity:0.8,padding:'4px'}}>✕</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:14,display:'flex',flexDirection:'column',gap:10}}>
        {messages.length === 0 && (
          <div style={{background:'#E8F8F3',borderRadius:12,padding:'10px 14px',fontSize:13,color:'#1B7A6B',lineHeight:1.5}}>
            {t.welcome}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{alignSelf:msg.role==='user'?'flex-end':'flex-start',maxWidth:'85%'}}>
            <div style={{
              background:msg.role==='user'?'#1B7A6B':'#F4F7F5',
              color:msg.role==='user'?'#fff':'#1E293B',
              borderRadius:msg.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',
              padding:'10px 14px',fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{alignSelf:'flex-start'}}>
            <div style={{background:'#F4F7F5',borderRadius:'12px 12px 12px 2px',padding:'10px 14px',fontSize:13,color:'#94A3B8'}}>
              {t.thinking} <span style={{animation:'pulse 1s infinite'}}>●</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{padding:'10px 14px',borderTop:'1px solid #D6EAE4',display:'flex',gap:8}}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={t.placeholder}
          style={{flex:1,padding:'10px 12px',border:'1px solid #D6EAE4',borderRadius:10,fontSize:13,outline:'none',fontFamily:'DM Sans, sans-serif'}}/>
        <button onClick={handleSend} disabled={loading || !input.trim()}
          style={{padding:'10px 16px',background:loading||!input.trim()?'#D6EAE4':'#1B7A6B',color:loading||!input.trim()?'#94A3B8':'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
          ➤
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }
        @keyframes balloonFloat { 0%,100% { transform: translateY(0px) } 50% { transform: translateY(-6px) } }
        .it-balloon { animation: balloonFloat 3s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
