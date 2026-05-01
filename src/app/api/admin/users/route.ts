import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getUsers, createUser } from '@/lib/data'
import { sanitize } from '@/lib/sanitize'
import { logActivity } from '@/lib/activity-log'
import { VALID_ROLES, EMAIL_RE, USERNAME_RE } from '@/lib/validation'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const users = await getUsers()
  const safe = users.map(({ password: _, ...rest }) => rest)
  return NextResponse.json(safe)
}

export async function POST(request: NextRequest) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  const body = await request.json()
  const { name, username, password, role, email, firmName, clinicId, state } = body

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
      state: role === 'lawyer' && state ? state : undefined,
    })

    const { password: _, ...safe } = user

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'user_created',
      targetType: 'user',
      targetId: user.id,
      targetName: user.name,
    })

    return NextResponse.json(safe, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create user. Username may already exist.' }, { status: 500 })
  }
}
