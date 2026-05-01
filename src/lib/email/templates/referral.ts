import { COMPANY_DOMAIN, COMPANY_EMAIL } from '@/lib/constants'
import {
  sendEmail, escapeHtml, formatDateTime, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBanner, headerBannerWithBadge,
  footer, detailsCard, ctaButton,
} from '../base'

/** Email sent to the clinic when a referral is created */
export function referralCreatedEmail(
  clinicName: string,
  clinicEmail: string,
  lawyerName: string,
  lawyerFirm: string,
  patientName: string,
  caseType: string,
  coverage: string,
  pip: string
) {
  const safe = {
    clinicName: escapeHtml(clinicName),
    lawyerName: escapeHtml(lawyerName),
    lawyerFirm: escapeHtml(lawyerFirm),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
    coverage: escapeHtml(coverage),
    pip: escapeHtml(pip),
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
          { label: 'Coverage', value: safe.coverage },
          { label: 'PIP', value: safe.pip },
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
  lawyerName: string,
  lawyerFirm: string,
  clinicName: string,
  patientName: string,
  caseType: string,
  coverage: string,
  pip: string,
  createdAt: string
) {
  const safe = {
    lawyerName: escapeHtml(lawyerName),
    lawyerFirm: escapeHtml(lawyerFirm),
    clinicName: escapeHtml(clinicName),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
    coverage: escapeHtml(coverage),
    pip: escapeHtml(pip),
  }

  const dateStr = formatDateTime(createdAt)
  const firmLine = safe.lawyerFirm ? ` (${safe.lawyerFirm})` : ''

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `[Internal] New Referral: ${safe.lawyerName} → ${safe.clinicName}`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Referral Activity', 'A new referral has been recorded in the system', 'linear-gradient(135deg,#991b1b 0%,#dc2626 50%,#ef4444 100%)', 'Internal')}

      <div style="padding:36px 32px;">
        <div style="background:linear-gradient(135deg,#fef2f2 0%,#fff1f2 100%);border:1px solid #fecaca;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
          <p style="color:#6b7280;margin:0 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Referral Flow</p>
          <p style="color:#991b1b;margin:0;font-size:17px;font-weight:700;">
            ${safe.lawyerName}${firmLine} &rarr; ${safe.clinicName}
          </p>
        </div>

        ${detailsCard('Referral Details', 'linear-gradient(135deg,#991b1b 0%,#dc2626 100%)', [
          { label: 'Sent By', value: `${safe.lawyerName}${firmLine}` },
          { label: 'Clinic', value: safe.clinicName },
          { label: 'Patient', value: safe.patientName },
          { label: 'Case Type', value: safe.caseType },
          { label: 'Coverage', value: safe.coverage },
          { label: 'PIP', value: safe.pip },
          { label: 'Timestamp', value: `${dateStr} (ET)` },
        ])}

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/referrals`, 'linear-gradient(135deg,#991b1b 0%,#dc2626 100%)', 'rgba(220,38,38,0.35)')}
      </div>

      ${footer('Internal automated notification. Confidential &mdash; Do not forward.')}
    `),
  })
}
