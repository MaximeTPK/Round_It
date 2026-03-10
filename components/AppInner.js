import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import * as XLSX from 'xlsx'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

function getClient() {
  if (!window.__sb) {
    const { createClient } = require('@supabase/supabase-js')
    window.__sb = createClient('https://yqjenhpaohwunjvgmlyw.supabase.co', ANON_KEY)
  }
  return window.__sb
}

const MapView = dynamic(() => import('./MapView'), { ssr: false })

const COLORS = ['#2ECC8F', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const DEPOT_KEY = 'roundit_depot'
const TRUCKS_KEY = 'roundit_trucks'

const PRIORITY_ZONES = [
  { key: 'high', icon: '▲', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { key: 'medium', icon: '●', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { key: 'low', icon: '▼', color: '#94A3B8', bg: '#F1F5F9', border: '#CBD5E1' },
]

const PRIORITY_LABELS = {
  fr: { high: 'Haute priorité', medium: 'Priorité normale', low: 'Basse priorité' },
  en: { high: 'High priority', medium: 'Normal priority', low: 'Low priority' },
}

const I18N = {
  fr: {
    brand: 'RoundIT', pickingCsv: 'Picking CSV', deliveryCsv: 'Delivery CSV',
    depot: 'Dépôt', depotPlaceholder: 'Adresse du dépôt', trucks: 'Camions',
    days: 'Jours', start: 'Départ', end: 'Fin',
    optimizeAll: 'Optimiser tout →', optimizeSel: 'Optimiser ({n}) →', optimizing: '⏳ Géocodage...',
    mapPlaceholder: 'La carte apparaîtra ici', mapSub: 'Uploadez vos fichiers CSV et cliquez sur Optimiser',
    total: 'Total', todo: 'À faire', done: 'Faits', ecarte: 'Écartés', statuses: 'Statuts',
    statusTodo: 'À faire', statusDone: 'Fait', statusEcarte: 'Écarté',
    jobs: 'Jobs', planning: 'Planning', todoSection: 'À faire', doneSection: 'Faits', ecarteSection: 'Écartés',
    selectAll: 'Tout sélectionner', recalculate: 'Recalculer', exportExcel: '↓ Export Excel',
    optimizeBtn: 'Optimiser', launchOptim: "Lance l'optimisation pour voir le planning",
    day: 'Jour', stops: 'stops', truck: 'Camion', km: 'km', return: 'retour', selected: 'Sélectionné',
    errorFile: 'Chargez au moins un fichier', errorDepot: "Saisissez l'adresse du dépôt",
    logout: 'Déconnexion',
    maxParcels: 'Max colis', maxVolume: 'Max m³',
    parcels: 'colis', volume: 'm³', serviceTime: 'min',
    capacity: 'Capacité', dragHint: 'Glissez les jobs entre les zones',
    importTitle: 'Import CSV', importMsg: 'Des jobs existent déjà. Que souhaitez-vous faire ?',
    importAdd: '+ Ajouter', importReplace: '↻ Remplacer tout', importCancel: 'Annuler',
    importAddDesc: 'Les nouveaux jobs seront ajoutés (doublons ignorés)',
    importReplaceDesc: 'Tous les jobs actuels seront supprimés',
    reset: 'Reset',
  },
  en: {
    brand: 'RoundIT', pickingCsv: 'Picking CSV', deliveryCsv: 'Delivery CSV',
    depot: 'Depot', depotPlaceholder: 'Depot address', trucks: 'Trucks',
    days: 'Days', start: 'Start', end: 'End',
    optimizeAll: 'Optimize all →', optimizeSel: 'Optimize ({n}) →', optimizing: '⏳ Geocoding...',
    mapPlaceholder: 'Map will appear here', mapSub: 'Upload your CSV files and click Optimize',
    total: 'Total', todo: 'To do', done: 'Done', ecarte: 'Skipped', statuses: 'Statuses',
    statusTodo: 'To do', statusDone: 'Done', statusEcarte: 'Skipped',
    jobs: 'Jobs', planning: 'Planning', todoSection: 'To do', doneSection: 'Done', ecarteSection: 'Skipped',
    selectAll: 'Select all', recalculate: 'Recalculate', exportExcel: '↓ Export Excel',
    optimizeBtn: 'Optimize', launchOptim: 'Run optimization to see the planning',
    day: 'Day', stops: 'stops', truck: 'Truck', km: 'km', return: 'return', selected: 'Selected',
    errorFile: 'Load at least one file', errorDepot: 'Enter the depot address',
    logout: 'Logout',
    maxParcels: 'Max parcels', maxVolume: 'Max m³',
    parcels: 'parcels', volume: 'm³', serviceTime: 'min',
    capacity: 'Capacity', dragHint: 'Drag jobs between zones',
    importTitle: 'CSV Import', importMsg: 'Jobs already exist. What would you like to do?',
    importAdd: '+ Add', importReplace: '↻ Replace all', importCancel: 'Cancel',
    importAddDesc: 'New jobs will be added (duplicates ignored)',
    importReplaceDesc: 'All current jobs will be removed',
    reset: 'Reset',
  }
}

const STATUS_COLORS = { todo: '#2ECC8F', done: '#059669', ecarte: '#D97706' }
const STATUS_BG = { todo: '#EFF6FF', done: '#F0FDF4', ecarte: '#FFFBEB' }

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
  const [allJobs, setAllJobs] = useState([])
  const [plan, setPlan] = useState([])
  const [depotCoords, setDepotCoords] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeTab, setActiveTab] = useState('jobs')
  const [highlightTruck, setHighlightTruck] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [dragOverZone, setDragOverZone] = useState(null)
  const [mergeModal, setMergeModal] = useState(null) // { type: 'picking'|'delivery', file: File }
  const pickRef = useRef()
  const delRef = useRef()
  const T = I18N[lang]

  useEffect(() => {
    const savedDepot = localStorage.getItem(DEPOT_KEY)
    const savedTrucks = localStorage.getItem(TRUCKS_KEY)
    if (savedDepot) setDepot(savedDepot)
    if (savedTrucks) setNumTrucks(parseInt(savedTrucks))
    getClient().auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserEmail(session.user.email)
      else window.location.href = '/login'
    })
  }, [])

  const saveDepot = v => { setDepot(v); localStorage.setItem(DEPOT_KEY, v) }
  const saveTrucks = v => { setNumTrucks(v); localStorage.setItem(TRUCKS_KEY, v) }

  const handleLogout = async () => {
    await getClient().auth.signOut()
    window.location.href = '/login'
  }

  const getToken = async () => {
    const { data: { session } } = await getClient().auth.getSession()
    return session?.access_token || null
  }

  // ─── File import with merge/replace modal ───
  const handleFileSelect = (file, type) => {
    if (!file) return
    // Si des jobs existent déjà, demander merge ou replace
    if (allJobs.length > 0) {
      setMergeModal({ type, file })
    } else {
      // Premier import → ajouter directement
      addFile(file, type)
    }
  }

  const addFile = (file, type) => {
    if (type === 'picking') {
      setPickingFiles(prev => [...prev, file])
    } else {
      setDeliveryFiles(prev => [...prev, file])
    }
  }

  const handleMergeChoice = (mode) => {
    if (!mergeModal) return
    const { type, file } = mergeModal
    if (mode === 'replace') {
      // Vider tout et repartir de zéro
      setAllJobs([])
      setPlan([])
      setSelectedIds([])
      setPickingFiles([])
      setDeliveryFiles([])
    }
    addFile(file, type)
    setMergeModal(null)
  }

  const handleReset = () => {
    setAllJobs([])
    setPlan([])
    setSelectedIds([])
    setPickingFiles([])
    setDeliveryFiles([])
    setDepotCoords(null)
    if (pickRef.current) pickRef.current.value = ''
    if (delRef.current) delRef.current.value = ''
  }

  // ─── Drag & drop priority ───
  const handleDragStart = (e, jobId) => {
    e.dataTransfer.setData('text/plain', jobId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, zone) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverZone(zone)
  }

  const handleDragLeave = () => {
    setDragOverZone(null)
  }

  const handleDrop = (e, targetPriority) => {
    e.preventDefault()
    setDragOverZone(null)
    const jobId = e.dataTransfer.getData('text/plain')
    if (!jobId) return
    setAllJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, priority: targetPriority } : j
    ))
  }

  const handleOptimize = async () => {
    if (pickingFiles.length === 0 && deliveryFiles.length === 0) return setError(T.errorFile)
    if (!depot) return setError(T.errorDepot)
    setLoading(true); setError(null); setProgress(T.optimizing)
    try {
      const token = await getToken()
      const formData = new FormData()
      // Envoyer tous les fichiers picking et delivery
      pickingFiles.forEach(f => formData.append('picking', f))
      deliveryFiles.forEach(f => formData.append('delivery', f))

      const truckCapacity = {}
      if (maxParcels && parseInt(maxParcels) > 0) truckCapacity.maxParcels = parseInt(maxParcels)
      if (maxVolume && parseFloat(maxVolume) > 0) truckCapacity.maxVolumeM3 = parseFloat(maxVolume)

      const jobPriorities = {}
      allJobs.forEach(j => {
        if (j.priority && j.priority !== 'medium') {
          jobPriorities[j.id] = j.priority
        }
      })

      formData.append('config', JSON.stringify({
        depotAddress: depot, numTrucks, numDays, startTime, endTime,
        sessionDate: new Date().toISOString().slice(0, 10),
        selectedIds: selectedIds.length > 0 ? selectedIds : null,
        truckCapacity: Object.keys(truckCapacity).length > 0 ? truckCapacity : null,
        jobPriorities,
      }))
      const res = await fetch('/api/optimize', {
        method: 'POST', body: formData,
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Conserver les priorités définies par drag & drop
      const mergedJobs = data.allJobs.map(j => ({
        ...j,
        priority: jobPriorities[j.id] || j.priority || 'medium'
      }))
      setAllJobs(mergedJobs); setPlan(data.plan); setDepotCoords(data.depot); setActiveTab('planning')
    } catch (e) { setError(e.message) }
    finally { setLoading(false); setProgress('') }
  }

  const updateStatus = async (id, status) => {
    if (!id) return
    setAllJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j))
    const token = await getToken()
    await fetch('/api/jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ id, status }),
    })
  }

  const toggleSelect = (id) => {
    if (!id) return
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const selectAll = () => setSelectedIds(allJobs.filter(j => j.status === 'todo').map(j => j.id))

  const handleExport = () => {
    if (!plan.length) return
    const wb = XLSX.utils.book_new()
    plan.forEach(day => {
      day.trucks.forEach(truck => {
        const data = truck.stops.map((s, i) => ({
          [lang === 'fr' ? 'Ordre' : 'Order']: i + 1,
          Type: s.type === 'picking' ? (lang === 'fr' ? 'Ramasse' : 'Pickup') : (lang === 'fr' ? 'Livraison' : 'Delivery'),
          Owner: s.owner_name,
          [lang === 'fr' ? 'Adresse' : 'Address']: s.address,
          [lang === 'fr' ? 'Colis' : 'Parcels']: s.parcels || 0,
          [lang === 'fr' ? 'Volume m³' : 'Volume m³']: s.volumeM3 || 0,
          [lang === 'fr' ? 'Temps sur place' : 'Service time']: s.serviceTime || '',
          [lang === 'fr' ? 'Arrivée' : 'Arrival']: s.arrivalTime,
          [lang === 'fr' ? 'Départ' : 'Departure']: s.departureTime,
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'D' + day.day + '-T' + truck.truckId)
      })
    })
    XLSX.writeFile(wb, 'roundit_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

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
        :root{--bg:#F4F7F5;--white:#fff;--navy:#1B7A6B;--blue:#2ECC8F;--blue-soft:#E8F8F3;--border:#D6EAE4;--text:#1E293B;--muted:#94A3B8;--success:#059669;--success-soft:#F0FDF4;--warning:#D97706;--warning-soft:#FFFBEB;--danger:#DC2626;--sans:'DM Sans',sans-serif}
        html,body{background:var(--bg);color:var(--text);font-family:var(--sans);height:100%;overflow:hidden}
        #__next{height:100vh;display:flex;flex-direction:column}
        input{font-family:var(--sans)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
        .drop-zone{transition:all 0.2s ease}
        .drop-zone-active{box-shadow:inset 0 0 0 2px var(--navy);transform:scale(1.01)}
        .drag-item{cursor:grab;transition:opacity 0.15s, transform 0.15s}
        .drag-item:active{cursor:grabbing;opacity:0.7;transform:scale(0.98)}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000}
        .modal-box{background:var(--white);border-radius:14px;padding:24px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.15)}
      `}</style>
      <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
        {/* ─── Merge/Replace Modal ─── */}
        {mergeModal && (
          <div className="modal-overlay" onClick={() => setMergeModal(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div style={{fontSize:15,fontWeight:700,color:'var(--navy)',marginBottom:4}}>{T.importTitle}</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>{T.importMsg}</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <button onClick={() => handleMergeChoice('add')}
                  style={{padding:'12px 16px',background:'var(--blue-soft)',border:'1.5px solid var(--blue)',borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--navy)'}}>{T.importAdd}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{T.importAddDesc}</div>
                </button>
                <button onClick={() => handleMergeChoice('replace')}
                  style={{padding:'12px 16px',background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:10,cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--danger)'}}>{T.importReplace}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{T.importReplaceDesc}</div>
                </button>
              </div>
              <button onClick={() => setMergeModal(null)}
                style={{marginTop:12,width:'100%',padding:'8px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,color:'var(--muted)',cursor:'pointer',fontWeight:600}}>
                {T.importCancel}
              </button>
            </div>
          </div>
        )}

        {/* ─── Top bar ─── */}
        <div style={{background:'var(--white)',borderBottom:'1px solid var(--border)',padding:'10px 20px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:7,marginRight:4}}>
            <span style={{fontSize:14,fontWeight:700}}>
              <span style={{color:'#1B7A6B'}}>Round</span><span style={{color:'#2ECC8F'}}>it</span>
            </span>
          </div>
          <button onClick={() => setLang(l => l === 'fr' ? 'en' : 'fr')}
            style={{padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:700,color:'var(--navy)',background:'var(--bg)',cursor:'pointer'}}>
            {lang === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
          </button>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <UploadZone label={T.pickingCsv} files={pickingFiles} onFile={f => handleFileSelect(f, 'picking')} inputRef={pickRef}/>
          <UploadZone label={T.deliveryCsv} files={deliveryFiles} onFile={f => handleFileSelect(f, 'delivery')} inputRef={delRef}/>
          {hasFiles && (
            <button onClick={handleReset}
              style={{padding:'4px 8px',border:'1px solid #FECACA',borderRadius:6,fontSize:10,fontWeight:600,color:'var(--danger)',background:'#FEF2F2',cursor:'pointer'}}>
              {T.reset}
            </button>
          )}
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <Param label={T.depot}>
            <input value={depot} onChange={e => saveDepot(e.target.value)} placeholder={T.depotPlaceholder}
              style={{width:190,padding:'6px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none'}}/>
          </Param>
          <Param label={T.trucks}><Counter value={numTrucks} min={1} max={10} onChange={saveTrucks}/></Param>
          <Param label={T.days}><Counter value={numDays} min={1} max={14} onChange={setNumDays}/></Param>
          <Param label={T.start}>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              style={{padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none'}}/>
          </Param>
          <Param label={T.end}>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              style={{padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,outline:'none'}}/>
          </Param>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          <Param label={T.maxParcels}>
            <input value={maxParcels} onChange={e => setMaxParcels(e.target.value.replace(/[^0-9]/g,''))} placeholder="∞"
              style={{width:48,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none',textAlign:'center'}}/>
          </Param>
          <Param label={T.maxVolume}>
            <input value={maxVolume} onChange={e => setMaxVolume(e.target.value.replace(/[^0-9.,]/g,'').replace(',','.'))} placeholder="∞"
              style={{width:48,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,color:'var(--text)',outline:'none',textAlign:'center'}}/>
          </Param>
          <button onClick={handleOptimize} disabled={loading || !hasFiles}
            style={{marginLeft:'auto',padding:'8px 18px',background:loading||!hasFiles?'var(--border)':'var(--navy)',color:loading||!hasFiles?'var(--muted)':'#fff',fontSize:13,fontWeight:600,border:'none',borderRadius:8,cursor:'pointer',whiteSpace:'nowrap'}}>
            {loading ? T.optimizing : selectedIds.length > 0 ? T.optimizeSel.replace('{n}', selectedIds.length) : T.optimizeAll}
          </button>
          <div style={{width:1,height:22,background:'var(--border)'}}/>
          {userEmail && <span style={{fontSize:11,color:'var(--muted)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</span>}
          <button onClick={handleLogout}
            style={{padding:'4px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,color:'var(--danger)',background:'var(--bg)',cursor:'pointer'}}>
            {T.logout}
          </button>
        </div>

        {error && <div style={{background:'#FEF2F2',borderBottom:'1px solid #FECACA',padding:'8px 20px',fontSize:12,color:'var(--danger)'}}>⚠️ {error}</div>}

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
              <MapView jobs={allJobs} routes={allRoutesFlat} depot={depotCoords}
                highlightTruck={highlightTruck} onStatusChange={updateStatus}
                onSelect={toggleSelect} selectedIds={selectedIds} lang={lang}/>
            )}
            {allJobs.length > 0 && (
              <div style={{position:'absolute',top:12,right:12,display:'flex',gap:8}}>
                {[{label:T.total,value:allJobs.length},{label:T.todo,value:todoJobs.length},{label:T.done,value:doneJobs.length},{label:T.ecarte,value:ecarteJobs.length}].map(s => (
                  <div key={s.label} style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:600,color:'var(--navy)',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    <span style={{color:'var(--muted)',fontWeight:400}}>{s.label} </span>{s.value}
                  </div>
                ))}
              </div>
            )}
            {allJobs.length > 0 && (
              <div style={{position:'absolute',bottom:16,left:16,background:'var(--white)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--navy)',marginBottom:6}}>{T.statuses}</div>
                {[['todo',T.statusTodo],['done',T.statusDone],['ecarte',T.statusEcarte]].map(([k,v]) => (
                  <div key={k} style={{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'var(--text)',marginBottom:3}}>
                    <div style={{width:9,height:9,borderRadius:'50%',background:STATUS_COLORS[k]}}/>{v}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Side panel ─── */}
          {allJobs.length > 0 && (
            <div style={{width:360,background:'var(--white)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
                {['jobs','planning'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{flex:1,padding:'10px 0',fontSize:12,fontWeight:600,background:'none',cursor:'pointer',color:activeTab===tab?'var(--navy)':'var(--muted)',border:'none',borderBottom:activeTab===tab?'2px solid var(--blue)':'2px solid transparent'}}>
                    {tab === 'jobs' ? T.jobs + ' (' + allJobs.length + ')' : T.planning + ' ' + numDays + 'j'}
                  </button>
                ))}
              </div>

              {activeTab === 'jobs' && (
                <>
                  <div style={{flex:1,overflowY:'auto',padding:10}}>
                    {todoJobs.length > 0 && (
                      <>
                        <div style={{fontSize:9,color:'var(--muted)',textAlign:'center',marginBottom:6,fontWeight:500}}>{T.dragHint}</div>
                        {PRIORITY_ZONES.map(zone => {
                          const jobsInZone = todoJobs.filter(j => (j.priority || 'medium') === zone.key)
                          const isOver = dragOverZone === zone.key
                          return (
                            <div key={zone.key}
                              className={'drop-zone' + (isOver ? ' drop-zone-active' : '')}
                              onDragOver={e => handleDragOver(e, zone.key)}
                              onDragLeave={handleDragLeave}
                              onDrop={e => handleDrop(e, zone.key)}
                              style={{marginBottom:8,borderRadius:10,border:'1.5px dashed '+(isOver?'var(--navy)':zone.border),background:isOver?zone.bg:'transparent',padding:'6px 8px',minHeight:44}}>
                              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:jobsInZone.length>0?6:0}}>
                                <span style={{fontSize:10,color:zone.color,fontWeight:700}}>{zone.icon}</span>
                                <span style={{fontSize:10,fontWeight:700,color:zone.color,flex:1}}>{PRIORITY_LABELS[lang][zone.key]}</span>
                                <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>{jobsInZone.length}</span>
                              </div>
                              {jobsInZone.map(job => (
                                <JobItem key={job.id} job={job} lang={lang}
                                  selected={selectedIds.includes(job.id)}
                                  onSelect={() => toggleSelect(job.id)}
                                  onStatus={s => updateStatus(job.id, s)}
                                  onDragStart={e => handleDragStart(e, job.id)}
                                  T={T}/>
                              ))}
                              {jobsInZone.length === 0 && (
                                <div style={{fontSize:10,color:'var(--muted)',textAlign:'center',padding:'4px 0',opacity:0.6}}>
                                  {lang === 'fr' ? 'Déposez ici' : 'Drop here'}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                    {doneJobs.length > 0 && <>
                      <SectionLabel mt>{T.doneSection} — {doneJobs.length}</SectionLabel>
                      {doneJobs.map(job => (
                        <JobItem key={job.id} job={job} lang={lang} onStatus={s => updateStatus(job.id, s)} T={T}/>
                      ))}
                    </>}
                    {ecarteJobs.length > 0 && <>
                      <SectionLabel mt>{T.ecarteSection} — {ecarteJobs.length}</SectionLabel>
                      {ecarteJobs.map(job => (
                        <JobItem key={job.id} job={job} lang={lang} onStatus={s => updateStatus(job.id, s)} T={T}/>
                      ))}
                    </>}
                  </div>
                  <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
                    <button onClick={selectAll} style={{flex:1,padding:'9px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,fontWeight:600,color:'var(--navy)',cursor:'pointer'}}>{T.selectAll}</button>
                    <button onClick={handleOptimize} disabled={loading} style={{flex:1,padding:'9px',background:'var(--navy)',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                      {selectedIds.length > 0 ? T.optimizeBtn + ' (' + selectedIds.length + ')' : T.optimizeBtn}
                    </button>
                  </div>
                </>
              )}

              {activeTab === 'planning' && (
                <>
                  <div style={{flex:1,overflowY:'auto',padding:10}}>
                    {plan.length === 0
                      ? <div style={{textAlign:'center',color:'var(--muted)',fontSize:12,marginTop:40}}>{T.launchOptim}</div>
                      : plan.map(day => <DayBlock key={day.day} day={day} colors={COLORS} onHover={setHighlightTruck} T={T} lang={lang}/>)
                    }
                  </div>
                  <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
                    <button onClick={handleExport} style={{flex:1,padding:'9px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,fontWeight:600,color:'var(--navy)',cursor:'pointer'}}>{T.exportExcel}</button>
                    <button onClick={handleOptimize} disabled={loading} style={{flex:1,padding:'9px',background:'var(--navy)',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>{T.recalculate}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Job item ─── */

function JobItem({ job, selected, onSelect, onStatus, onDragStart, T, lang }) {
  const [open, setOpen] = useState(false)
  const isDraggable = job.status === 'todo' && !!onDragStart
  const hasMeta = (job.parcels && job.parcels > 0) || (job.volumeM3 && job.volumeM3 > 0)

  return (
    <div style={{position:'relative',marginBottom:3}}>
      <div
        draggable={isDraggable}
        onDragStart={isDraggable ? onDragStart : undefined}
        className={isDraggable ? 'drag-item' : ''}
        onClick={() => job.status === 'todo' && onSelect ? onSelect() : setOpen(!open)}
        style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:8,border:'1px solid '+(selected?'var(--blue)':'transparent'),background:selected?'var(--blue-soft)':job.status==='ecarte'?'var(--warning-soft)':'var(--white)',cursor:isDraggable?'grab':'pointer',opacity:job.status==='done'?.45:1}}>
        {isDraggable && (
          <span style={{fontSize:10,color:'var(--muted)',cursor:'grab',flexShrink:0,userSelect:'none'}}>⠿</span>
        )}
        <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[job.status],flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.owner_name||job.address}</div>
          <div style={{fontSize:9,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{job.address}</div>
          {hasMeta && (
            <div style={{display:'flex',gap:8,marginTop:1}}>
              {job.parcels > 0 && <span style={{fontSize:8,color:'var(--muted)'}}>{job.parcels} {T.parcels}</span>}
              {job.volumeM3 > 0 && <span style={{fontSize:8,color:'var(--muted)'}}>{job.volumeM3} {T.volume}</span>}
            </div>
          )}
        </div>
        <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:5,background:STATUS_BG[job.status],color:STATUS_COLORS[job.status],flexShrink:0}}>
          {job.status==='todo'?(selected?T.selected:T.statusTodo):job.status==='done'?T.statusDone:T.statusEcarte}
        </span>
        <span style={{fontSize:11,color:'var(--muted)',cursor:'pointer',flexShrink:0}} onClick={e=>{e.stopPropagation();setOpen(!open)}}>⋯</span>
      </div>
      {open && (
        <div style={{position:'absolute',right:0,top:'100%',zIndex:50,background:'var(--white)',border:'1px solid var(--border)',borderRadius:8,padding:4,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',display:'flex',gap:4}}>
          <button onClick={()=>{onStatus('todo');setOpen(false)}} style={{padding:'5px 8px',borderRadius:6,background:'var(--blue-soft)',color:'var(--blue)',fontSize:10,fontWeight:700,cursor:'pointer',border:'none'}}>{T.statusTodo}</button>
          <button onClick={()=>{onStatus('done');setOpen(false)}} style={{padding:'5px 8px',borderRadius:6,background:'var(--success-soft)',color:'var(--success)',fontSize:10,fontWeight:700,cursor:'pointer',border:'none'}}>✅ {T.statusDone}</button>
          <button onClick={()=>{onStatus('ecarte');setOpen(false)}} style={{padding:'5px 8px',borderRadius:6,background:'var(--warning-soft)',color:'var(--warning)',fontSize:10,fontWeight:700,cursor:'pointer',border:'none'}}>🔶 {T.statusEcarte}</button>
        </div>
      )}
    </div>
  )
}

/* ─── Day block ─── */

function DayBlock({ day, colors, onHover, T, lang }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'var(--bg)',borderRadius:8,marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:'var(--navy)',flex:1}}>{T.day} {day.day}</span>
        <span style={{fontSize:10,color:'var(--muted)'}}>{day.trucks.reduce((s,t)=>s+t.stops.length,0)} {T.stops}</span>
      </div>
      {day.trucks.map((truck,ti) => (
        <div key={truck.truckId} style={{marginBottom:6,paddingLeft:4}} onMouseEnter={()=>onHover(truck.truckId)} onMouseLeave={()=>onHover(null)}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:colors[ti%colors.length]}}/>
            <span style={{fontSize:11,fontWeight:600,color:'var(--navy)'}}>{T.truck} {truck.truckId}</span>
            <span style={{fontSize:10,color:'var(--muted)',marginLeft:'auto'}}>
              {truck.totalDistance} {T.km} · {T.return} {truck.returnTime}
            </span>
          </div>
          {(truck.totalParcels > 0 || truck.totalVolumeM3 > 0) && (
            <div style={{display:'flex',gap:10,paddingLeft:14,marginBottom:4}}>
              {truck.totalParcels > 0 && <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>📦 {truck.totalParcels} {T.parcels}</span>}
              {truck.totalVolumeM3 > 0 && <span style={{fontSize:9,color:'var(--muted)',fontWeight:500}}>📐 {truck.totalVolumeM3} {T.volume}</span>}
            </div>
          )}
          {truck.stops.map((stop,si) => (
            <div key={si} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px 5px 14px',borderRadius:6,marginBottom:2,borderLeft:'2px solid '+colors[ti%colors.length],background:colors[ti%colors.length]+'10'}}>
              <span style={{fontSize:10,fontWeight:600,color:colors[ti%colors.length],minWidth:38}}>{stop.arrivalTime}</span>
              <span style={{flex:1,fontSize:11,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{stop.owner_name||stop.address}</span>
              {stop.parcels > 0 && <span style={{fontSize:8,color:'var(--muted)'}}>{stop.parcels}📦</span>}
              <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,background:stop.type==='picking'?'#FEF3C7':'var(--blue-soft)',color:stop.type==='picking'?'#B45309':'var(--blue)'}}>
                {stop.type === 'picking' ? 'P' : 'D'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children, mt }) {
  return <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',padding:'4px 6px',marginBottom:4,marginTop:mt?8:0}}>{children}</div>
}

function UploadZone({ label, files, onFile, inputRef }) {
  const count = files.length
  return (
    <div onClick={() => inputRef.current?.click()}
      style={{display:'flex',alignItems:'center',gap:7,padding:'6px 12px',border:'1.5px '+(count>0?'solid':'dashed')+' '+(count>0?'var(--success)':'var(--border)'),borderRadius:8,cursor:'pointer',background:count>0?'var(--success-soft)':'var(--bg)',fontSize:12,fontWeight:500,color:count>0?'var(--success)':'var(--muted)',whiteSpace:'nowrap'}}>
      <span>{count>0?'✅':'📂'}</span>
      <span>{count>0 ? count + ' ' + label : '+ ' + label}</span>
      <input ref={inputRef} type="file" accept=".csv" style={{display:'none'}} onChange={e => { onFile(e.target.files[0]); e.target.value = '' }}/>
    </div>
  )
}

function Param({ label, children }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <span style={{fontSize:11,fontWeight:600,color:'var(--muted)',whiteSpace:'nowrap'}}>{label}</span>
      {children}
    </div>
  )
}

function Counter({ value, min, max, onChange }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:4}}>
      <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:22,height:22,border:'1px solid var(--border)',borderRadius:5,background:'var(--white)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--navy)'}}>−</button>
      <span style={{fontSize:13,fontWeight:700,color:'var(--navy)',width:20,textAlign:'center'}}>{value}</span>
      <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:22,height:22,border:'1px solid var(--border)',borderRadius:5,background:'var(--white)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--navy)'}}>+</button>
    </div>
  )
}
