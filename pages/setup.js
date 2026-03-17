import { useState, useEffect } from 'react'
import Head from 'next/head'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

function getClient() {
  if (!window.__sb) {
    const { createClient } = require('@supabase/supabase-js')
    window.__sb = createClient('https://yqjenhpaohwunjvgmlyw.supabase.co', ANON_KEY)
  }
  return window.__sb
}

export default function SetupPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    getClient().auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { window.location.href = '/login'; return }
      setEmail(session.user.email)

      // Check if profile already exists
      const { data: profile } = await getClient().from('profiles')
        .select('*').eq('id', session.user.id).single()

      if (profile) {
        // Profile exists, go to app
        window.location.href = '/'
        return
      }
      setLoading(false)
    })
  }, [])

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { data: { session } } = await getClient().auth.getSession()
    if (!session?.user) return

    await getClient().from('profiles').insert({
      id: session.user.id,
      email: session.user.email,
      full_name: name.trim(),
      role: 'coordinator', // Default role, manager will change it
    })

    window.location.href = '/'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'DM Sans, sans-serif', color: '#94A3B8' }}>
      Chargement...
    </div>
  )

  return (
    <>
      <Head>
        <title>RoundIT — Setup</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'DM Sans, sans-serif', background: '#F4F7F5' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            <span style={{ color: '#1B7A6B' }}>Round</span><span style={{ color: '#2ECC8F' }}>it</span>
          </div>
          <div style={{ fontSize: 14, color: '#94A3B8', marginBottom: 32 }}>Bienvenue ! Configurez votre profil.</div>

          <div style={{ textAlign: 'left', marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', marginBottom: 4, display: 'block' }}>Email</label>
            <div style={{ padding: '10px 14px', background: '#F4F7F5', borderRadius: 8, fontSize: 13, color: '#94A3B8' }}>{email}</div>
          </div>

          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', marginBottom: 4, display: 'block' }}>Votre nom</label>
            <input value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Prénom Nom"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #D6EAE4', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif' }} />
          </div>

          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16, lineHeight: 1.5 }}>
            Votre rôle sera défini par le manager de votre équipe.
          </div>

          <button onClick={handleSubmit} disabled={!name.trim() || saving}
            style={{ width: '100%', padding: '12px', background: !name.trim() || saving ? '#D6EAE4' : '#1B7A6B', color: !name.trim() || saving ? '#94A3B8' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {saving ? 'Enregistrement...' : 'Commencer →'}
          </button>
        </div>
      </div>
    </>
  )
}
