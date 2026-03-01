import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import * as XLSX from 'xlsx'

const MapView = dynamic(() => import('../components/MapView'), { ssr: false })

const COLORS = ['#2563EB', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const DEPOT_KEY = 'roundit_depot'
const TRUCKS_KEY = 'roundit_trucks'

export default function Home() {
  const [pickingFile, setPickingFile] = useState(null)
  const [deliveryFile, setDeliveryFile] = useState(null)
  const [depot, setDepot] = useState('')
  const [numTrucks, setNumTrucks] = useState(4)
  const [startTime, setStartTime] = useState('08:00')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [routes, setRoutes] = useState([])
  const [highlightTruck, setHighlightTruck] = useState(null)
  const [dragItem, setDragItem] = useState(null)
  const pickRef = useRef()
  const delRef = useRef()

  // Load saved settings
  useEffect(() => {
    const savedDepot = localStorage.getItem(DEPOT_KEY)
    const savedTrucks = localStorage.getItem(TRUCKS_KEY)
    if (savedDepot) setDepot(savedDepot)
    if (savedTrucks) setNumTrucks(parseInt(savedTrucks))
  }, [])

  const saveDepot = (val) => {
    setDepot(val)
    localStorage.setItem(DEPOT_KEY, val)
  }

  const saveTrucks = (val) => {
    setNumTrucks(val)
    localStorage.setItem(TRUCKS_KEY, val)
  }

  const handleOptimize = async () => {
    if (!pickingFile && !deliveryFile) return setError('Chargez au moins un fichier')
    if (!depot) return setError('Saisissez l\'adresse du dépôt')
    setLoading(true)
    setError(null)
    setResult(null)
    setProgress('Envoi des fichiers...')

    try {
      const formData = new FormData()
      if (pickingFile) formData.append('picking', pickingFile)
      if (deliveryFile) formData.append('delivery', deliveryFile)
      formData.append('config', JSON.stringify({ depotAddress: depot, numTrucks, startTime }))

      setProgress('Géocodage des adresses (1-2 min)...')
      const res = await fetch('/api/optimize', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResult(data)
      setRoutes(data.routes)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  // Drag and drop between trucks
  const onDragStart = (e, truckId, stopIdx) => {
    setDragItem({ truckId, stopIdx })
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (e, targetTruckId) => {
    e.preventDefault()
    if (!dragItem || dragItem.truckId === targetTruckId) return
    setRoutes(prev => {
      const next = prev.map(r => ({ ...r, stops: [...r.stops] }))
      const src = next.find(r => r.truckId === dragItem.truckId)
      const dst = next.find(r => r.truckId === targetTruckId)
      if (!src || !dst) return prev
      const [moved] = src.stops.splice(dragItem.stopIdx, 1)
      dst.stops.push(moved)
      return next
    })
    setDragItem(null)
  }

  const handleExport = () => {
    if (!routes.length) return
    const wb = XLSX.utils.book_new()
    const summary = routes.map(r => ({
      Camion: `Camion ${r.truckId}`,
      Stops: r.stops.length,
      'Distance (km)': r.totalDistance,
      'Duree (min)': r.totalDuration,
      'Retour depot': r.returnTime,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Resume')
    routes.forEach(r => {
      const data = r.stops.map((s, i) => ({
        Ordre: i + 1,
        Type: s.type === 'picking' ? 'Ramasse' : 'Livraison',
        Owner: s.owner,
        Adresse: s.address,
        'Nb orders': s.orders?.length || 1,
        'Orders IDs': s.orders?.join(', ') || '',
        Arrivee: s.arrivalTime,
        Depart: s.departureTime,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), `Camion ${r.truckId}`)
    })
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `tournees_${date}.xlsx`)
  }

  return (
    <>
      <Head>
        <title>RoundIT</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #F7F9FC; --white: #FFFFFF; --navy: #0F2D52; --blue: #2563EB;
          --blue-soft: #EFF6FF; --border: #E2E8F0; --text: #1E293B; --muted: #94A3B8;
          --success: #059669; --success-soft: #F0FDF4; --danger: #DC2626;
          --sans: 'DM Sans', sans-serif;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--sans); height: 100%; overflow: hidden; }
        #__next { height: 100vh; display: flex; flex-direction: column; }
        input { font-family: var(--sans); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* TOP BAR */}
        <div style={{
          background: 'var(--white)', borderBottom: '1px solid var(--border)',
          padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 6 }}>
            <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%' }}/>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>RoundIT</span>
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--border)' }}/>

          {/* Picking upload */}
          <UploadZone
            label="Picking CSV"
            file={pickingFile}
            onFile={setPickingFile}
            inputRef={pickRef}
          />

          {/* Delivery upload */}
          <UploadZone
            label="Delivery CSV"
            file={deliveryFile}
            onFile={setDeliveryFile}
            inputRef={delRef}
          />

          <div style={{ width: 1, height: 22, background: 'var(--border)' }}/>

          {/* Depot */}
          <Param label="Dépôt">
            <input
              value={depot}
              onChange={e => saveDepot(e.target.value)}
              placeholder="Adresse du dépôt"
              style={{ width: 200, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', outline: 'none' }}
            />
          </Param>

          {/* Trucks */}
          <Param label="Camions">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => saveTrucks(Math.max(1, numTrucks - 1))} style={btnSmall}>−</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', width: 20, textAlign: 'center' }}>{numTrucks}</span>
              <button onClick={() => saveTrucks(Math.min(10, numTrucks + 1))} style={btnSmall}>+</button>
            </div>
          </Param>

          {/* Start time */}
          <Param label="Départ">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text)', outline: 'none' }}/>
          </Param>

          {/* Optimize button */}
          <button
            onClick={handleOptimize}
            disabled={loading || (!pickingFile && !deliveryFile)}
            style={{
              marginLeft: 'auto', padding: '8px 18px',
              background: loading || (!pickingFile && !deliveryFile) ? 'var(--border)' : 'var(--navy)',
              color: loading || (!pickingFile && !deliveryFile) ? 'var(--muted)' : '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? `⏳ ${progress}` : 'Optimiser →'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '8px 20px', fontSize: 12, color: 'var(--danger)' }}>
            ⚠️ {error}
          </div>
        )}

        {/* MAIN */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* MAP */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#E8EDF5' }}>
            {!result ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--muted)' }}>
                <div style={{ fontSize: 48, opacity: .2 }}>🗺️</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>La carte apparaîtra ici</div>
                <div style={{ fontSize: 12 }}>Uploadez vos fichiers CSV et cliquez sur Optimiser</div>
                {loading && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 8 }}>{progress}</div>}
              </div>
            ) : (
              <MapView routes={routes} depot={result.depot} highlightTruck={highlightTruck} />
            )}

            {/* Legend */}
            {result && (
              <div style={{
                position: 'absolute', bottom: 16, left: 16,
                background: 'var(--white)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>Légende</div>
                {routes.map((r, i) => (
                  <div key={r.truckId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)' }}>
                    <div style={{ width: 16, height: 3, background: COLORS[i % COLORS.length], borderRadius: 2 }}/>
                    Camion {r.truckId}
                  </div>
                ))}
                <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>P</span>
                    Ramasse
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>D</span>
                    Livraison
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SIDE PANEL */}
          {result && (
            <div style={{
              width: 320, background: 'var(--white)',
              borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>
                  {routes.reduce((s, r) => s + r.stops.length, 0)} stops · {routes.length} camions
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Glisser pour réorganiser entre camions
                </div>
                {result.failed?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)', background: '#FEF2F2', padding: '4px 8px', borderRadius: 6 }}>
                    ⚠️ {result.failed.length} adresse(s) non trouvée(s)
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {routes.map((route, ri) => (
                  <TruckSection
                    key={route.truckId}
                    route={route}
                    color={COLORS[ri % COLORS.length]}
                    highlighted={highlightTruck === route.truckId}
                    onHover={(v) => setHighlightTruck(v ? route.truckId : null)}
                    onDragStart={onDragStart}
                    onDrop={onDrop}
                  />
                ))}
              </div>

              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                <button onClick={handleExport} style={{
                  width: '100%', padding: '10px',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12, fontWeight: 600,
                  color: 'var(--navy)', cursor: 'pointer',
                }}>
                  ↓ Exporter les feuilles de route
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TruckSection({ route, color, highlighted, onHover, onDragStart, onDrop }) {
  const [open, setOpen] = useState(true)
  return (
    <div
      style={{ marginBottom: 10, border: `1px solid ${highlighted ? color : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .2s' }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragOver={e => e.preventDefault()}
      onDrop={e => onDrop(e, route.truckId)}
    >
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'var(--bg)', cursor: 'pointer',
      }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}/>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', flex: 1 }}>Camion {route.truckId}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{route.stops.length} stops · {route.totalDistance} km · retour {route.returnTime}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && route.stops.map((stop, si) => (
        <div
          key={si}
          draggable
          onDragStart={e => onDragStart(e, route.truckId, si)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '8px 12px', cursor: 'grab',
            borderTop: '1px solid var(--border)',
            background: 'var(--white)',
            transition: 'background .1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}
        >
          <span style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>⠿</span>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: stop.type === 'picking' ? color : 'var(--white)',
            border: stop.type === 'picking' ? 'none' : `2px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700,
            color: stop.type === 'picking' ? '#fff' : color,
            flexShrink: 0, marginTop: 1,
          }}>
            {si + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stop.owner || stop.address}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stop.address}
            </div>
            <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>
              Arrivée {stop.arrivalTime} · {stop.orders?.length || 1} order(s)
            </div>
          </div>
          <span style={{
            fontSize: 9, padding: '2px 5px', borderRadius: 5, fontWeight: 700, flexShrink: 0,
            background: stop.type === 'picking' ? '#FEF3C7' : '#DBEAFE',
            color: stop.type === 'picking' ? '#B45309' : '#1D4ED8',
          }}>
            {stop.type === 'picking' ? 'P' : 'D'}
          </span>
        </div>
      ))}
    </div>
  )
}

function UploadZone({ label, file, onFile, inputRef }) {
  return (
    <div
      onClick={() => inputRef.current?.click()}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 12px',
        border: `1.5px ${file ? 'solid' : 'dashed'} ${file ? 'var(--success)' : 'var(--border)'}`,
        borderRadius: 8, cursor: 'pointer',
        background: file ? 'var(--success-soft)' : 'var(--bg)',
        transition: 'all .15s', fontSize: 12, fontWeight: 500,
        color: file ? 'var(--success)' : 'var(--muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{file ? '✅' : '📂'}</span>
      <span>{file ? file.name : `+ ${label}`}</span>
      <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
        onChange={e => onFile(e.target.files[0])}/>
    </div>
  )
}

function Param({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  )
}

const btnSmall = {
  width: 22, height: 22, border: '1px solid var(--border)',
  borderRadius: 5, background: 'var(--white)', cursor: 'pointer',
  fontSize: 14, fontWeight: 700, color: 'var(--navy)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
}
