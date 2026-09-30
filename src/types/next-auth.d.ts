import { DefaultSession } from 'next-auth'
import { UserRole } from './professionals'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      clinicId?: string
      lawyerId?: string
      firmName?: string
      username: string
      state?: string
      /** Set when the account was deleted or its password changed; see src/lib/auth.ts. */
      revoked?: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: UserRole
    clinicId?: string
    lawyerId?: string
    firmName?: string
    username: string
    state?: string
    /** Fingerprint of the stored password hash at sign-in. */
    pwv?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    clinicId?: string
    lawyerId?: string
    firmName?: string
    username: string
    state?: string
    pwv?: string
    revoked?: boolean
    refreshedAt?: number
  }
}
