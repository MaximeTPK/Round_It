import { createClient } from '@supabase/supabase-js'

// Client serveur (secret) — pour les API routes
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Client navigateur (anon) — pour l'auth côté client
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
