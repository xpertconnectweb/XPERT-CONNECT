import { DefaultSession } from 'next-auth'
import { UserRole } from './professionals'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      clinicId?: string
      firmName?: string
      username: string
      state?: string
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: UserRole
    clinicId?: string
    firmName?: string
    username: string
    state?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    clinicId?: string
    firmName?: string
    username: string
    state?: string
  }
}
