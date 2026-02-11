import nodemailer from 'nodemailer'

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null

const INTERNAL_EMAIL = process.env.INTERNAL_EMAIL || ''

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  })
}

interface EmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (transporter) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@xpertconnect.com',
      ...options,
    })
  } else {
    console.log('=== EMAIL NOTIFICATION ===')
    console.log(`To: ${options.to}`)
    console.log(`Subject: ${options.subject}`)
    console.log('=========================')
  }
}

/** Email sent to the clinic when a referral is created */
export function referralCreatedEmail(
  clinicName: string,
  clinicEmail: string,
  lawyerName: string,
  lawyerFirm: string,
  patientName: string,
  caseType: string
) {
  const safe = {
    clinicName: escapeHtml(clinicName),
    lawyerName: escapeHtml(lawyerName),
    lawyerFirm: escapeHtml(lawyerFirm),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
  }

  const firmLine = safe.lawyerFirm
    ? ` from <strong>${safe.lawyerFirm}</strong>`
    : ''

  return sendEmail({
    to: clinicEmail,
    subject: `New Patient Referral from ${safe.lawyerName}`,
    html: `
      <h2>New Patient Referral</h2>
      <p>Hello ${safe.clinicName},</p>
      <p>You have received a new patient referral from <strong>${safe.lawyerName}</strong>${firmLine}.</p>
      <ul>
        <li><strong>Patient:</strong> ${safe.patientName}</li>
        <li><strong>Case Type:</strong> ${safe.caseType}</li>
      </ul>
      <p>Please log in to your Xpert Connect dashboard to view the full details.</p>
      <p>Best regards,<br>Xpert Connect</p>
    `,
  })
}

/** Email sent to the internal Xpert Connect team on every referral */
export function internalNotificationEmail(
  lawyerName: string,
  lawyerFirm: string,
  clinicName: string,
  patientName: string,
  caseType: string,
  createdAt: string
) {
  const safe = {
    lawyerName: escapeHtml(lawyerName),
    lawyerFirm: escapeHtml(lawyerFirm),
    clinicName: escapeHtml(clinicName),
    patientName: escapeHtml(patientName),
    caseType: escapeHtml(caseType),
  }

  const dateStr = formatDateTime(createdAt)
  const firmLine = safe.lawyerFirm ? ` (${safe.lawyerFirm})` : ''

  const to = INTERNAL_EMAIL || 'internal-team@xpertconnect.com'

  return sendEmail({
    to,
    subject: `[Referral] ${safe.lawyerName} → ${safe.clinicName}`,
    html: `
      <h2>New Referral Notification</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px;">
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Sent by</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.lawyerName}${firmLine}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Clinic</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.clinicName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Patient</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.patientName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Case Type</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.caseType}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Date / Time</td><td style="padding:8px;">${dateStr} (ET)</td></tr>
      </table>
      <p style="margin-top:16px;color:#666;">This is an automated notification from Xpert Connect.</p>
    `,
  })
}
