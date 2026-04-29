import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = req.nextauth.token?.role

    // Protect /admin/* routes: only admin users allowed
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/professionals/login', req.url))
    }

    // Partners can only access /partners/* routes
    if (role === 'partner' && (pathname.startsWith('/professionals') || pathname.startsWith('/admin'))) {
      return NextResponse.redirect(new URL('/partners/map', req.url))
    }

    // Non-partner users cannot access /partners/* routes (except admin)
    if (pathname.startsWith('/partners') && role !== 'partner' && role !== 'admin') {
      return NextResponse.redirect(new URL('/professionals/login', req.url))
    }

    return NextResponse.next()
  },
  {
    pages: {
      signIn: '/professionals/login',
    },
  }
)

export const config = {
  matcher: [
    '/professionals/((?!login).*)',
    '/admin/((?!login).*)',
    '/partners/((?!login).*)',
  ],
}
