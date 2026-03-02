import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

const SUPABASE_URL = 'https://yqjenhpaohwunjvgmlyw.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

const PUBLIC = ['/login', '/register']

export default function App({ Component, pageProps }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const { createClient } = require('@supabase/supabase-js')
    if (!window.__sb) window.__sb = createClient(SUPABASE_URL, ANON_KEY)
    const client = window.__sb

    // Vérification initiale
    client.auth.getSession().then(({ data: { session } }) => {
      if (!session && !PUBLIC.includes(router.pathname)) {
        router.replace('/login').then(() => setReady(true))
      } else {
        setReady(true)
      }
    })

    // Écoute les changements d'auth
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && PUBLIC.includes(router.pathname)) {
        router.replace('/')
      }
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return <Component {...pageProps} />
}
