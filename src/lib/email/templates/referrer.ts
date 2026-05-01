import { COMPANY_DOMAIN } from '@/lib/constants'
import {
  sendEmail, escapeHtml, formatDateTime, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBannerWithBadge, footer,
  detailsCard, ctaButton,
} from '../base'

/** Internal notification when a referrer submits a new referral */
export function referrerReferralNotificationEmail(
  referrerName: string,
  state: string,
  clientName: string,
  clientPhone: string,
  clientAddress: string,
  serviceNeeded: string,
  caseType: string,
  notes: string,
  createdAt: string
) {
  const safe = {
    referrerName: escapeHtml(referrerName),
    state: escapeHtml(state),
    clientName: escapeHtml(clientName),
    clientPhone: escapeHtml(clientPhone),
    clientAddress: escapeHtml(clientAddress),
    serviceNeeded: escapeHtml(serviceNeeded),
    caseType: escapeHtml(caseType),
    notes: escapeHtml(notes),
  }

  const dateStr = formatDateTime(createdAt)
  const serviceLabel = safe.serviceNeeded === 'clinic' ? 'Clinic' : safe.serviceNeeded === 'lawyer' ? 'Attorney' : 'Both'
  const stateLabel = safe.state === 'FL' ? 'Florida' : safe.state === 'MN' ? 'Minnesota' : safe.state

  const rows = [
    { label: 'Client', value: safe.clientName },
    { label: 'Phone', value: safe.clientPhone },
    { label: 'Address', value: safe.clientAddress },
    { label: 'Service', value: serviceLabel },
    { label: 'Case Type', value: safe.caseType },
    ...(safe.notes ? [{ label: 'Notes', value: safe.notes }] : []),
    { label: 'Timestamp', value: `${dateStr} (ET)` },
  ]

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `[Partner Referral] New from ${safe.referrerName} — ${stateLabel}`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Partner Referral', 'A referrer has submitted a new client referral', 'linear-gradient(135deg,#c2410c 0%,#ea580c 50%,#f97316 100%)', 'Partner Referral')}

      <div style="padding:36px 32px;">
        <div style="background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:1px solid #fed7aa;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
          <p style="color:#6b7280;margin:0 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Referrer</p>
          <p style="color:#c2410c;margin:0;font-size:17px;font-weight:700;">
            ${safe.referrerName} &mdash; ${stateLabel}
          </p>
        </div>

        ${detailsCard('Referral Details', 'linear-gradient(135deg,#c2410c 0%,#ea580c 100%)', rows)}

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/referrer-referrals`, 'linear-gradient(135deg,#c2410c 0%,#ea580c 100%)', 'rgba(234,88,12,0.35)')}
      </div>

      ${footer('Internal automated notification. Confidential &mdash; Do not forward.')}
    `),
  })
}
