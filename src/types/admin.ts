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
  | 'referrer_referral_assigned'
  | 'referrer_referral_updated'
  | 'referrer_referral_deleted'

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
  platform: {
    defaultState: string
    companyName: string
  }
}
