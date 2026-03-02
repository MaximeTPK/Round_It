import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [client, setClient] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const { createClient } = require('@supabase/supabase-js')
    if (!window.__sb) window.__sb = createClient('https://yqjenhpaohwunjvgmlyw.supabase.co', ANON_KEY)
    setClient(window.__sb)
    // Si déjà connecté → redirect
    window.__sb.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [])

  const handleLogin = async () => {
    if (!client) return
    setLoading(true); setError(null)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.replace('/')
  }

  return (
    <>
      <Head>
        <title>RoundIT — Connexion</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:#F7F9FC;display:flex;align-items:center;justify-content:center;height:100vh}
      `}</style>
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:16,padding:40,width:380,boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
       <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:32}}>
  <span style={{fontSize:22,fontWeight:700}}>
    <span style={{color:'#1B7A6B'}}>Round</span><span style={{color:'#2ECC8F'}}>it</span>
  </span>
</div>
        <div style={{fontSize:22,fontWeight:700,color:'#0F2D52',marginBottom:4}}>Connexion</div>
        <div style={{fontSize:13,color:'#94A3B8',marginBottom:28}}>Accédez à votre espace RoundIT</div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:'#1E293B',display:'block',marginBottom:6}}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="vous@example.com"
            style={{width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none'}}/>
        </div>
        <div style={{marginBottom:8}}>
          <label style={{fontSize:12,fontWeight:600,color:'#1E293B',display:'block',marginBottom:6}}>Mot de passe</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="••••••••"
            style={{width:'100%',padding:'10px 14px',border:'1px solid '+(error?'#DC2626':'#E2E8F0'),borderRadius:8,fontSize:14,outline:'none'}}/>
        </div>
        {error && <div style={{fontSize:12,color:'#DC2626',marginBottom:12}}>⚠️ {error}</div>}
        <button onClick={handleLogin} disabled={loading || !email || !password || !client}
          style={{width:'100%',padding:'11px',background:loading||!email||!password?'#E2E8F0':'#0F2D52',color:loading||!email||!password?'#94A3B8':'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',marginTop:12}}>
          {loading ? 'Connexion...' : 'Se connecter →'}
        </button>
        <div style={{textAlign:'center',marginTop:20,fontSize:13,color:'#94A3B8'}}>
          Pas encore de compte ?{' '}
          <a href="/register" style={{color:'#2563EB',fontWeight:600,textDecoration:'none'}}>S'inscrire</a>
        </div>
      </div>
    </>
  )
}
