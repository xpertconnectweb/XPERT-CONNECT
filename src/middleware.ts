import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/professionals/login',
  },
})

export const config = {
  matcher: [
    '/professionals/((?!login).*)' // protect everything under /professionals except /login
  ],
}
