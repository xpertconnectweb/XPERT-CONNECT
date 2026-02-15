import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null
let _supabasePublic: SupabaseClient | null = null

// Admin client – server-side only (API routes, auth)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    }
    return (_supabaseAdmin as any)[prop]
  },
})

// Public client – for client-side or public operations (contact form, newsletter)
export const supabasePublic = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabasePublic) {
      _supabasePublic = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
    return (_supabasePublic as any)[prop]
  },
})
