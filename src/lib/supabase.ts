import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client – server-side only (API routes, auth)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Public client – for client-side or public operations (contact form, newsletter)
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey)
