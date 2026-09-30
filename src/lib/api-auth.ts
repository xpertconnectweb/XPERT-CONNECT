import 'server-only'
import { getServerSession, type Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

interface AuthResult {
  session: Session
  error: NextResponse | null
}

/**
 * A session counts only if it exists and has not been revoked. A revoked
 * token (account deleted, password changed — see src/lib/auth.ts) is still
 * a validly signed JWT until it expires, so every check has to ask.
 */
function isLive(session: Session | null): session is Session {
  return Boolean(session?.user && !session.user.revoked)
}

export async function requireAdmin(): Promise<AuthResult> {
  const session = await getServerSession(authOptions)
  if (!isLive(session) || session.user.role !== 'admin') {
    return { session: {} as Session, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session, error: null }
}

export async function requireAuth(allowedRoles?: string[]): Promise<AuthResult> {
  const session = await getServerSession(authOptions)
  if (!isLive(session)) {
    return { session: {} as Session, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return { session: {} as Session, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, error: null }
}
