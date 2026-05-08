import { COMPANY_DOMAIN, COMPANY_EMAIL } from '@/lib/constants'
import {
  sendEmail, escapeHtml, formatDateTime, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBanner, headerBannerWithBadge,
  footer, detailsCard, ctaButton,
} from '../base'

export interface ReferralExtras {
  coverage?: string
  pip?: string
  insuranceCompany?: string
  claimNumber?: string
  adjusterName?: string
  adjusterPhone?: string
  adjusterEmail?: string
}

function extrasRows(extras: ReferralExtras | undefined): { label: string; value: string }[] {
  if (!extras) return []
  const rows: { label: string; value: string }[] = []
  const push = (label: string, raw?: string) => {
    if (raw && raw.trim()) rows.push({ label, value: escapeHtml(raw) })
  }
  push('Coverage', extras.coverage)
  push('PIP', extras.pip)
  push('Insurance Company', extras.insuranceCompany)
  push('Claim Number', extras.claimNumber)
  push('Adjuster Name', extras.adjusterName)
  push('Adjuster Phone', extras.adjusterPhone)
  push('Adjuster Email', extras.adjusterEmail)
  return rows
}

/** Email sent to the clinic when a referral is created */
export function referralCreatedEmail(
  clinicName: string,
  clinicEmail: string,
  lawyerName: string,
  lawyerFirm: string,
  patientName: string,
  caseType: string,
  extras?: ReferralExtras
) {
  const safe = {
    clinicName: escapeHtml(clinicName),
    lawyerName: escapeHtml(lawyerName),
    lawyerFirm: escapeHtml(lawyerFirm),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
  }

  const firmLine = safe.lawyerFirm ? ` from ${safe.lawyerFirm}` : ''

  return sendEmail({
    to: clinicEmail,
    subject: `New Patient Referral from ${safe.lawyerName} | Xpert Connect`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBanner('New Patient Referral', 'A new referral has been submitted for your clinic', 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 50%,#3b82f6 100%)', '&#127973;')}

      <div style="padding:36px 32px;">
        <p style="font-size:16px;color:#1f2937;line-height:1.7;margin:0 0 8px 0;">
          Dear <strong>${safe.clinicName}</strong>,
        </p>
        <p style="font-size:15px;color:#4b5563;line-height:1.7;margin:0 0 28px 0;">
          You have received a new patient referral from attorney <strong style="color:#1f2937;">${safe.lawyerName}</strong>${firmLine}. Please review the details below and take the appropriate action.
        </p>

        ${detailsCard('Referral Details', 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)', [
          { label: 'Patient', value: safe.patientName },
          { label: 'Case Type', value: safe.caseType },
          ...extrasRows(extras),
        ])}

        ${ctaButton('View Full Referral Details', `${COMPANY_DOMAIN}/professionals/referrals`, 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)', 'rgba(37,99,235,0.35)')}

        <div style="border-top:1px solid #e5e7eb;margin:28px 0;"></div>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0;">
          If you have any questions, please contact us at <a href="mailto:${COMPANY_EMAIL}" style="color:#2563eb;text-decoration:none;font-weight:500;">${COMPANY_EMAIL}</a>
        </p>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:20px 0 0 0;">
          Best regards,<br>
          <strong style="color:#1f2937;">The Xpert Connect Team</strong>
        </p>
      </div>

      ${footer('This is an automated notification. Please do not reply directly to this email.')}
    `),
  })
}

/** Email sent to the internal Xpert Connect team on every referral */
export function internalNotificationEmail(
  senderName: string,
  senderFirm: string,
  recipientName: string,
  patientName: string,
  caseType: string,
  createdAt: string,
  extras?: ReferralExtras,
  direction: 'lawyer-to-clinic' | 'clinic-to-lawyer' = 'lawyer-to-clinic'
) {
  const safe = {
    senderName: escapeHtml(senderName),
    senderFirm: escapeHtml(senderFirm),
    recipientName: escapeHtml(recipientName),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
  }

  const dateStr = formatDateTime(createdAt)
  const firmLine = safe.senderFirm ? ` (${safe.senderFirm})` : ''
  const senderRole = direction === 'lawyer-to-clinic' ? 'Sent By' : 'From Clinic'
  const recipientRole = direction === 'lawyer-to-clinic' ? 'Clinic' : 'To Specialist'

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `[Internal] New Referral: ${safe.senderName} → ${safe.recipientName}`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Referral Activity', 'A new referral has been recorded in the system', 'linear-gradient(135deg,#991b1b 0%,#dc2626 50%,#ef4444 100%)', 'Internal')}

      <div style="padding:36px 32px;">
        <div style="background:linear-gradient(135deg,#fef2f2 0%,#fff1f2 100%);border:1px solid #fecaca;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
          <p style="color:#6b7280;margin:0 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Referral Flow</p>
          <p style="color:#991b1b;margin:0;font-size:17px;font-weight:700;">
            ${safe.senderName}${firmLine} &rarr; ${safe.recipientName}
          </p>
        </div>

        ${detailsCard('Referral Details', 'linear-gradient(135deg,#991b1b 0%,#dc2626 100%)', [
          { label: senderRole, value: `${safe.senderName}${firmLine}` },
          { label: recipientRole, value: safe.recipientName },
          { label: 'Patient', value: safe.patientName },
          { label: 'Case Type', value: safe.caseType },
          ...extrasRows(extras),
          { label: 'Timestamp', value: `${dateStr} (ET)` },
        ])}

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/referrals`, 'linear-gradient(135deg,#991b1b 0%,#dc2626 100%)', 'rgba(220,38,38,0.35)')}
      </div>

      ${footer('Internal automated notification. Confidential &mdash; Do not forward.')}
    `),
  })
}

/** Email sent to a specialist (lawyer) when a clinic refers a patient */
export function clinicToLawyerReferralEmail(
  lawyerName: string,
  lawyerEmail: string,
  clinicName: string,
  patientName: string,
  patientPhone: string,
  caseType: string,
  extras?: ReferralExtras
) {
  const safe = {
    lawyerName: escapeHtml(lawyerName),
    clinicName: escapeHtml(clinicName),
    patientName: escapeHtml(patientName),
    patientPhone: escapeHtml(patientPhone),
    caseType: escapeHtml(caseType),
  }

  return sendEmail({
    to: lawyerEmail,
    subject: `New Patient Referral from ${safe.clinicName} | Xpert Connect`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBanner('New Patient Referral', 'A clinic has referred a patient to your firm', 'linear-gradient(135deg,#92400e 0%,#b45309 50%,#d97706 100%)', '&#9878;')}

      <div style="padding:36px 32px;">
        <p style="font-size:16px;color:#1f2937;line-height:1.7;margin:0 0 8px 0;">
          Dear <strong>${safe.lawyerName}</strong>,
        </p>
        <p style="font-size:15px;color:#4b5563;line-height:1.7;margin:0 0 28px 0;">
          <strong style="color:#1f2937;">${safe.clinicName}</strong> has referred a patient to your firm. Please review the details below and reach out to the patient directly.
        </p>

        ${detailsCard('Referral Details', 'linear-gradient(135deg,#92400e 0%,#b45309 100%)', [
          { label: 'Patient', value: safe.patientName },
          { label: 'Patient Phone', value: safe.patientPhone },
          { label: 'Case Type', value: safe.caseType },
          { label: 'Referring Clinic', value: safe.clinicName },
          ...extrasRows(extras),
        ])}

        ${ctaButton('Open Patient Referral', `${COMPANY_DOMAIN}/professionals/referrals`, 'linear-gradient(135deg,#92400e 0%,#b45309 100%)', 'rgba(180,83,9,0.35)')}

        <div style="border-top:1px solid #e5e7eb;margin:28px 0;"></div>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0;">
          If you have any questions, please contact us at <a href="mailto:${COMPANY_EMAIL}" style="color:#b45309;text-decoration:none;font-weight:500;">${COMPANY_EMAIL}</a>
        </p>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:20px 0 0 0;">
          Best regards,<br>
          <strong style="color:#1f2937;">The Xpert Connect Team</strong>
        </p>
      </div>

      ${footer('This is an automated notification. Please do not reply directly to this email.')}
    `),
  })
}
