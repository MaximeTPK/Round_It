import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

const SUPABASE_URL = 'https://yqjenhpaohwunjvgmlyw.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxamVuaHBhb2h3dW5qdmdtbHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTM1MTYsImV4cCI6MjA4Nzk4OTUxNn0.-81H9_nbaNJitTCJmVAJxE_l3FIio3algjCJGjovUcs'

function getClient() {
  if (typeof window === 'undefined') return null
  if (!window.__sb) {
    const { createClient } = require('@supabase/supabase-js')
    window.__sb = createClient(SUPABASE_URL, ANON_KEY)
  }
  return window.__sb
}

const PUBLIC = ['/login', '/register']

export default function App({ Component, pageProps }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const client = getClient()
    if (!client) { setReady(true); return }
    client.auth.getSession().then(({ data: { session } }) => {
      if (!session && !PUBLIC.includes(router.pathname)) {
        router.replace('/login').then(() => setReady(true))
      } else if (session && PUBLIC.includes(router.pathname)) {
        router.replace('/').then(() => setReady(true))
      } else {
        setReady(true)
      }
    })
  }, [router.pathname])

  if (!ready) return null
  return <Component {...pageProps} />
}
