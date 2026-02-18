import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUsers, createUser } from '@/lib/data'
import { sanitize } from '@/lib/sanitize'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import type { UserRole } from '@/types/professionals'

const VALID_ROLES: UserRole[] = ['lawyer', 'clinic', 'admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await getUsers()
  const safe = users.map(({ password: _, ...rest }) => rest)
  return NextResponse.json(safe)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, username, password, role, email, firmName, clinicId } = body

  if (!name || !username || !password || !role || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cleanName = sanitize(name)
  if (cleanName.length < 2 || cleanName.length > 100) {
    return NextResponse.json({ error: 'Name must be 2-100 characters' }, { status: 400 })
  }

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'Username must be 3-30 characters (letters, numbers, underscore)' }, { status: 400 })
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const user = await createUser({
      id: `${role}-${uuidv4().slice(0, 8)}`,
      name: cleanName,
      username,
      password: hashedPassword,
      role,
      email,
      firmName: role === 'lawyer' ? sanitize(firmName || '') || undefined : undefined,
      clinicId: role === 'clinic' ? clinicId : undefined,
    })

    const { password: _, ...safe } = user
    return NextResponse.json(safe, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create user. Username may already exist.' }, { status: 500 })
  }
}
