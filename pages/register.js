import { useState } from 'react'
import Head from 'next/head'
import { supabaseClient } from '../lib/supabase'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas')
    if (password.length < 6) return setError('Mot de passe trop court (6 caractères minimum)')
    setLoading(true); setError(null)
    const { error } = await supabaseClient.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else setSuccess(true)
  }

  return (
    <>
      <Head>
        <title>RoundIT — Inscription</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:#F7F9FC;display:flex;align-items:center;justify-content:center;height:100vh}
      `}</style>
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:16,padding:40,width:380,boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:32}}>
          <div style={{width:10,height:10,background:'#2563EB',borderRadius:'50%'}}/>
          <span style={{fontSize:18,fontWeight:700,color:'#0F2D52'}}>RoundIT</span>
        </div>

        {success ? (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:40,marginBottom:16}}>📧</div>
            <div style={{fontSize:18,fontWeight:700,color:'#0F2D52',marginBottom:8}}>Vérifiez votre email</div>
            <div style={{fontSize:13,color:'#94A3B8',marginBottom:24}}>Un lien de confirmation a été envoyé à <b>{email}</b></div>
            <a href="/login" style={{color:'#2563EB',fontWeight:600,fontSize:13,textDecoration:'none'}}>← Retour à la connexion</a>
          </div>
        ) : (
          <>
            <div style={{fontSize:22,fontWeight:700,color:'#0F2D52',marginBottom:4}}>Créer un compte</div>
            <div style={{fontSize:13,color:'#94A3B8',marginBottom:28}}>Commencez à optimiser vos tournées</div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:'#1E293B',display:'block',marginBottom:6}}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="vous@example.com"
                style={{width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none'}}/>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:'#1E293B',display:'block',marginBottom:6}}>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none'}}/>
            </div>

            <div style={{marginBottom:8}}>
              <label style={{fontSize:12,fontWeight:600,color:'#1E293B',display:'block',marginBottom:6}}>Confirmer le mot de passe</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                placeholder="••••••••"
                style={{width:'100%',padding:'10px 14px',border:'1px solid '+(error?'#DC2626':'#E2E8F0'),borderRadius:8,fontSize:14,outline:'none'}}/>
            </div>

            {error && <div style={{fontSize:12,color:'#DC2626',marginBottom:12}}>⚠️ {error}</div>}

            <button onClick={handleRegister} disabled={loading || !email || !password || !confirm}
              style={{width:'100%',padding:'11px',background:loading||!email||!password||!confirm?'#E2E8F0':'#0F2D52',color:loading||!email||!password||!confirm?'#94A3B8':'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',marginTop:12}}>
              {loading ? 'Création...' : 'Créer mon compte →'}
            </button>

            <div style={{textAlign:'center',marginTop:20,fontSize:13,color:'#94A3B8'}}>
              Déjà un compte ?{' '}
              <a href="/login" style={{color:'#2563EB',fontWeight:600,textDecoration:'none'}}>Se connecter</a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
