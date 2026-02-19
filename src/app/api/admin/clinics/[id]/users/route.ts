import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUsersByClinicId } from '@/lib/data'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const users = await getUsersByClinicId(id)

    // Return simplified user data with just the fields needed
    const simplified = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username
    }))

    return NextResponse.json(simplified)
  } catch (error) {
    console.error('Error fetching clinic users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clinic users' },
      { status: 500 }
    )
  }
}
