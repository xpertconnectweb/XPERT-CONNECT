export interface LogActivityParams {
  userId: string
  userName: string
  action: ActivityAction
  targetType?: string
  targetId?: string
  targetName?: string
  details?: Record<string, unknown>
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

export type ActivityAction =
  | 'clinic_created'
  | 'clinic_updated'
  | 'clinic_deleted'
  | 'lawyer_created'
  | 'lawyer_updated'
  | 'lawyer_deleted'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'bulk_toggle_availability'
  | 'bulk_delete'
  | 'settings_updated'
  | 'referral_created'
  | 'referral_status_changed'
  | 'referral_deleted'
  | 'referrer_referral_assigned'
  | 'referrer_referral_status_changed'
  | 'referrer_referral_updated'
  | 'referrer_referral_deleted'
  // Opt-in, verification, opt-out and admin revocation. Only the
  // legally significant events land here; individual sends go to the
  // `sms_messages` table instead, or a busy week would bury the audit
  // feed under a few hundred delivery rows.
  | 'sms_consent_changed'

export interface ActivityLog {
  id: number
  user_id: string
  user_name: string
  action: ActivityAction
  target_type?: string
  target_id?: string
  target_name?: string
  details?: Record<string, unknown>
  created_at: string
}

export interface PlatformSettings {
  specialties_list: string[]
  practice_areas_list: string[]
  referral_notifications: {
    enabled: boolean
    internalEmail: string
  }
  /**
   * Global kill switch for referral texts.
   *
   * Unlike `referral_notifications` above — which the admin UI has
   * written since May and which NO send path has ever read — this one
   * is consulted on every referral, via `smsNotificationsEnabled()`
   * in lib/data.ts. Absent means enabled, so a database blip degrades
   * to "SMS still works" rather than silently killing every alert.
   */
  sms_notifications: {
    enabled: boolean
  }
  platform: {
    defaultState: string
    companyName: string
  }
}
