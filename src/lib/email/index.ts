// Barrel re-export — all existing imports from '@/lib/email' continue to work
export { sendEmail } from './base'
export { referralCreatedEmail, internalNotificationEmail } from './templates/referral'
export { contactFormEmail, contactConfirmationEmail } from './templates/contact'
export { newsletterWelcomeEmail, newsletterSubscriptionEmail } from './templates/newsletter'
export { referrerReferralNotificationEmail } from './templates/referrer'
