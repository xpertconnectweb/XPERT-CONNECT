import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null

/**
 * The one Supabase client in this app: service role, server-side only.
 *
 * Every read and write goes through here, which is what lets the database
 * deny the Data API roles (anon, authenticated) everything — see
 * scripts/migrations/2027-02-security-hardening.sql. There used to be a
 * second, anon-key client "for the contact form and newsletter"; nothing
 * imported it, and its existence is how "anon may insert contacts" policies
 * stayed in place long after the forms moved server-side. Do not add one
 * back: a browser that talks to Supabase directly needs RLS policies for
 * every table it touches, and this project has chosen not to have any.
 *
 * Not marked `server-only` because the operational scripts under scripts/
 * import it through tsx. It does not need to be: the service-role key is not a
 * NEXT_PUBLIC_ variable, so Next never inlines it into a client bundle — an
 * accidental browser import gets a client with no key, not the key.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      )
    }
    return (_supabaseAdmin as any)[prop]
  },
})
