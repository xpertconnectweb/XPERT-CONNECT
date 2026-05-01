import { getServerSession, type Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

interface AuthResult {
  session: Session
  error: NextResponse | null
}

export async function requireAdmin(): Promise<AuthResult> {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return { session: {} as Session, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session, error: null }
}

export async function requireAuth(allowedRoles?: string[]): Promise<AuthResult> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { session: {} as Session, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return { session: {} as Session, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, error: null }
}
