import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://yqjenhpaohwunjvgmlyw.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY

// Client serveur (secret) — pour les API routes
export const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || SUPABASE_ANON_KEY
)

// Client navigateur (anon) — pour l'auth côté client
export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)
