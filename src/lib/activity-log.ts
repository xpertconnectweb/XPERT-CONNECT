import { supabaseAdmin } from '@/lib/supabase'
import type { LogActivityParams } from '@/types/admin'

/**
 * Fire-and-forget activity logger. Never throws.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: params.userId,
      user_name: params.userName,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      target_name: params.targetName || null,
      details: params.details || {},
    })
  } catch {
    // Silent fail — activity logging should never block operations
  }
}
