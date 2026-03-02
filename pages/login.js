import { useState } from 'react'
import Head from 'next/head'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true); setError(false)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      window.location.href = '/'
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>RoundIT — Login</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:#F7F9FC;display:flex;align-items:center;justify-content:center;height:100vh}
      `}</style>
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:16,padding:40,width:360,boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:32}}>
          <div style={{width:10,height:10,background:'#2563EB',borderRadius:'50%'}}/>
          <span style={{fontSize:18,fontWeight:700,color:'#0F2D52'}}>RoundIT</span>
        </div>
        <div style={{fontSize:14,fontWeight:600,color:'#1E293B',marginBottom:8}}>Mot de passe</div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="••••••••"
          style={{width:'100%',padding:'10px 14px',border:'1px solid '+(error?'#DC2626':'#E2E8F0'),borderRadius:8,fontSize:14,outline:'none',marginBottom:8}}
        />
        {error && <div style={{fontSize:12,color:'#DC2626',marginBottom:8}}>Mot de passe incorrect</div>}
        <button onClick={handleSubmit} disabled={loading || !password}
          style={{width:'100%',padding:'11px',background:loading||!password?'#E2E8F0':'#0F2D52',color:loading||!password?'#94A3B8':'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',marginTop:4}}>
          {loading ? 'Connexion...' : 'Accéder →'}
        </button>
      </div>
    </>
  )
}
