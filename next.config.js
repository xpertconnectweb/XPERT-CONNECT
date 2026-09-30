/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  // No "X-Powered-By: Next.js": it tells a scanner which advisories to try.
  poweredByHeader: false,
  async redirects() {
    return [
      {
        // The short link carried in every SMS alert. '844xpert.com/r'
        // is 14 characters where the full path is 44, and those 30
        // characters are what keep a long firm name inside a single
        // 160-character segment — i.e. inside one message's worth of
        // billing.
        //
        // Unauthenticated visitors are bounced to the login by
        // middleware and land back here afterwards, so the link works
        // whether or not the phone still has a session.
        source: '/r',
        destination: '/professionals/referrals',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Two years, every subdomain. Not `preload`: getting off the
          // browsers' preload list takes months if a subdomain ever needs
          // plain http.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-eval only in dev (Next.js HMR requires it).
              //
              // 'unsafe-inline' stays in production on purpose: Next injects
              // inline bootstrap scripts, and the alternative — a per-request
              // nonce — makes every page dynamic, which would cost the
              // directory and the landing page their ISR. The one inline
              // script built from stored data (the directory's JSON-LD) is
              // escaped by jsonForScript instead.
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              // next/font self-hosts the fonts, so no Google origins.
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' https://*.tile.openstreetmap.org data: blob:",
              // The browser talks to this origin and the map tiles, nothing
              // else. Supabase, Nominatim and every geocoder are reached
              // server-side only, so clients' addresses never leave our origin.
              "connect-src 'self' https://*.tile.openstreetmap.org",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              ...(isDev ? [] : ['upgrade-insecure-requests']),
            ].join('; '),
          },
        ],
      },
      // Cache static assets
      {
        source: '/images/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
