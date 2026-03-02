import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import * as XLSX from 'xlsx'

const MapView = dynamic(() => import('../components/MapView'), { ssr: false })

const COLORS = ['#2563EB', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const DEPOT_KEY = 'roundit_depot'
const TRUCKS_KEY = 'roundit_trucks'

const STATUS_LABELS = { todo: 'À faire', done: 'Fait', ecarte: 'Écarté' }
const STATUS_COLORS = { todo: '#2563EB', done: '#059669', ecarte: '#D97706' }
const STATUS_BG = { todo: '#EFF6FF', done: '#F0FDF4', ecarte: '#FFFBEB' }

export default function Home() {
  const [pickingFile, setPickingFile] = useState(null)
  const [deliveryFile, setDeliveryFile] = useState(null)
  const [depot, setDepot] = useState('')
  const [numTrucks, setNumTrucks] = useState(4)
  const [numDays, setNumDays] = useState(1)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('18:00')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [allJobs, setAllJobs] = useState([])
  const [plan, setPlan] = useState([])
  const [depot_coords, setDepotCoords] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeTab, setActiveTab] = useState('jobs')
  const [highlightTruck, setHighlightTruck] = useState(null)
  const pickRef = useRef()
  const delRef = useRef()

  useEffect(() => {
    const savedDepot = localStorage.getItem(DEPOT_KEY)
    const savedTrucks = localStorage.getItem(TRUCKS_KEY)
    if (savedDepot) setDepot(savedDepot)
    if (savedTrucks) setNumTrucks(parseInt(savedTrucks))
  }, [])

  const saveDepot = v => { setDepot(v); localStorage.setItem(DEPOT_KEY, v) }
  const saveTrucks = v => { setNumTrucks(v); localStorage.setItem(TRUCKS_KEY, v) }

  const handleOptimize = async () => {
    if (!pickingFile && !deliveryFile) return setError('Chargez au moins un fichier')
    if (!depot) return setError("Saisissez l'adresse du dépôt")
    setLoading(true); setError(null)
    setProgress('Géocodage des adresses...')
    try {
      const formData = new FormData()
      if (pickingFile) formData.append('picking', pickingFile)
      if (deliveryFile) formData.append('delivery', deliveryFile)
      formData.append('config', JSON.stringify({
        depotAddress: depot, numTrucks, numDays, startTime, endTime,
        sessionDate: new Date().toISOString().slice(0, 10),
        selectedIds: selectedIds.length > 0 ? selectedIds : null,
      }))
      const res = await fetch('/api/optimize', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAllJobs(data.allJobs)
      setPlan(data.plan)
      setDepotCoords(data.depot)
      setActiveTab('jobs')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false); setProgress('')
    }
  }

  const updateStatus = async (id, status) => {
    setAllJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j))
    await fetch('/api/jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  const toggleSelect = (orderId) => {
    setSelectedIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    )
  }

  const selectAll = () => {
    const todoIds = allJobs.filter(j => j.status === 'todo').map(j => j.id)
    setSelectedIds(todoIds)
  }

  const handleExport = () => {
    if (!plan.length) return
    const wb = XLSX.utils.book_new()
    plan.forEach(day => {
      day.trucks.forEach(truck => {
        const data = truck.stops.map((s, i) => ({
          Ordre: i + 1,
          Type: s.type === 'picking' ? 'Ramasse' : 'Livraison',
          Owner: s.owner_name,
          Adresse: s.address,
          Arrivee: s.arrivalTime,
          Depart: s.departureTime,
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), `J${day.day}-Camion${truck.truckId}`)
      })
    })
    XLSX.writeFile(wb, 'roundit_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  }

  const todoJobs = allJobs.filter(j => j.status === 'todo')
  const doneJobs = allJobs.filter(j => j.status === 'done')
  const ecarteJobs = allJobs.filter(j => j.status === 'ecarte')
  const allRoutesFlat = plan.flatMap(d => d.trucks)

  return (
    <>
      <Head>
        <title>RoundIT</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      </Head>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#F7F9FC;--white:#fff;--navy:#0F2D52;--blue:#2563EB;
          --blue-soft:#EFF6FF;--border:#E2E8F0;--text:#1E293B;--muted:#94A3B8;
          --success:#059669;--success-soft:#F0FDF4;
          --warning:#D97706;--warning-soft:#FFFBEB;
          --danger:#DC2626;--sans:'DM Sans',sans-serif;
        }
        html,body{background:var(--bg);color:var(--text);font-family:var(--sans);height:100%;overflow:hidden}
        #__next{height:100vh;display:flex;flex-direction:column}
        input{font-family:var(--sans)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>

        {/* TOPBAR */}
        <div style={{ background:'var(--white)', borderBottom:'1px solid var(--border)', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginRight:4 }}>
            <div style={{ width:8, height:8, background:'var(--blue)', borderRadius:'50%' }}/>
            <span style={{ fontSize:14, fontWeight:700, color:'var(--navy)' }}>RoundIT</span>
          </div>
          <div style={{ width:1, height:22, background:'var(--border)' }}/>

          <UploadZone label="Picking CSV" file={pickingFile} onFile={setPickingFile} inputRef={pickRef}/>
          <UploadZone label="Delivery CSV" file={deliveryFile} onFile={setDeliveryFile} inputRef={delRef}/>

          <div style={{ width:1, height:22, background:'var(--border)' }}/>

          <Param label="Dépôt">
            <input value={depot} onChange={e => saveDepot(e.target.value)} placeholder="Adresse du dépôt"
              style={{ width:190, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:7, fontSize:12, color:'var(--text)', outline:'none' }}/>
          </Param>

          <Param label="Camions">
            <Counter value={numTrucks} min={1} max={10} onChange={saveTrucks}/>
          </Param>

          <Param label="Jours">
            <Counter value={numDays} min={1} max={14} onChange={setNumDays}/>
          </Param>

          <Param label="Départ">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              style={{ padding:'6px 8px', border:'1px solid var(--border)', borderRadius:7, fontSize:12, outline:'none' }}/>
          </Param>

          <Param label="Fin">
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              style={{ padding:'6px 8px', border:'1px solid var(--border)', borderRadius:7, fontSize:12, outline:'none' }}/>
          </Param>

          <button onClick={handleOptimize} disabled={loading || (!pickingFile && !deliveryFile)}
            style={{ marginLeft:'auto', padding:'8px 18px', background: loading || (!pickingFile && !deliveryFile) ? 'var(--border)' : 'var(--navy)', color: loading || (!pickingFile && !deliveryFile) ? 'var(--muted)' : '#fff', fontSize:13, fontWeight:600, border:'none', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap' }}>
            {loading ? ('⏳ ' + progress) : selectedIds.length > 0 ? 'Optimiser (' + selectedIds.length + ') →' : 'Optimiser tout →'}
          </button>
        </div>

        {error && <div style={{ background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'8px 20px', fontSize:12, color:'var(--danger)' }}>⚠️ {error}</div>}

        {/* MAIN */}
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* MAP */}
          <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#E8EDF5' }}>
            {allJobs.length === 0 ? (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--muted)' }}>
                <div style={{ fontSize:48, opacity:.2 }}>🗺️</div>
                <div style={{ fontSize:14, fontWeight:500 }}>La carte apparaîtra ici</div>
                <div style={{ fontSize:12 }}>Uploadez vos fichiers CSV et cliquez sur Optimiser</div>
                {loading && <div style={{ fontSize:12, color:'var(--blue)', marginTop:8 }}>{progress}</div>}
              </div>
            ) : (
              <MapView
                jobs={allJobs}
                routes={allRoutesFlat}
                depot={depot_coords}
                colors={COLORS}
                highlightTruck={highlightTruck}
                onStatusChange={updateStatus}
                onSelect={toggleSelect}
                selectedIds={selectedIds}
              />
            )}

            {/* Stats bar */}
            {allJobs.length > 0 && (
              <div style={{ position:'absolute', top:12, right:12, display:'flex', gap:8 }}>
                {[
                  { label:'Total', value: allJobs.length },
                  { label:'À faire', value: todoJobs.length },
                  { label:'Faits', value: doneJobs.length },
                  { label:'Écartés', value: ecarteJobs.length },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:600, color:'var(--navy)', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                    <span style={{ color:'var(--muted)', fontWeight:400 }}>{s.label} </span>{s.value}
                  </div>
                ))}
              </div>
            )}

            {/* Legend */}
            {allJobs.length > 0 && (
              <div style={{ position:'absolute', bottom:16, left:16, background:'var(--white)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--navy)', marginBottom:6 }}>Statuts</div>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, color:'var(--text)', marginBottom:3 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:STATUS_COLORS[k] }}/>
                    {v}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SIDE PANEL */}
          {allJobs.length > 0 && (
            <div style={{ width:340, background:'var(--white)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
                {['jobs', 'planning'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ flex:1, padding:'10px 0', fontSize:12, fontWeight:600, background:'none', cursor:'pointer', color: activeTab === tab ? 'var(--navy)' : 'var(--muted)', borderBottom: activeTab === tab ? '2px solid var(--blue)' : '2px solid transparent', border:'none', borderBottom: activeTab === tab ? '2px solid var(--blue)' : '2px solid transparent' }}>
                    {tab === 'jobs' ? 'Jobs (' + allJobs.length + ')' : 'Planning ' + numDays + 'j'}
                  </button>
                ))}
              </div>

              {/* JOBS TAB */}
              {activeTab === 'jobs' && (
                <>
                  <div style={{ flex:1, overflowY:'auto', padding:10 }}>
                    {todoJobs.length > 0 && <>
                      <SectionLabel>À faire — {todoJobs.length} jobs</SectionLabel>
                      {todoJobs.map(job => (
                        <JobItem key={job.id} job={job} selected={selectedIds.includes(job.id)}
                          onSelect={() => toggleSelect(job.id)}
                          onStatus={status => updateStatus(job.id, status)}/>
                      ))}
                    </>}
                    {doneJobs.length > 0 && <>
                      <SectionLabel style={{ marginTop:8 }}>Faits — {doneJobs.length}</SectionLabel>
                      {doneJobs.map(job => (
                        <JobItem key={job.id} job={job} onStatus={status => updateStatus(job.id, status)}/>
                      ))}
                    </>}
                    {ecarteJobs.length > 0 && <>
                      <SectionLabel style={{ marginTop:8 }}>Écartés — {ecarteJobs.length}</SectionLabel>
                      {ecarteJobs.map(job => (
                        <JobItem key={job.id} job={job} onStatus={status => updateStatus(job.id, status)}/>
                      ))}
                    </>}
                  </div>
                  <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
                    <button onClick={selectAll} style={{ flex:1, padding:'9px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, fontWeight:600, color:'var(--navy)', cursor:'pointer' }}>
                      Tout sélectionner
                    </button>
                    <button onClick={handleOptimize} disabled={loading}
                      style={{ flex:1, padding:'9px', background:'var(--navy)', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      {selectedIds.length > 0 ? 'Optimiser (' + selectedIds.length + ')' : 'Optimiser tout'}
                    </button>
                  </div>
                </>
              )}

              {/* PLANNING TAB */}
              {activeTab === 'planning' && (
                <>
                  <div style={{ flex:1, overflowY:'auto', padding:10 }}>
                    {plan.length === 0 ? (
                      <div style={{ textAlign:'center', color:'var(--muted)', fontSize:12, marginTop:40 }}>
                        Lance l'optimisation pour voir le planning
                      </div>
                    ) : plan.map(day => (
                      <DayBlock key={day.day} day={day} colors={COLORS} onHover={setHighlightTruck}/>
                    ))}
                  </div>
                  <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
                    <button onClick={handleExport} style={{ flex:1, padding:'9px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, fontWeight:600, color:'var(--navy)', cursor:'pointer' }}>
                      ↓ Export Excel
                    </button>
                    <button onClick={handleOptimize} disabled={loading}
                      style={{ flex:1, padding:'9px', background:'var(--navy)', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Recalculer
                    </button>
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

function JobItem({ job, selected, onSelect, onStatus }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'relative', marginBottom:3 }}>
      <div onClick={() => { if (job.status === 'todo' && onSelect) onSelect(); else setOpen(!open) }}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'1px solid ' + (selected ? 'var(--blue)' : 'transparent'), background: selected ? 'var(--blue-soft)' : job.status === 'ecarte' ? 'var(--warning-soft)' : 'transparent', cursor:'pointer', opacity: job.status === 'done' ? .45 : 1, transition:'all .15s' }}
        onMouseEnter={e => { if(!selected) e.currentTarget.style.background='var(--bg)' }}
        onMouseLeave={e => { if(!selected) e.currentTarget.style.background = job.status === 'ecarte' ? 'var(--warning-soft)' : 'transparent' }}>
        <div style={{ width:9, height:9, borderRadius:'50%', background:STATUS_COLORS[job.status], flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{job.owner_name || job.address}</div>
          <div style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{job.address}</div>
        </div>
        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:STATUS_BG[job.status], color:STATUS_COLORS[job.status], flexShrink:0 }}>
          {job.status === 'todo' ? (selected ? 'Sélectionné' : 'À faire') : STATUS_LABELS[job.status]}
        </span>
        <span style={{ fontSize:10, color:'var(--muted)', cursor:'pointer' }} onClick={e => { e.stopPropagation(); setOpen(!open) }}>⋯</span>
      </div>
      {open && (
        <div style={{ position:'absolute', right:0, top:'100%', zIndex:50, background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:4, boxShadow:'0 4px 16px rgba(0,0,0,0.1)', display:'flex', gap:4 }}>
          <button onClick={() => { onStatus('todo'); setOpen(false) }} style={{ padding:'5px 8px', borderRadius:6, background:'var(--blue-soft)', color:'var(--blue)', fontSize:10, fontWeight:700, cursor:'pointer', border:'none' }}>À faire</button>
          <button onClick={() => { onStatus('done'); setOpen(false) }} style={{ padding:'5px 8px', borderRadius:6, background:'var(--success-soft)', color:'var(--success)', fontSize:10, fontWeight:700, cursor:'pointer', border:'none' }}>✅ Fait</button>
          <button onClick={() => { onStatus('ecarte'); setOpen(false) }} style={{ padding:'5px 8px', borderRadius:6, background:'var(--warning-soft)', color:'var(--warning)', fontSize:10, fontWeight:700, cursor:'pointer', border:'none' }}>🔶 Écarté</button>
        </div>
      )}
    </div>
  )
}

function DayBlock({ day, colors, onHover }) {
  const dayNames = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'var(--bg)', borderRadius:8, marginBottom:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--navy)', flex:1 }}>Jour {day.day}</span>
        <span style={{ fontSize:10, color:'var(--muted)' }}>{day.trucks.reduce((s,t) => s + t.stops.length, 0)} stops</span>
      </div>
      {day.trucks.map((truck, ti) => (
        <div key={truck.truckId} style={{ marginBottom:6, paddingLeft:4 }}
          onMouseEnter={() => onHover(truck.truckId)}
          onMouseLeave={() => onHover(null)}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:colors[ti % colors.length] }}/>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--navy)' }}>Camion {truck.truckId}</span>
            <span style={{ fontSize:10, color:'var(--muted)', marginLeft:'auto' }}>{truck.totalDistance} km · retour {truck.returnTime}</span>
          </div>
          {truck.stops.map((stop, si) => (
            <div key={si} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px 5px 14px', borderRadius:6, marginBottom:2, borderLeft:'2px solid ' + colors[ti % colors.length], background: colors[ti % colors.length] + '10' }}>
              <span style={{ fontSize:10, fontWeight:600, color:colors[ti % colors.length], minWidth:38 }}>{stop.arrivalTime}</span>
              <span style={{ flex:1, fontSize:11, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{stop.owner_name || stop.address}</span>
              <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background: stop.type === 'picking' ? '#FEF3C7' : 'var(--blue-soft)', color: stop.type === 'picking' ? '#B45309' : 'var(--blue)' }}>
                {stop.type === 'picking' ? 'P' : 'D'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', padding:'4px 6px', marginBottom:4, ...style }}>{children}</div>
}

function UploadZone({ label, file, onFile, inputRef }) {
  return (
    <div onClick={() => inputRef.current?.click()}
      style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 12px', border:'1.5px ' + (file ? 'solid' : 'dashed') + ' ' + (file ? 'var(--success)' : 'var(--border)'), borderRadius:8, cursor:'pointer', background: file ? 'var(--success-soft)' : 'var(--bg)', fontSize:12, fontWeight:500, color: file ? 'var(--success)' : 'var(--muted)', whiteSpace:'nowrap' }}>
      <span>{file ? '✅' : '📂'}</span>
      <span>{file ? file.name : '+ ' + label}</span>
      <input ref={inputRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => onFile(e.target.files[0])}/>
    </div>
  )
}

function Param({ label, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:11, fontWeight:600, color:'var(--muted)', whiteSpace:'nowrap' }}>{label}</span>
      {children}
    </div>
  )
}

function Counter({ value, min, max, onChange }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width:22, height:22, border:'1px solid var(--border)', borderRadius:5, background:'var(--white)', cursor:'pointer', fontSize:14, fontWeight:700, color:'var(--navy)' }}>−</button>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--navy)', width:20, textAlign:'center' }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width:22, height:22, border:'1px solid var(--border)', borderRadius:5, background:'var(--white)', cursor:'pointer', fontSize:14, fontWeight:700, color:'var(--navy)' }}>+</button>
    </div>
  )
}
