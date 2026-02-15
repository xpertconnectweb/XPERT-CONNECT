import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM || 'Xpert Connect <onboarding@resend.dev>'
const INTERNAL_EMAIL = process.env.INTERNAL_EMAIL || 'xpertconnect.web@gmail.com'

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
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
  })

  if (error) {
    console.error('Resend email error:', error)
    throw new Error(`Failed to send email: ${error.message}`)
  }

  console.log(`Email sent to ${options.to} (id: ${data?.id})`)
}

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
        <li><strong>Coverage:</strong> ${safe.coverage}</li>
        <li><strong>PIP:</strong> ${safe.pip}</li>
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
    subject: `[Referral] ${safe.lawyerName} → ${safe.clinicName}`,
    html: `
      <h2>New Referral Notification</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px;">
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Sent by</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.lawyerName}${firmLine}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Clinic</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.clinicName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Patient</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.patientName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Case Type</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.caseType}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Coverage</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.coverage}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">PIP</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.pip}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Date / Time</td><td style="padding:8px;">${dateStr} (ET)</td></tr>
      </table>
      <p style="margin-top:16px;color:#666;">This is an automated notification from Xpert Connect.</p>
    `,
  })
}

/** Email sent when someone submits the contact form */
export function contactFormEmail(
  name: string,
  email: string,
  phone: string,
  service: string,
  message: string
) {
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    phone: escapeHtml(phone),
    service: escapeHtml(service),
    message: escapeHtml(message),
  }

  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `[Contact] New message from ${safe.name}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px;">
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.email}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.phone}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Service</td><td style="padding:8px;border-bottom:1px solid #eee;">${safe.service}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Message</td><td style="padding:8px;">${safe.message || '(none)'}</td></tr>
      </table>
      <p style="margin-top:16px;color:#666;">This is an automated notification from Xpert Connect.</p>
    `,
  })
}

/** Email sent when someone subscribes to the newsletter */
export function newsletterSubscriptionEmail(email: string) {
  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `[Newsletter] New subscriber: ${email}`,
    html: `
      <h2>New Newsletter Subscriber</h2>
      <p>A new user has subscribed to the newsletter:</p>
      <p style="font-size:18px;font-weight:bold;">${escapeHtml(email)}</p>
      <p style="margin-top:16px;color:#666;">This is an automated notification from Xpert Connect.</p>
    `,
  })
}
