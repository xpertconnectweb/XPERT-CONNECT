/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
    ],
  },
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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-eval only in dev (Next.js HMR requires it)
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' https://images.unsplash.com https://cdn.sanity.io https://*.tile.openstreetmap.org https://unpkg.com data: blob:",
              // Nominatim is deliberately absent: address lookup now goes
              // through /api/geocode, so the browser has no reason to reach it
              // and clients' home addresses never leave our origin.
              "connect-src 'self' https://*.supabase.co https://cdn.sanity.io https://*.tile.openstreetmap.org",
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
