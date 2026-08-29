import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Removes one audit entry.
 *
 * WHY THIS EXISTS: `activity_logs.target_name` stores the patient or client
 * name, and the table has no FK to either referral table — so after a case is
 * deleted its name still sits in the feed, and until now there was no way at
 * all to take it out. That makes an erasure request impossible to honour.
 *
 * DELIBERATELY NOT AUDITED: this handler does not call `logActivity`. Writing
 * "admin deleted the log entry for <name>" would put the very name being
 * erased straight back into the table it was just removed from.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  // `activity_logs.id` is SERIAL, so a valid id is a positive integer and
  // nothing else. Match the digits rather than trusting a numeric coercion:
  // `parseInt` turns "12abc" into 12, and `Number("")` is 0 — both of which
  // would go on to delete a row the caller never named.
  const numericId = Number(id)
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { error, count } = await supabaseAdmin
    .from('activity_logs')
    .delete({ count: 'exact' })
    .eq('id', numericId)

  if (error) {
    console.error('activity log DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
