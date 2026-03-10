import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import * as XLSX from 'xlsx'
import { haversine, travelTime, formatTime, computeServiceTime, checkNeedsTwoDrivers } from '../lib/vrp'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

function getClient() {
  if (!window.__sb) {
    const { createClient } = require('@supabase/supabase-js')
    window.__sb = createClient('https://yqjenhpaohwunjvgmlyw.supabase.co', ANON_KEY)
  }
  return window.__sb
}

const MapView = dynamic(() => import('./MapView'), { ssr: false })
const ChatPanel = dynamic(() => import('./ChatPanel'), { ssr: false })

const COLORS = ['#2ECC8F','#0891B2','#0D9488','#7C3AED','#B45309','#BE123C','#15803D','#C2410C']
const DEPOT_KEY = 'roundit_depot'
const TRUCKS_KEY = 'roundit_trucks'

const PRIORITY_ZONES = [
  { key:'high', icon:'▲', color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
  { key:'medium', icon:'●', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
  { key:'low', icon:'▼', color:'#94A3B8', bg:'#F1F5F9', border:'#CBD5E1' },
]
const PRIORITY_LABELS = {
  fr:{ high:'Haute priorité', medium:'Priorité normale', low:'Basse priorité' },
  en:{ high:'High priority', medium:'Normal priority', low:'Low priority' },
}

const STATUS_COLORS = { pending:'#6366F1', todo:'#2ECC8F', done:'#059669', ecarte:'#D97706' }
const STATUS_BG = { pending:'#EEF2FF', todo:'#EFF6FF', done:'#F0FDF4', ecarte:'#FFFBEB' }

const I18N = {
  fr:{
    brand:'RoundIT', pickingCsv:'Picking CSV', deliveryCsv:'Delivery CSV',
    depot:'Dépôt', depotPlaceholder:'Adresse du dépôt', trucks:'Camions',
    days:'Jours', start:'Départ', end:'Fin',
    optimizeAll:'Optimiser tout →', optimizeSel:'Optimiser ({n}) →', optimizing:'⏳ Géocodage...',
    mapPlaceholder:'La carte apparaîtra ici', mapSub:'Uploadez vos fichiers CSV et cliquez sur Optimiser',
    total:'Total', pending:'En attente', todo:'À faire', done:'Faits', ecarte:'Écartés', statuses:'Statuts',
    statusPending:'En attente', statusTodo:'À faire', statusDone:'Fait', statusEcarte:'Écarté',
    jobs:'Jobs', planning:'Planning',
    pendingSection:'En attente', todoSection:'Sélectionnés', doneSection:'Faits', ecarteSection:'Écartés',
    selectAll:'Tout sélectionner', recalculate:'Recalculer', exportExcel:'↓ Export Excel',
    optimizeBtn:'Optimiser', launchOptim:"Lance l'optimisation pour voir le planning",
    day:'Jour', stops:'stops', truck:'Camion', km:'km', return:'retour', selected:'Sélectionné',
    errorFile:'Chargez au moins un fichier', errorDepot:"Saisissez l'adresse du dépôt",
    logout:'Déconnexion', maxParcels:'Max colis', maxVolume:'Max m³',
    parcels:'colis', volume:'m³', serviceTime:'min',
    dragHint:'Glissez les jobs entre les zones de priorité',
    importTitle:'Import CSV', importMsg:'Des jobs existent déjà. Que souhaitez-vous faire ?',
    importAdd:'+ Ajouter', importReplace:'↻ Remplacer tout', importCancel:'Annuler',
    importAddDesc:'Les nouveaux jobs seront ajoutés (doublons ignorés)',
    importReplaceDesc:'Tous les jobs actuels seront supprimés',
    reset:'Reset', selectForRoute:'Sélectionner →', unselectFromRoute:'← Retirer',
    selectAllPending:'Tout sélectionner', alertImpossible:'⚠ Fenêtre horaire impossible — job replacé en attente',
    timeWindow:'Fenêtre horaire', strict:'Strict', flexible:'Souple',
  },
  en:{
    brand:'RoundIT', pickingCsv:'Picking CSV', deliveryCsv:'Delivery CSV',
    depot:'Depot', depotPlaceholder:'Depot address', trucks:'Trucks',
    days:'Days', start:'Start', end:'End',
    optimizeAll:'Optimize all →', optimizeSel:'Optimize ({n}) →', optimizing:'⏳ Geocoding...',
    mapPlaceholder:'Map will appear here', mapSub:'Upload your CSV files and click Optimize',
    total:'Total', pending:'Pending', todo:'To do', done:'Done', ecarte:'Skipped', statuses:'Statuses',
    statusPending:'Pending', statusTodo:'To do', statusDone:'Done', statusEcarte:'Skipped',
    jobs:'Jobs', planning:'Planning',
    pendingSection:'Pending', todoSection:'Selected', doneSection:'Done', ecarteSection:'Skipped',
    selectAll:'Select all', recalculate:'Recalculate', exportExcel:'↓ Export Excel',
    optimizeBtn:'Optimize', launchOptim:'Run optimization to see the planning',
    day:'Day', stops:'stops', truck:'Truck', km:'km', return:'return', selected:'Selected',
    errorFile:'Load at least one file', errorDepot:'Enter the depot address',
    logout:'Logout', maxParcels:'Max parcels', maxVolume:'Max m³',
    parcels:'parcels', volume:'m³', serviceTime:'min',
    dragHint:'Drag jobs between priority zones',
    importTitle:'CSV Import', importMsg:'Jobs already exist. What would you like to do?',
    importAdd:'+ Add', importReplace:'↻ Replace all', importCancel:'Cancel',
    importAddDesc:'New jobs will be added (duplicates ignored)',
    importReplaceDesc:'All current jobs will be removed',
    reset:'Reset', selectForRoute:'Select →', unselectFromRoute:'← Remove',
    selectAllPending:'Select all', alertImpossible:'⚠ Impossible time window — job moved to pending',
    timeWindow:'Time window', strict:'Strict', flexible:'Flexible',
  }
}

export default function AppInner() {
  const [lang, setLang] = useState('fr')
  const [pickingFiles, setPickingFiles] = useState([])
  const [deliveryFiles, setDeliveryFiles] = useState([])
  const [depot, setDepot] = useState('')
  const [numTrucks, setNumTrucks] = useState(4)
  const [numDays, setNumDays] = useState(1)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [maxParcels, setMaxParcels] = useState('')
  const [maxVolume, setMaxVolume] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [alert, setAlert] = useState(null)
  const [allJobs, setAllJobs] = useState([])
  const [plan, setPlan] = useState([])
  const [depotCoords, setDepotCoords] = useState(null)
  const [activeTab, setActiveTab] = useState('jobs')
  const [highlightTruck, setHighlightTruck] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [dragOverZone, setDragOverZone] = useState(null)
  const [mergeModal, setMergeModal] = useState(null)
  const [planDragOver, setPlanDragOver] = useState(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)
  const pickRef = useRef()
  const delRef = useRef()
  const T = I18N[lang]

  useEffect(() => {
    const savedDepot = localStorage.getItem(DEPOT_KEY)
    const savedTrucks = localStorage.getItem(TRUCKS_KEY)
    if (savedDepot) setDepot(savedDepot)
    if (savedTrucks) setNumTrucks(parseInt(savedTrucks))
    getClient().auth.getSession().then(({ data:{ session } }) => {
      if (session?.user) setUserEmail(session.user.email)
      else window.location.href = '/login'
    })
  }, [])

  const saveDepot = v => { setDepot(v); localStorage.setItem(DEPOT_KEY, v) }
  const saveTrucks = v => { setNumTrucks(v); localStorage.setItem(TRUCKS_KEY, v) }
  const handleLogout = async () => { await getClient().auth.signOut(); window.location.href = '/login' }
  const getToken = async () => { const { data:{ session } } = await getClient().auth.getSession(); return session?.access_token || null }

  // ─── File import ───
  const handleFileSelect = (file, type) => {
    if (!file) return
    if (allJobs.length > 0) { setMergeModal({ type, file }) } else { addFile(file, type) }
  }
  const addFile = (file, type) => {
    if (type === 'picking') setPickingFiles(p => [...p, file])
    else setDeliveryFiles(p => [...p, file])
  }
  const handleMergeChoice = (mode) => {
    if (!mergeModal) return
    const { type, file } = mergeModal
    if (mode === 'replace') { setAllJobs([]); setPlan([]); setPickingFiles([]); setDeliveryFiles([]) }
    addFile(file, type)
    setMergeModal(null)
    setNeedsRefresh(true)
  }
  const handleReset = () => { setAllJobs([]); setPlan([]); setPickingFiles([]); setDeliveryFiles([]); setDepotCoords(null); setNeedsRefresh(false) }

  // ─── Job updates ───
  const updateJob = (id, fields) => setAllJobs(p => p.map(j => j.id === id ? { ...j, ...fields } : j))

  const updateStatus = async (id, status) => {
    if (!id) return
    setAllJobs(p => p.map(j => j.id === id ? { ...j, status } : j))
    const token = await getToken()
    await fetch('/api/jobs', { method:'PATCH', headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer '+token } : {}) }, body:JSON.stringify({ id, status }) })
  }

  // Pending → todo (select for route)
  const selectForRoute = (id) => updateStatus(id, 'todo')
  const unselectFromRoute = (id) => updateStatus(id, 'pending')
  const selectAllPending = () => {
    const pendingIds = allJobs.filter(j => j.status === 'pending').map(j => j.id)
    setAllJobs(p => p.map(j => pendingIds.includes(j.id) ? { ...j, status:'todo' } : j))
    // Batch update to API
    getToken().then(token => {
      pendingIds.forEach(id => {
        fetch('/api/jobs', { method:'PATCH', headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer '+token } : {}) }, body:JSON.stringify({ id, status:'todo' }) })
      })
    })
  }

  // ─── Time window validation ───
  const validateTimeWindows = (jobs) => {
    const [eh, em] = endTime.split(':').map(Number)
    const endMin = eh * 60 + (em || 0)
    const invalidIds = []
    jobs.forEach(j => {
      if (j.status === 'todo' && j.timeFrom != null && j.timeFrom > endMin) {
        invalidIds.push(j.id)
      }
      if (j.status === 'todo' && j.timeStrict && j.timeTo != null) {
        const [sh, sm2] = startTime.split(':').map(Number)
        const startMin = sh * 60 + (sm2 || 0)
        if (j.timeTo < startMin) invalidIds.push(j.id)
      }
    })
    return invalidIds
  }

  // ─── Drag & drop priority zones ───
  const handleDragStart = (e, jobId) => { e.dataTransfer.setData('text/plain', jobId); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e, zone) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverZone(zone) }
  const handleDragLeave = () => setDragOverZone(null)
  const handleDrop = (e, targetPriority) => {
    e.preventDefault(); setDragOverZone(null)
    const jobId = e.dataTransfer.getData('text/plain')
    if (jobId) setAllJobs(p => p.map(j => j.id === jobId ? { ...j, priority:targetPriority } : j))
  }

  // ─── Planning drag & drop ───
  const recalcTruck = (stops, dpot, sMin) => {
    let time = sMin, totalDist = 0, totalWait = 0, prev = dpot, totalParcels = 0, totalVolumeM3 = 0
    const detailed = []
    for (const stop of stops) {
      const travel = travelTime(prev, stop)
      let arrival = time + travel
      let waitTime = 0
      if (stop.timeFrom != null && arrival < stop.timeFrom) { waitTime = stop.timeFrom - arrival; arrival = stop.timeFrom }
      const svcTime = computeServiceTime(stop)
      const lateBy = (stop.timeTo != null && arrival > stop.timeTo) ? Math.round(arrival - stop.timeTo) : 0
      detailed.push({ ...stop, serviceTime:svcTime, arrivalTime:formatTime(arrival), departureTime:formatTime(arrival+svcTime), waitTime:Math.round(waitTime), lateBy, needsTwoDrivers:checkNeedsTwoDrivers(stop) })
      totalDist += haversine(prev, stop); totalWait += waitTime; time = arrival + svcTime; prev = stop
      totalParcels += stop.parcels || 0; totalVolumeM3 += stop.volumeM3 || 0
    }
    const returnDist = haversine(prev, dpot), returnTravel = travelTime(prev, dpot)
    return { stops:detailed, totalDistance:Math.round((totalDist+returnDist)*10)/10, totalDuration:Math.round(time-sMin+returnTravel), totalWait:Math.round(totalWait), returnTime:formatTime(time+returnTravel), totalParcels, totalVolumeM3:Math.round(totalVolumeM3*100)/100 }
  }
  const handlePlanDragStart = (e, dayIdx, truckIdx, stopIdx) => { e.dataTransfer.setData('text/plain', JSON.stringify({ dayIdx, truckIdx, stopIdx })); e.dataTransfer.effectAllowed = 'move' }
  const handlePlanDragOver = (e, dayIdx, truckIdx) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPlanDragOver({ dayIdx, truckIdx }) }
  const handlePlanDragLeave = () => setPlanDragOver(null)
  const handlePlanDrop = (e, tgtDayIdx, tgtTruckIdx, tgtStopIdx) => {
    e.preventDefault(); setPlanDragOver(null)
    let src; try { src = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (!src || src.dayIdx === undefined || src.dayIdx !== tgtDayIdx) return
    const [sh, sm] = startTime.split(':').map(Number); const sMin = sh*60+(sm||0)
    setPlan(prev => {
      const np = JSON.parse(JSON.stringify(prev))
      const srcT = np[src.dayIdx].trucks[src.truckIdx], tgtT = np[tgtDayIdx].trucks[tgtTruckIdx]
      const [moved] = srcT.stops.splice(src.stopIdx, 1)
      tgtT.stops.splice(tgtStopIdx !== undefined ? tgtStopIdx : tgtT.stops.length, 0, moved)
      if (depotCoords) {
        Object.assign(srcT, recalcTruck(srcT.stops, depotCoords, sMin))
        if (src.truckIdx !== tgtTruckIdx) Object.assign(tgtT, recalcTruck(tgtT.stops, depotCoords, sMin))
      }
      np[src.dayIdx].trucks = np[src.dayIdx].trucks.filter(t => t.stops.length > 0)
      return np
    })
  }

  // ─── Optimize ───
  const handleOptimize = async () => {
    if (pickingFiles.length === 0 && deliveryFiles.length === 0) return setError(T.errorFile)
    if (!depot) return setError(T.errorDepot)

    // Validate time windows before optimizing
    const invalidIds = validateTimeWindows(allJobs)
    if (invalidIds.length > 0) {
      setAllJobs(p => p.map(j => invalidIds.includes(j.id) ? { ...j, status:'pending' } : j))
      setAlert(T.alertImpossible)
      setTimeout(() => setAlert(null), 5000)
      return
    }

    setLoading(true); setError(null); setProgress(T.optimizing)
    try {
      const token = await getToken()
      const formData = new FormData()
      pickingFiles.forEach(f => formData.append('picking', f))
      deliveryFiles.forEach(f => formData.append('delivery', f))

      const truckCapacity = {}
      if (maxParcels && parseInt(maxParcels) > 0) truckCapacity.maxParcels = parseInt(maxParcels)
      if (maxVolume && parseFloat(maxVolume) > 0) truckCapacity.maxVolumeM3 = parseFloat(maxVolume)

      const jobPriorities = {}, jobTimeWindows = {}
      allJobs.forEach(j => {
        if (j.priority && j.priority !== 'medium') jobPriorities[j.id] = j.priority
        if (j.timeFrom != null || j.timeTo != null) {
          jobTimeWindows[j.id] = { timeFrom:j.timeFrom, timeTo:j.timeTo, timeStrict:j.timeStrict }
        }
      })

      // Only send todo jobs' IDs for optimization
      const todoIds = allJobs.filter(j => j.status === 'todo').map(j => j.id)

      formData.append('config', JSON.stringify({
        depotAddress:depot, numTrucks, numDays, startTime, endTime,
        sessionDate:new Date().toISOString().slice(0,10),
        selectedIds:todoIds.length > 0 ? todoIds : null,
        truckCapacity:Object.keys(truckCapacity).length > 0 ? truckCapacity : null,
        jobPriorities, jobTimeWindows,
      }))
      const res = await fetch('/api/optimize', { method:'POST', body:formData, headers:token ? { Authorization:'Bearer '+token } : {} })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Merge: keep priorities, time windows, and pending status for non-optimized jobs
      const mergedJobs = data.allJobs.map(j => {
        const existing = allJobs.find(ej => ej.id === j.id || ej.order_id === j.order_id)
        const tw = jobTimeWindows[j.id] || {}
        return {
          ...j,
          status: existing?.status === 'pending' ? 'pending' : (j.status || 'pending'),
          priority: jobPriorities[j.id] || existing?.priority || j.priority || 'medium',
          timeFrom: tw.timeFrom ?? existing?.timeFrom ?? j.timeFrom ?? null,
          timeTo: tw.timeTo ?? existing?.timeTo ?? j.timeTo ?? null,
          timeStrict: tw.timeStrict ?? existing?.timeStrict ?? j.timeStrict ?? false,
        }
      })

      // Check if any strict jobs were not planned (came back from VRP unassigned)
      const plannedIds = new Set()
      data.plan.forEach(d => d.trucks.forEach(t => t.stops.forEach(s => { if (s.id) plannedIds.add(s.id) })))
      const failedStrict = mergedJobs.filter(j => j.status === 'todo' && j.timeStrict && !plannedIds.has(j.id) && (j.timeFrom != null || j.timeTo != null))
      if (failedStrict.length > 0) {
        failedStrict.forEach(j => { j.status = 'pending' })
        setAlert(T.alertImpossible + ' (' + failedStrict.length + ' job' + (failedStrict.length > 1 ? 's' : '') + ')')
        setTimeout(() => setAlert(null), 6000)
      }

      // Check for 2 drivers needed
      const twoDriverStops = []
      data.plan.forEach(d => d.trucks.forEach(t => t.stops.forEach(s => {
        if (s.needsTwoDrivers || (s.orderVolumes && s.orderVolumes.some(v => v >= 1.5))) {
          twoDriverStops.push(s.owner_name || s.address)
        }
      })))
      if (twoDriverStops.length > 0) {
        const names = twoDriverStops.slice(0, 3).join(', ')
        const alertMsg = lang === 'fr'
          ? `🚛🚛 Attention : ${twoDriverStops.length} stop(s) nécessitent 2 chauffeurs (order ≥ 1.5m³) : ${names}${twoDriverStops.length > 3 ? '...' : ''}`
          : `🚛🚛 Warning: ${twoDriverStops.length} stop(s) need 2 drivers (order ≥ 1.5m³): ${names}${twoDriverStops.length > 3 ? '...' : ''}`
        setAlert(prev => prev ? prev + '\n' + alertMsg : alertMsg)
        setTimeout(() => setAlert(null), 8000)
      }

      setAllJobs(mergedJobs); setPlan(data.plan); setDepotCoords(data.depot); setActiveTab('planning'); setNeedsRefresh(false)
    } catch (e) { setError(e.message) }
    finally { setLoading(false); setProgress('') }
  }

  const handleExport = () => {
    if (!plan.length) return
    const wb = XLSX.utils.book_new()
    plan.forEach(day => {
      day.trucks.forEach(truck => {
        const data = truck.stops.map((s,i) => ({
          [lang==='fr'?'Ordre':'Order']:i+1,
          Type:s.type==='picking'?(lang==='fr'?'Ramasse':'Pickup'):(lang==='fr'?'Livraison':'Delivery'),
          Owner:s.owner_name,
          [lang==='fr'?'Adresse':'Address']:s.address,
          [lang==='fr'?'Colis':'Parcels']:s.parcels||0,
          [lang==='fr'?'Volume m³':'Volume m³']:s.volumeM3||0,
          [lang==='fr'?'Temps sur place':'Service time']:(s.serviceTime||0)+' min',
          [lang==='fr'?'Arrivée':'Arrival']:s.arrivalTime,
          [lang==='fr'?'Départ':'Departure']:s.departureTime,
          [lang==='fr'?'Fenêtre de':'Window from']:s.timeFrom!=null?formatMinutes(s.timeFrom):'',
          [lang==='fr'?'Fenêtre à':'Window to']:s.timeTo!=null?formatMinutes(s.timeTo):'',
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'D'+day.day+'-T'+truck.truckId)
      })
    })
    XLSX.writeFile(wb, 'roundit_'+new Date().toISOString().slice(0,10)+'.xlsx')
  }

  const pendingJobs = allJobs.filter(j => j.status === 'pending')
  const todoJobs = allJobs.filter(j => j.status === 'todo')
  const doneJobs = allJobs.filter(j => j.status === 'done')
  const ecarteJobs = allJobs.filter(j => j.status === 'ecarte')
  const allRoutesFlat = plan.flatMap(d => d.trucks)
  const hasFiles = pickingFiles.length > 0 || deliveryFiles.length > 0

  return (
    <>
      <Head>
        <title>RoundIT</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      </Head>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#F4F7F5;--white:#fff;--navy:#1B7A6B;--blue:#2ECC8F;--blue-soft:#E8F8F3;--border:#D6EAE4;--text:#1E293B;--muted:#94A3B8;--success:#059669;--success-soft:#F0FDF4;--warning:#D97706;--warning-soft:#FFFBEB;--danger:#DC2626;--indigo:#6366F1;--indigo-soft:#EEF2FF;--sans:'DM Sans',sans-serif}
        html,body{background:var(--bg);color:var(--text);font-family:var(--sans);height:100%;overflow:hidden}
        #__next{height:100vh;display:flex;flex-direction:column}
        input{font-family:var(--sans)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
        .drop-zone{transition:all 0.2s ease}
        .drop-zone-active{box-shadow:inset 0 0 0 2px var(--navy);transform:scale(1.01)}
        .drag-item{cursor:grab;transition:opacity 0.15s,transform 0.15s}
        .drag-item:active{cursor:grabbing;opacity:0.7;transform:scale(0.98)}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000}
        .modal-box{background:var(--white);border-radius:14px;padding:24px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.15)}
      `}</style>
      <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>

        {/* ─── Merge modal ─── */}
        {mergeModal && (
          <div className="modal-overlay" onClick={() => setMergeModal(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div style={{fontSize:15,fontWeight:700,color:'var(--navy)',marginBottom:4}}>{T.importTitle}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>{T.importMsg}</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <button onClick={() => handleMergeChoice('add')} style={{padding:'12px 16px',background:'var(--blue-soft)',border:'1.5px solid var(--blue)',borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--navy)'}}>{T.importAdd}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{T.importAddDesc}</div>
                </button>
                <button onClick={() => handleMergeChoice('replace')} style={{padding:'12px 16px',background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--danger)'}}>{T.importReplace}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{T.importReplaceDesc}</div>
                </button>
              </div>
              <button onClick={() => setMergeModal(null)} style={{marginTop:12,width:'100%',padding:'8px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,color:'var(--muted)',cursor:'pointer',fontWeight:600}}>{T.importCancel}</button>
            </div>
          </div>
        )}

        {/* ─── Top bar ─── */}
        <div style={{background:'var(--white)',borderBottom:'1px solid var(--border)',padding:'10px 20px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginRight:4}}>
            <span style={{fontSize:14,fontWeight:700}}><span style={{color:'#1B7A6B'}}>Round</span><span style={{color:'#2ECC8F'}}>it</span></span>
          </div>
          <button onClick={() => setLang(l => l==='fr'?'en':'fr')} style={{padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:700,color:'var(--navy)',background:'var(--bg)',cursor:'pointer'}}>{lang==='fr'?'🇬🇧 EN':'🇫🇷 FR'}</button>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <UploadZone label={T.pickingCsv} files={pickingFiles} onFile={f => handleFileSelect(f,'picking')} inputRef={pickRef}/>
          <UploadZone label={T.deliveryCsv} files={deliveryFiles} onFile={f => handleFileSelect(f,'delivery')} inputRef={delRef}/>
          {hasFiles && <button onClick={handleReset} style={{padding:'4px 8px',border:'1px solid #FECACA',borderRadius:6,fontSize:10,fontWeight:600,color:'var(--danger)',background:'#FEF2F2',cursor:'pointer'}}>{T.reset}</button>}
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <Param label={T.depot}><input value={depot} onChange={e => saveDepot(e.target.value)} placeholder={T.depotPlaceholder} style={{width:190,padding:'6px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none'}}/></Param>
          <Param label={T.trucks}><Counter value={numTrucks} min={1} max={10} onChange={saveTrucks}/></Param>
          <Param label={T.days}><Counter value={numDays} min={1} max={14} onChange={setNumDays}/></Param>
          <Param label={T.start}><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none'}}/></Param>
          <Param label={T.end}><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none'}}/></Param>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <Param label={T.maxParcels}><input value={maxParcels} onChange={e => setMaxParcels(e.target.value.replace(/[^0-9]/g,''))} placeholder="∞" style={{width:48,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none',textAlign:'center'}}/></Param>
          <Param label={T.maxVolume}><input value={maxVolume} onChange={e => setMaxVolume(e.target.value.replace(/[^0-9.,]/g,'').replace(',','.'))} placeholder="∞" style={{width:48,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none',textAlign:'center'}}/></Param>
          <button onClick={handleOptimize} disabled={loading||!hasFiles} style={{marginLeft:'auto',padding:'8px 18px',background:loading||!hasFiles?'var(--border)':'var(--navy)',color:loading||!hasFiles?'var(--muted)':'#fff',fontSize:13,fontWeight:600,border:'none',borderRadius:8,cursor:'pointer',whiteSpace:'nowrap'}}>
            {loading ? T.optimizing : todoJobs.length > 0 ? T.optimizeSel.replace('{n}',todoJobs.length) : T.optimizeAll}
          </button>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          {userEmail && <span style={{fontSize:11,color:'var(--muted)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</span>}
          <button onClick={handleLogout} style={{padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,color:'var(--danger)',background:'var(--bg)',cursor:'pointer'}}>{T.logout}</button>
        </div>

        {error && <div style={{background:'#FEF2F2',borderBottom:'1px solid #FECACA',padding:'8px 20px',fontSize:12,color:'var(--danger)'}}>⚠️ {error}</div>}
        {alert && <div style={{background:'#FFFBEB',borderBottom:'1px solid #FDE68A',padding:'8px 20px',fontSize:12,color:'var(--warning)',fontWeight:600}}>{alert}</div>}
        {needsRefresh && (
          <div style={{background:'var(--blue-soft)',borderBottom:'1px solid var(--blue)',padding:'8px 20px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:12,color:'var(--navy)',fontWeight:500,flex:1}}>{lang==='fr'?'Nouveau fichier importé — cliquez Rafraîchir pour mettre à jour les jobs':'New file imported — click Refresh to update jobs'}</span>
            <button onClick={handleOptimize} disabled={loading}
              style={{padding:'6px 16px',background:'var(--navy)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
              {loading ? '⏳' : (lang==='fr'?'🔄 Rafraîchir':'🔄 Refresh')}
            </button>
          </div>
        )}

        <div style={{flex:1,display:'flex',overflow:'hidden'}}>
          {/* ─── Map ─── */}
          <div style={{flex:1,position:'relative',overflow:'hidden',background:'#E8EDF5'}}>
            {allJobs.length === 0 ? (
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--muted)'}}>
                <div style={{fontSize:48,opacity:.2}}>🗺️</div>
                <div style={{fontSize:14,fontWeight:500}}>{T.mapPlaceholder}</div>
                <div style={{fontSize:12}}>{T.mapSub}</div>
                {loading && <div style={{fontSize:12,color:'var(--blue)',marginTop:8}}>{progress}</div>}
              </div>
            ) : (
              <MapView jobs={allJobs} routes={allRoutesFlat} depot={depotCoords} highlightTruck={highlightTruck} onStatusChange={updateStatus} onSelect={id => selectForRoute(id)} selectedIds={todoJobs.map(j=>j.id)} lang={lang} showRoutes={showRoutes}/>
            )}
            {allJobs.length > 0 && (
              <div style={{position:'absolute',top:12,left:12,display:'flex',gap:6}}>
                <button onClick={() => setShowRoutes(r => !r)}
                  style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:600,color:showRoutes?'var(--navy)':'var(--muted)',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',cursor:'pointer'}}>
                  {showRoutes ? (lang==='fr'?'🗺 Masquer routes':'🗺 Hide routes') : (lang==='fr'?'🗺 Afficher routes':'🗺 Show routes')}
                </button>
              </div>
            )}
            {allJobs.length > 0 && (
              <div style={{position:'absolute',top:12,right:12,display:'flex',gap:8}}>
                {[{l:T.total,v:allJobs.length},{l:T.pending,v:pendingJobs.length,c:'var(--indigo)'},{l:T.todo,v:todoJobs.length},{l:T.done,v:doneJobs.length},{l:T.ecarte,v:ecarteJobs.length}].map(s => (
                  <div key={s.l} style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:600,color:s.c||'var(--navy)',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    <span style={{color:'var(--muted)',fontWeight:400}}>{s.l} </span>{s.v}
                  </div>
                ))}
              </div>
            )}
            {allJobs.length > 0 && (
              <div style={{position:'absolute',bottom:16,left:16,background:'var(--white)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--navy)',marginBottom:6}}>{T.statuses}</div>
                {[['pending',T.statusPending],['todo',T.statusTodo],['done',T.statusDone],['ecarte',T.statusEcarte]].map(([k,v]) => (
                  <div key={k} style={{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--text)',marginBottom:3}}>
                    <div style={{width:9,height:9,borderRadius:'50%',background:STATUS_COLORS[k]}}/>{v}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Side panel ─── */}
          {allJobs.length > 0 && (
            <div style={{width:420,background:'var(--white)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {/* ─── Top: tabs + action buttons ─── */}
              <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
                {['jobs','planning'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{flex:1,padding:'10px 0',fontSize:12,fontWeight:600,background:'none',cursor:'pointer',color:activeTab===tab?'var(--navy)':'var(--muted)',border:'none',borderBottom:activeTab===tab?'2px solid var(--blue)':'2px solid transparent'}}>
                    {tab==='jobs' ? T.jobs+' ('+allJobs.length+')' : T.planning+' '+numDays+'j'}
                  </button>
                ))}
              </div>
              <div style={{padding:'8px 12px',borderBottom:'1px solid var(--border)',display:'flex',gap:8}}>
                {activeTab === 'jobs' ? (
                  <>
                    <button onClick={selectAllPending} style={{flex:1,padding:'8px',background:'var(--indigo-soft)',border:'1px solid var(--indigo)',borderRadius:8,fontSize:11,fontWeight:600,color:'var(--indigo)',cursor:'pointer'}}>{T.selectAllPending}</button>
                    <button onClick={handleOptimize} disabled={loading} style={{flex:1,padding:'8px',background:'var(--navy)',color:'#fff',border:'none',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      {todoJobs.length > 0 ? T.optimizeBtn+' ('+todoJobs.length+')' : T.optimizeBtn}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleExport} style={{flex:1,padding:'8px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:11,fontWeight:600,color:'var(--navy)',cursor:'pointer'}}>{T.exportExcel}</button>
                    <button onClick={handleOptimize} disabled={loading} style={{flex:1,padding:'8px',background:'var(--navy)',color:'#fff',border:'none',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer'}}>{T.recalculate}</button>
                  </>
                )}
              </div>

              {/* ─── Middle: scrollable content ─── */}
              {activeTab === 'jobs' && (
                <div style={{flex:1,overflowY:'auto',padding:10,minHeight:0}}>
                  {pendingJobs.length > 0 && (
                    <div style={{marginBottom:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                        <SectionLabel>{T.pendingSection} — {pendingJobs.length}</SectionLabel>
                        <button onClick={selectAllPending} style={{marginLeft:'auto',padding:'3px 8px',borderRadius:5,fontSize:9,fontWeight:700,background:'var(--indigo-soft)',color:'var(--indigo)',border:'none',cursor:'pointer'}}>{T.selectAllPending}</button>
                      </div>
                      {pendingJobs.map(job => (
                        <JobItem key={job.id} job={job} lang={lang}
                          onStatus={s => updateStatus(job.id, s)}
                          onUpdateJob={f => updateJob(job.id, f)}
                          onSelectForRoute={() => selectForRoute(job.id)}
                          T={T}/>
                      ))}
                    </div>
                  )}
                  {todoJobs.length > 0 && (
                    <>
                      <SectionLabel>{T.todoSection} — {todoJobs.length}</SectionLabel>
                      <div style={{fontSize:9,color:'var(--muted)',textAlign:'center',marginBottom:6,fontWeight:500}}>{T.dragHint}</div>
                      {PRIORITY_ZONES.map(zone => {
                        const jobsInZone = todoJobs.filter(j => (j.priority||'medium') === zone.key)
                        const isOver = dragOverZone === zone.key
                        return (
                          <div key={zone.key} className={'drop-zone'+(isOver?' drop-zone-active':'')}
                            onDragOver={e => handleDragOver(e, zone.key)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, zone.key)}
                            style={{marginBottom:8,borderRadius:10,border:'1.5px dashed '+(isOver?'var(--navy)':zone.border),background:isOver?zone.bg:'transparent',padding:'6px 8px',minHeight:44}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:jobsInZone.length>0?6:0}}>
                              <span style={{fontSize:10,color:zone.color,fontWeight:700}}>{zone.icon}</span>
                              <span style={{fontSize:10,fontWeight:700,color:zone.color,flex:1}}>{PRIORITY_LABELS[lang][zone.key]}</span>
                              <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>{jobsInZone.length}</span>
                            </div>
                            {jobsInZone.map(job => (
                              <JobItem key={job.id} job={job} lang={lang}
                                onStatus={s => updateStatus(job.id, s)}
                                onDragStart={e => handleDragStart(e, job.id)}
                                onUpdateJob={f => updateJob(job.id, f)}
                                onUnselectFromRoute={() => unselectFromRoute(job.id)}
                                T={T}/>
                            ))}
                            {jobsInZone.length === 0 && <div style={{fontSize:10,color:'var(--muted)',textAlign:'center',padding:'4px 0',opacity:0.6}}>{lang==='fr'?'Déposez ici':'Drop here'}</div>}
                          </div>
                        )
                      })}
                    </>
                  )}
                  {doneJobs.length > 0 && <><SectionLabel mt>{T.doneSection} — {doneJobs.length}</SectionLabel>{doneJobs.map(j => <JobItem key={j.id} job={j} lang={lang} onStatus={s => updateStatus(j.id,s)} onUpdateJob={f => updateJob(j.id,f)} T={T}/>)}</>}
                  {ecarteJobs.length > 0 && <><SectionLabel mt>{T.ecarteSection} — {ecarteJobs.length}</SectionLabel>{ecarteJobs.map(j => <JobItem key={j.id} job={j} lang={lang} onStatus={s => updateStatus(j.id,s)} onUpdateJob={f => updateJob(j.id,f)} T={T}/>)}</>}
                </div>
              )}

              {activeTab === 'planning' && (
                <div style={{flex:1,overflowY:'auto',padding:10,minHeight:0}}>
                  {plan.length === 0
                    ? <div style={{textAlign:'center',color:'var(--muted)',fontSize:12,marginTop:40}}>{T.launchOptim}</div>
                    : plan.map((day,di) => <DayBlock key={day.day} day={day} dayIdx={di} colors={COLORS} onHover={setHighlightTruck} T={T} lang={lang}
                        onPlanDragStart={handlePlanDragStart} onPlanDragOver={handlePlanDragOver} onPlanDragLeave={handlePlanDragLeave} onPlanDrop={handlePlanDrop} planDragOver={planDragOver}/>)
                  }
                </div>
              )}

              {/* ─── Bottom: Chat It ─── */}
              <ChatPanel lang={lang} allJobs={allJobs} plan={plan} depotCoords={depotCoords}/>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Job item — bigger & more readable ─── */

function JobItem({ job, lang, onStatus, onDragStart, onUpdateJob, onSelectForRoute, onUnselectFromRoute, T }) {
  const [open, setOpen] = useState(false)
  const isDraggable = job.status === 'todo' && !!onDragStart
  const hasMeta = (job.parcels && job.parcels > 0) || (job.volumeM3 && job.volumeM3 > 0)
  const hasWindow = job.timeFrom != null || job.timeTo != null
  const isPending = job.status === 'pending'
  const isTodo = job.status === 'todo'

  const minToTime = m => { if (m==null) return ''; const h=Math.floor(m/60),mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0') }
  const timeToMin = s => { if (!s) return null; const [h,m]=s.split(':').map(Number); return h*60+(m||0) }

  return (
    <div style={{position:'relative',marginBottom:5}}>
      <div draggable={isDraggable} onDragStart={isDraggable?onDragStart:undefined} className={isDraggable?'drag-item':''}
        onClick={() => setOpen(!open)}
        style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:open?'10px 10px 0 0':'10px',
          border:'1px solid '+(open?'var(--border)':'transparent'),
          background:isPending?'var(--indigo-soft)':isTodo?'var(--white)':job.status==='ecarte'?'var(--warning-soft)':'var(--white)',
          cursor:isDraggable?'grab':'pointer',opacity:job.status==='done'?.45:1}}>
        {isDraggable && <span style={{fontSize:13,color:'var(--muted)',cursor:'grab',flexShrink:0,userSelect:'none'}}>⠿</span>}
        <div style={{width:10,height:10,borderRadius:'50%',background:STATUS_COLORS[job.status],flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.owner_name||job.address}</div>
          <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:1}}>{job.address}</div>
          <div style={{display:'flex',gap:8,marginTop:3,flexWrap:'wrap'}}>
            {hasMeta && job.parcels>0 && <span style={{fontSize:10,color:'var(--muted)'}}>📦 {job.parcels} {T.parcels}</span>}
            {hasMeta && job.volumeM3>0 && <span style={{fontSize:10,color:'var(--muted)'}}>📐 {job.volumeM3} {T.volume}</span>}
            {hasWindow && <span style={{fontSize:10,color:job.timeStrict?'var(--danger)':'#0891B2',fontWeight:500}}>{job.timeStrict?'🔒':'🕐'} {minToTime(job.timeFrom)||'...'}-{minToTime(job.timeTo)||'...'}</span>}
          </div>
        </div>
        {isPending && onSelectForRoute && (
          <button onClick={e => { e.stopPropagation(); onSelectForRoute() }}
            style={{padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:'var(--blue-soft)',color:'var(--navy)',border:'1px solid var(--blue)',cursor:'pointer',whiteSpace:'nowrap'}}>
            {T.selectForRoute}
          </button>
        )}
        {isTodo && onUnselectFromRoute && (
          <button onClick={e => { e.stopPropagation(); onUnselectFromRoute() }}
            style={{padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:'var(--indigo-soft)',color:'var(--indigo)',border:'1px solid var(--indigo)',cursor:'pointer',whiteSpace:'nowrap'}}>
            {T.unselectFromRoute}
          </button>
        )}
        <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6,background:STATUS_BG[job.status],color:STATUS_COLORS[job.status],flexShrink:0}}>
          {job.status==='pending'?T.statusPending:job.status==='todo'?T.statusTodo:job.status==='done'?T.statusDone:T.statusEcarte}
        </span>
        <span style={{fontSize:13,color:open?'var(--navy)':'var(--muted)',cursor:'pointer',flexShrink:0,fontWeight:open?700:400}} onClick={e=>{e.stopPropagation();setOpen(!open)}}>{open?'✕':'⋯'}</span>
      </div>
      {open && (
        <div style={{border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 10px 10px',background:'var(--white)',padding:'10px 12px',display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.04em'}}>{T.timeWindow}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="time" value={minToTime(job.timeFrom)} onChange={e => onUpdateJob?.({ timeFrom:timeToMin(e.target.value) })} style={{flex:1,padding:'7px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,outline:'none'}}/>
              <span style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>→</span>
              <input type="time" value={minToTime(job.timeTo)} onChange={e => onUpdateJob?.({ timeTo:timeToMin(e.target.value) })} style={{flex:1,padding:'7px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,outline:'none'}}/>
              {hasWindow && <span onClick={() => onUpdateJob?.({ timeFrom:null,timeTo:null,timeStrict:false })} style={{fontSize:11,color:'var(--danger)',cursor:'pointer',fontWeight:700,padding:'4px'}}>✕</span>}
            </div>
          </div>
          {hasWindow && (
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => onUpdateJob?.({ timeStrict:true })} style={{flex:1,padding:'7px',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',border:job.timeStrict?'2px solid var(--danger)':'1px solid var(--border)',background:job.timeStrict?'#FEF2F2':'var(--white)',color:job.timeStrict?'var(--danger)':'var(--muted)'}}>🔒 {T.strict}</button>
              <button onClick={() => onUpdateJob?.({ timeStrict:false })} style={{flex:1,padding:'7px',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',border:!job.timeStrict?'2px solid #0891B2':'1px solid var(--border)',background:!job.timeStrict?'#ECFEFF':'var(--white)',color:!job.timeStrict?'#0891B2':'var(--muted)'}}>🕐 {T.flexible}</button>
            </div>
          )}
          <div style={{display:'flex',gap:5,borderTop:'1px solid var(--border)',paddingTop:8}}>
            <button onClick={()=>{onStatus('pending');setOpen(false)}} style={{flex:1,padding:'7px',borderRadius:7,background:'var(--indigo-soft)',color:'var(--indigo)',fontSize:11,fontWeight:700,cursor:'pointer',border:'none'}}>{T.statusPending}</button>
            <button onClick={()=>{onStatus('todo');setOpen(false)}} style={{flex:1,padding:'7px',borderRadius:7,background:'var(--blue-soft)',color:'var(--blue)',fontSize:11,fontWeight:700,cursor:'pointer',border:'none'}}>{T.statusTodo}</button>
            <button onClick={()=>{onStatus('done');setOpen(false)}} style={{flex:1,padding:'7px',borderRadius:7,background:'var(--success-soft)',color:'var(--success)',fontSize:11,fontWeight:700,cursor:'pointer',border:'none'}}>✅ {T.statusDone}</button>
            <button onClick={()=>{onStatus('ecarte');setOpen(false)}} style={{flex:1,padding:'7px',borderRadius:7,background:'var(--warning-soft)',color:'var(--warning)',fontSize:11,fontWeight:700,cursor:'pointer',border:'none'}}>🔶</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Day block with drag & drop ─── */

function DayBlock({ day, dayIdx, colors, onHover, T, lang, onPlanDragStart, onPlanDragOver, onPlanDragLeave, onPlanDrop, planDragOver }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'var(--bg)',borderRadius:8,marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:'var(--navy)',flex:1}}>{T.day} {day.day}</span>
        <span style={{fontSize:10,color:'var(--muted)'}}>{day.trucks.reduce((s,t)=>s+t.stops.length,0)} {T.stops}</span>
      </div>
      {day.trucks.map((truck,ti) => {
        const isOver = planDragOver && planDragOver.dayIdx===dayIdx && planDragOver.truckIdx===ti
        return (
          <div key={truck.truckId} style={{marginBottom:6,paddingLeft:4,borderRadius:8,border:isOver?'1.5px dashed var(--navy)':'1.5px dashed transparent',background:isOver?'var(--blue-soft)':'transparent',transition:'all 0.15s'}}
            onMouseEnter={()=>onHover(truck.truckId)} onMouseLeave={()=>onHover(null)}
            onDragOver={e => onPlanDragOver(e,dayIdx,ti)} onDragLeave={onPlanDragLeave} onDrop={e => onPlanDrop(e,dayIdx,ti)}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap',padding:'4px 4px 0'}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:colors[ti%colors.length]}}/>
              <span style={{fontSize:11,fontWeight:600,color:'var(--navy)'}}>{T.truck} {truck.truckId}</span>
              <span style={{fontSize:10,color:'var(--muted)',marginLeft:'auto'}}>{truck.totalDistance} {T.km} · {T.return} {truck.returnTime}</span>
            </div>
            {(truck.totalParcels>0||truck.totalVolumeM3>0) && (
              <div style={{display:'flex',gap:10,paddingLeft:14,marginBottom:4}}>
                {truck.totalParcels>0 && <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>📦 {truck.totalParcels} {T.parcels}</span>}
                {truck.totalVolumeM3>0 && <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>📐 {truck.totalVolumeM3} {T.volume}</span>}
              </div>
            )}
            {truck.stops.map((stop,si) => (
              <div key={si} draggable onDragStart={e => onPlanDragStart(e,dayIdx,ti,si)} onDrop={e => {e.stopPropagation();onPlanDrop(e,dayIdx,ti,si)}} onDragOver={e => {e.preventDefault();e.stopPropagation()}}
                className="drag-item"
                style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px 5px 14px',borderRadius:6,marginBottom:2,borderLeft:'2px solid '+colors[ti%colors.length],background:stop.lateBy>0?'#FEF2F2':colors[ti%colors.length]+'10',cursor:'grab'}}>
                <span style={{fontSize:9,color:'var(--muted)',cursor:'grab',flexShrink:0,userSelect:'none'}}>⠿</span>
                <span style={{fontSize:10,fontWeight:600,color:colors[ti%colors.length],minWidth:38}}>{stop.arrivalTime}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{stop.owner_name||stop.address}</div>
                  <div style={{display:'flex',gap:6,marginTop:1,flexWrap:'wrap'}}>
                    <span style={{fontSize:8,color:'var(--navy)',fontWeight:600}}>⏱ {stop.serviceTime||0} min</span>
                    {stop.waitTime>0 && <span style={{fontSize:8,color:'#0891B2',fontWeight:500}}>⏸ {stop.waitTime} min</span>}
                    {stop.lateBy>0 && <span style={{fontSize:8,color:'var(--danger)',fontWeight:600}}>⚠ +{stop.lateBy} min</span>}
                    {(stop.timeFrom!=null||stop.timeTo!=null) && (
                      <span style={{fontSize:8,color:stop.timeStrict?'var(--danger)':'var(--muted)',fontWeight:500}}>
                        {stop.timeStrict?'🔒':'🕐'} {stop.timeFrom!=null?formatMinutes(stop.timeFrom):'...'}-{stop.timeTo!=null?formatMinutes(stop.timeTo):'...'}
                      </span>
                    )}
                  </div>
                </div>
                {stop.parcels>0 && <span style={{fontSize:8,color:'var(--muted)'}}>{stop.parcels}📦</span>}
                {(stop.needsTwoDrivers || (stop.orderVolumes && stop.orderVolumes.some(v => v >= 1.5))) && (
                  <span style={{fontSize:10,flexShrink:0}} title="2 drivers needed">⚠️💪</span>
                )}
                <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:stop.type==='picking'?'#FEF3C7':'var(--blue-soft)',color:stop.type==='picking'?'#B45309':'var(--blue)'}}>{stop.type==='picking'?'P':'D'}</span>
              </div>
            ))}
            {truck.stops.length===0 && <div style={{fontSize:10,color:'var(--muted)',textAlign:'center',padding:'8px 0',opacity:0.6}}>{lang==='fr'?'Déposez ici':'Drop here'}</div>}
          </div>
        )
      })}
    </div>
  )
}

function SectionLabel({ children, mt }) { return <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',padding:'4px 6px',marginBottom:4,marginTop:mt?8:0}}>{children}</div> }
function formatMinutes(min) { const h=Math.floor(min/60),m=min%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0') }

function UploadZone({ label, files, onFile, inputRef }) {
  const count = files.length
  return (
    <div onClick={() => inputRef.current?.click()} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 12px',border:'1.5px '+(count>0?'solid':'dashed')+' '+(count>0?'var(--success)':'var(--border)'),borderRadius:8,cursor:'pointer',background:count>0?'var(--success-soft)':'var(--bg)',fontSize:12,fontWeight:500,color:count>0?'var(--success)':'var(--muted)',whiteSpace:'nowrap'}}>
      <span>{count>0?'✅':'📂'}</span><span>{count>0?count+' '+label:'+ '+label}</span>
      <input ref={inputRef} type="file" accept=".csv" style={{display:'none'}} onChange={e => {onFile(e.target.files[0]);e.target.value=''}}/>
    </div>
  )
}
function Param({ label, children }) { return <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11,fontWeight:600,color:'var(--muted)',whiteSpace:'nowrap'}}>{label}</span>{children}</div> }
function Counter({ value, min, max, onChange }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:4}}>
      <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:22,height:22,border:'1px solid var(--border)',borderRadius:5,background:'var(--white)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--navy)'}}>−</button>
      <span style={{fontSize:13,fontWeight:700,color:'var(--navy)',width:20,textAlign:'center'}}>{value}</span>
      <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:22,height:22,border:'1px solid var(--border)',borderRadius:5,background:'var(--white)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--navy)'}}>+</button>
    </div>
  )
}
