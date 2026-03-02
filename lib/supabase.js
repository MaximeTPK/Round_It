import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yqjenhpaohwunjvgmlyw.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || SUPABASE_ANON_KEY)

export function getSupabaseClient() {
  if (typeof window === 'undefined') return null
  if (!window.__supabaseClient) {
    window.__supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return window.__supabaseClient
}
