// Barrel re-export, mirroring src/lib/email/index.ts.
export { sendSms, twilioConfig } from './base'
export type { SmsResult, SmsFailureKind } from './base'

export {
  notifyUsersOfReferral,
  eligibleForSms,
  SMS_PACING_MS,
  MAX_SMS_PER_REFERRAL,
  PER_USER_THROTTLE_MS,
} from './notify'

export {
  referralAlertSms,
  verificationCodeSms,
  optInConfirmationSms,
  truncateOrg,
  HELP_REPLY,
  STOP_REPLY,
  SMS_SHORT_LINK,
} from './templates'

export {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  OTP_LENGTH,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './otp'

export {
  currentConsentText,
  isSmsEligibleRole,
  CURRENT_CONSENT_VERSION,
  SMS_CONSENT_TEXTS,
  SMS_ELIGIBLE_ROLES,
} from './consent'

export { computeTwilioSignature, verifyTwilioSignature } from './signature'
export { isGsm7, toGsm7, assertSingleSegment } from './gsm7'
