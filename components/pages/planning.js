import { useState, useEffect } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'

const WeekCalendar = dynamic(() => import('../components/WeekCalendar'), { ssr: false })

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

function getClient() {
  if (!window.__sb) {
    const { createClient } = require('@supabase/supabase-js')
    window.__sb = createClient('https://yqjenhpaohwunjvgmlyw.supabase.co', ANON_KEY)
  }
  return window.__sb
}

export default function PlanningPage() {
  const [lang, setLang] = useState('fr')
  const [userProfile, setUserProfile] = useState(null)
  const [userId, setUserId] = useState(null)
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [weekData, setWeekData] = useState({}) // { 'YYYY-MM-DD': { jobs, route, validated } }
  const [unplannedJobs, setUnplannedJobs] = useState([])
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState(null) // { job, dates }

  const fr = lang === 'fr'
  const isManager = userProfile?.role === 'manager'

  function getMonday(d) {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    date.setDate(diff)
    return date.toISOString().slice(0, 10)
  }

  function getWeekDates(mondayStr) {
    const dates = []
    for (let i = 0; i < 5; i++) {
      const d = new Date(mondayStr + 'T12:00:00')
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().slice(0, 10))
    }
    return dates
  }

  const weekDates = getWeekDates(weekStart)

  const navigateWeek = (offset) => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + (offset * 7))
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    setWeekStart(d.toISOString().slice(0, 10))
  }

  const formatDateShort = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    const dayNames = fr ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return dayNames[d.getDay()] + ' ' + d.getDate()
  }

  const formatWeekLabel = () => {
    const start = new Date(weekDates[0] + 'T12:00:00')
    const end = new Date(weekDates[4] + 'T12:00:00')
    const months = fr ? ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${start.getDate()} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
  }

  // Load data
  useEffect(() => {
    getClient().auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { window.location.href = '/login'; return }
      const uid = session.user.id
      setUserId(uid)

      const { data: profile } = await getClient().from('profiles').select('*').eq('id', uid).single()
      if (!profile) { window.location.href = '/setup'; return }
      setUserProfile(profile)

      const { data: truckData } = await getClient().from('trucks').select('*').eq('active', true).order('id')
      if (truckData) setTrucks(truckData)

      setLoading(false)
    })
  }, [])

  // Load week data when weekStart changes
  useEffect(() => {
    if (!userId) return
    loadWeekData()
  }, [weekStart, userId])

  const loadWeekData = async () => {
    const data = {}
    for (const date of weekDates) {
      const { data: jobs } = await getClient().from('jobs').select('*').eq('session_date', date)
      const { data: route } = await getClient().from('saved_routes').select('*').eq('session_date', date).single()

      const normalizedJobs = (jobs || []).map(j => ({
        ...j,
        lon: j.lon || j.lng || null,
        volumeM3: j.volume_m3 || j.volumeM3 || 0,
        timeFrom: j.time_from ?? j.timeFrom ?? null,
        timeTo: j.time_to ?? j.timeTo ?? null,
        timeStrict: j.time_strict ?? j.timeStrict ?? false,
        orderVolumes: j.order_volumes || j.orderVolumes || [],
        priority: j.priority || 'medium',
      }))

      const totalStops = route?.plan ? route.plan.reduce((s, d) => s + d.trucks.reduce((ss, t) => ss + t.stops.length, 0), 0) : 0
      const totalKm = route?.plan ? route.plan.reduce((s, d) => s + d.trucks.reduce((ss, t) => ss + (t.totalDistance || 0), 0), 0) : 0
      const trucksUsed = route?.plan ? route.plan.reduce((s, d) => s + d.trucks.filter(t => t.stops.length > 0).length, 0) : 0

      data[date] = {
        jobs: normalizedJobs,
        route: route || null,
        validated: route?.validated || false,
        totalJobs: normalizedJobs.length,
        totalStops,
        totalKm: Math.round(totalKm * 10) / 10,
        trucksUsed,
        pendingCount: normalizedJobs.filter(j => j.status === 'pending').length,
        todoCount: normalizedJobs.filter(j => j.status === 'todo').length,
      }
    }
    setWeekData(data)

    // Load unplanned jobs (no session_date or future)
    const { data: unplanned } = await getClient().from('jobs').select('*').is('session_date', null)
    setUnplannedJobs((unplanned || []).map(j => ({
      ...j,
      volumeM3: j.volume_m3 || j.volumeM3 || 0,
    })))
  }

  const assignJobToDate = async (job, date) => {
    await getClient().from('jobs').update({ session_date: date }).eq('id', job.id)
    setAssignModal(null)
    await loadWeekData()
  }

  const isToday = (dateStr) => dateStr === new Date().toISOString().slice(0, 10)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#94A3B8' }}>
      {fr ? 'Chargement...' : 'Loading...'}
    </div>
  )

  return (
    <>
      <Head>
        <title>RoundIT — Planning</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{`
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          :root{--bg:#F4F7F5;--white:#fff;--navy:#1B7A6B;--blue:#2ECC8F;--blue-soft:#E8F8F3;--border:#D6EAE4;--text:#1E293B;--muted:#94A3B8;--success:#059669;--success-soft:#F0FDF4;--warning:#D97706;--warning-soft:#FFFBEB;--danger:#DC2626;--indigo:#6366F1;--indigo-soft:#EEF2FF;--sans:'DM Sans',sans-serif}
          html,body{background:var(--bg);color:var(--text);font-family:var(--sans);height:100%;overflow:auto}
          ::-webkit-scrollbar{width:4px}
          ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
        `}</style>
      </Head>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}><span style={{ color: '#1B7A6B' }}>Round</span><span style={{ color: '#2ECC8F' }}>it</span></span>
          </a>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>/ {fr ? 'Planning' : 'Planning'}</span>

          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {/* Week navigation */}
          <button onClick={() => navigateWeek(-1)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--navy)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600 }}>←</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', minWidth: 160, textAlign: 'center' }}>📅 {formatWeekLabel()}</span>
          <button onClick={() => navigateWeek(1)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--navy)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 600 }}>→</button>

          <button onClick={() => setLang(l => l === 'fr' ? 'en' : 'fr')} style={{ padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 10, fontWeight: 700, color: 'var(--navy)', background: 'var(--bg)', cursor: 'pointer' }}>{lang === 'fr' ? 'EN' : 'FR'}</button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="/" style={{ padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--navy)', background: 'var(--bg)', cursor: 'pointer', textDecoration: 'none' }}>
              🗺 {fr ? 'Carte' : 'Map'}
            </a>
            {userProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)' }}>{userProfile.full_name}</span>
                <span style={{ fontSize: 8, padding: '2px 5px', borderRadius: 4, background: isManager ? 'var(--blue-soft)' : 'var(--indigo-soft)', color: isManager ? 'var(--navy)' : 'var(--indigo)', fontWeight: 700 }}>
                  {isManager ? 'Mgr' : 'Coord'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Week grid */}
        <div style={{ flex: 1, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            {weekDates.map(date => {
              const d = weekData[date] || {}
              const today = isToday(date)
              const hasJobs = d.totalJobs > 0
              const hasRoute = d.totalStops > 0

              return (
                <div key={date} style={{
                  background: 'var(--white)',
                  borderRadius: 12,
                  border: today ? '2px solid var(--blue)' : '1px solid var(--border)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minHeight: 200,
                  boxShadow: today ? '0 2px 12px rgba(46,204,143,0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  {/* Date header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: today ? 'var(--navy)' : 'var(--text)' }}>{formatDateShort(date)}</span>
                    {today && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'var(--blue-soft)', color: 'var(--navy)', fontWeight: 700 }}>{fr ? 'Auj.' : 'Today'}</span>}
                    {d.validated && <span style={{ fontSize: 10, marginLeft: 'auto' }}>✅</span>}
                  </div>

                  {/* Stats */}
                  {hasJobs ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>📍 {d.totalJobs} jobs</span>
                        {d.pendingCount > 0 && <span style={{ fontSize: 10, color: 'var(--indigo)', fontWeight: 500 }}>{d.pendingCount} {fr ? 'en attente' : 'pending'}</span>}
                      </div>
                      {hasRoute && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>🚛 {d.trucksUsed} {fr ? 'camion(s)' : 'truck(s)'}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>🗺 {d.totalKm} km</span>
                        </div>
                      )}
                      {d.todoCount > 0 && !hasRoute && (
                        <span style={{ fontSize: 10, color: 'var(--warning)' }}>⚠ {d.todoCount} {fr ? 'sélectionnés mais pas optimisés' : 'selected but not optimized'}</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{fr ? 'Aucun job' : 'No jobs'}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                    {hasJobs ? (
                      <a href={`/?date=${date}`} style={{
                        flex: 1, padding: '7px', textAlign: 'center', borderRadius: 7, fontSize: 11, fontWeight: 700,
                        background: 'var(--navy)', color: '#fff', textDecoration: 'none', cursor: 'pointer',
                      }}>
                        {fr ? 'Ouvrir' : 'Open'} →
                      </a>
                    ) : (
                      <button onClick={() => setAssignModal({ date })} style={{
                        flex: 1, padding: '7px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                        background: 'var(--blue-soft)', color: 'var(--navy)', border: '1px solid var(--blue)', cursor: 'pointer',
                      }}>
                        + {fr ? 'Planifier' : 'Plan'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unplanned jobs */}
          <div style={{ background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>📋 {fr ? 'Jobs non planifiés' : 'Unplanned jobs'}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>({unplannedJobs.length})</span>
            </div>

            {unplannedJobs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                {fr ? 'Aucun job sans date. Importez un CSV sans colonne session_date pour voir des jobs ici.' : 'No unplanned jobs. Import a CSV without session_date column to see jobs here.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {unplannedJobs.map(job => (
                  <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
                    <span style={{ fontSize: 10, color: 'var(--indigo)', fontWeight: 600 }}>{job.order_id}</span>
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, flex: 1 }}>{job.owner_name || job.address}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{job.address}</span>
                    {job.volumeM3 > 0 && <span style={{ fontSize: 9, color: 'var(--muted)' }}>📐 {job.volumeM3}m³</span>}

                    {/* Quick assign buttons */}
                    <div style={{ display: 'flex', gap: 3 }}>
                      {weekDates.map(date => (
                        <button key={date} onClick={() => assignJobToDate(job, date)}
                          style={{
                            padding: '3px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                            background: isToday(date) ? 'var(--blue-soft)' : 'var(--bg)',
                            color: 'var(--navy)', border: '1px solid var(--border)', cursor: 'pointer',
                          }}>
                          {formatDateShort(date).split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assign modal */}
        {assignModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setAssignModal(null)}>
            <div style={{ background: 'var(--white)', borderRadius: 14, padding: 24, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
                📅 {fr ? 'Planifier pour le' : 'Plan for'} {formatDateShort(assignModal.date)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {fr ? 'Les jobs seront ajoutés à cette date. Vous pourrez les optimiser depuis la page principale.' : 'Jobs will be added to this date. You can optimize them from the main page.'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                {fr ? 'Importez un CSV depuis la page principale avec cette date sélectionnée, ou assignez des jobs non planifiés ci-dessous.' : 'Import a CSV from the main page with this date selected, or assign unplanned jobs below.'}
              </div>
              <button onClick={() => { window.location.href = `/?date=${assignModal.date}` }}
                style={{ width: '100%', padding: 10, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                {fr ? 'Ouvrir cette date →' : 'Open this date →'}
              </button>
              <button onClick={() => setAssignModal(null)}
                style={{ width: '100%', padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                {fr ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
