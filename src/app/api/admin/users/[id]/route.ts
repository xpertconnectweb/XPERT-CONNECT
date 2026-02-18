import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserById, updateUser, deleteUser } from '@/lib/data'
import { sanitize } from '@/lib/sanitize'
import bcrypt from 'bcryptjs'
import type { UserRole } from '@/types/professionals'

const VALID_ROLES: UserRole[] = ['lawyer', 'clinic', 'admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await getUserById(id)
  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await request.json()
  const fields: Record<string, unknown> = {}

  if (body.name) {
    const cleanName = sanitize(body.name)
    if (cleanName.length < 2 || cleanName.length > 100) {
      return NextResponse.json({ error: 'Name must be 2-100 characters' }, { status: 400 })
    }
    fields.name = cleanName
  }

  if (body.email) {
    if (!EMAIL_RE.test(body.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    fields.email = body.email
  }

  if (body.username) {
    if (!USERNAME_RE.test(body.username)) {
      return NextResponse.json({ error: 'Username must be 3-30 characters (letters, numbers, underscore)' }, { status: 400 })
    }
    fields.username = body.username
  }

  if (body.role) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    fields.role = body.role
  }

  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    fields.password = await bcrypt.hash(body.password, 10)
  }

  if (body.firmName !== undefined) fields.firmName = sanitize(body.firmName || '')
  if (body.clinicId !== undefined) fields.clinicId = body.clinicId

  const updated = await updateUser(id, fields)
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }

  const { password: _, ...safe } = updated
  return NextResponse.json(safe)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Prevent self-deletion
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const success = await deleteUser(id)
  if (!success) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
