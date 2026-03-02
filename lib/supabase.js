import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yqjenhpaohwunjvgmlyw.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || SUPABASE_ANON_KEY)

let _client = null
export const supabaseClient = (() => {
  if (typeof window === 'undefined') return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return _client
})()
