import 'server-only'
import crypto from 'node:crypto'
import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { getUserByUsername, lookupUserForSession } from './data'
import { RATE_LIMITS, claimRateLimit, clientIp } from './security/rate-limit'

/** How often a live session is re-checked against the users table. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000

/**
 * Compared against when the username does not exist, so an unknown user
 * costs the same bcrypt round as a wrong password. Without it the "no such
 * user" answer came back before any hashing, and response time alone told
 * an attacker which usernames are real. Cost 10, like the stored hashes.
 */
const DUMMY_HASH = '$2b$10$pOWP2E/zXytnPtaKk3VRw.g9M57wf7TJff8C1l58Wy/8uJ3YJdJRS' // hash of 48 random hex chars, discarded

/**
 * A fingerprint of the stored password hash, carried in the token.
 *
 * When the password changes, the hash changes, the fingerprint stops
 * matching at the next refresh, and every session issued under the old
 * password is revoked — without a sessions table or a migration. It is a
 * truncated SHA-256 of a bcrypt hash, so it reveals nothing usable.
 */
export function passwordFingerprint(storedHash: string): string {
  return crypto.createHash('sha256').update(storedHash).digest('hex').slice(0, 16)
}

/**
 * Re-reads the user behind a token and applies what changed.
 *
 * - user deleted, or password changed since the token was issued → revoked
 * - database unreachable → token kept as is, and retried on the next request
 *   (`refreshedAt` is not advanced), so a blip neither logs everyone out nor
 *   postpones the check by five minutes
 * - tokens issued before fingerprints existed are adopted, not revoked
 */
export async function refreshToken(token: JWT): Promise<JWT> {
  const lookup = await lookupUserForSession(token.id).catch(
    () => ({ status: 'error' }) as const
  )

  if (lookup.status === 'error') return token

  if (lookup.status === 'missing') {
    return { ...token, revoked: true, refreshedAt: Date.now() }
  }

  const dbUser = lookup.user
  const fingerprint = passwordFingerprint(dbUser.password)
  if (token.pwv && token.pwv !== fingerprint) {
    return { ...token, revoked: true, refreshedAt: Date.now() }
  }

  return {
    ...token,
    role: dbUser.role,
    clinicId: dbUser.clinicId,
    lawyerId: dbUser.lawyerId,
    firmName: dbUser.firmName,
    state: dbUser.state,
    name: dbUser.name,
    email: dbUser.email,
    pwv: fingerprint,
    refreshedAt: Date.now(),
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const username = credentials?.username?.trim() ?? ''
        const password = credentials?.password ?? ''
        if (!username || !password) return null
        if (username.length > 100 || password.length > 200) return null

        /**
         * Throttled before bcrypt, per username and per IP. Per username
         * stops a guessing run against one account from any number of
         * addresses; per IP stops one address walking many accounts.
         * A throttled attempt is answered exactly like a wrong password —
         * next-auth only lets `authorize` say yes or no — so this reveals
         * nothing about whether the account exists.
         */
        const [userOk, ipOk] = await Promise.all([
          claimRateLimit(RATE_LIMITS.loginPerUser, username),
          claimRateLimit(RATE_LIMITS.loginPerIp, clientIp(req?.headers)),
        ])
        if (!userOk || !ipOk) {
          console.warn('Login throttled', { user: !userOk, ip: !ipOk })
          return null
        }

        const user = await getUserByUsername(username)
        const isValid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)
        if (!user || !isValid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clinicId: user.clinicId,
          lawyerId: user.lawyerId,
          firmName: user.firmName,
          username: user.username,
          state: user.state,
          pwv: passwordFingerprint(user.password),
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.clinicId = user.clinicId
        token.lawyerId = user.lawyerId
        token.firmName = user.firmName
        token.username = user.username
        token.state = user.state
        token.pwv = user.pwv
        token.revoked = false
        token.refreshedAt = Date.now()
      }
      // A revoked token stays revoked; there is nothing to refresh.
      if (token.revoked) return token

      const refreshedAt = (token.refreshedAt as number) || 0
      if (Date.now() - refreshedAt > REFRESH_INTERVAL_MS) {
        return refreshToken(token)
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.clinicId = token.clinicId
      session.user.lawyerId = token.lawyerId
      session.user.firmName = token.firmName
      session.user.username = token.username
      session.user.state = token.state
      session.user.revoked = Boolean(token.revoked)
      return session
    },
  },
  pages: {
    signIn: '/professionals/login',
  },
}
