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

  const firmLine = safe.lawyerFirm ? ` from ${safe.lawyerFirm}` : ''

  return sendEmail({
    to: clinicEmail,
    subject: `🏥 New Patient Referral from ${safe.lawyerName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);padding:40px 30px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">New Patient Referral</h1>
            <p style="color:#e0e7ff;margin:10px 0 0 0;font-size:16px;">Xpert Connect</p>
          </div>

          <!-- Content -->
          <div style="padding:40px 30px;">
            <p style="font-size:16px;color:#1f2937;line-height:1.6;margin:0 0 20px 0;">
              Hello <strong>${safe.clinicName}</strong>,
            </p>
            <p style="font-size:16px;color:#1f2937;line-height:1.6;margin:0 0 30px 0;">
              You have received a new patient referral from <strong>${safe.lawyerName}</strong>${firmLine}.
            </p>

            <!-- Referral Details Card -->
            <div style="background-color:#f8fafc;border-left:4px solid #3b82f6;padding:25px;margin:0 0 30px 0;border-radius:8px;">
              <h2 style="color:#1e3a8a;margin:0 0 20px 0;font-size:18px;font-weight:bold;">Referral Details</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;width:120px;">Patient:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.patientName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Case Type:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.caseType}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Coverage:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.coverage}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">PIP:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.pip}</td>
                </tr>
              </table>
            </div>

            <!-- CTA Button -->
            <div style="text-align:center;margin:30px 0;">
              <a href="https://www.844xpert.com/professionals/referrals" style="display:inline-block;background-color:#3b82f6;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">View Full Details</a>
            </div>

            <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:30px 0 0 0;">
              Best regards,<br>
              <strong style="color:#1f2937;">The Xpert Connect Team</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
              © ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              This is an automated notification. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
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
    subject: `🔔 [Internal] New Referral: ${safe.lawyerName} → ${safe.clinicName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:40px 30px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">Internal Notification</h1>
            <p style="color:#fecaca;margin:10px 0 0 0;font-size:16px;">New Referral Activity</p>
          </div>

          <!-- Content -->
          <div style="padding:40px 30px;">
            <div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:20px;margin:0 0 30px 0;border-radius:8px;">
              <p style="color:#991b1b;margin:0;font-size:16px;font-weight:600;">
                ${safe.lawyerName}${firmLine} → ${safe.clinicName}
              </p>
            </div>

            <!-- Referral Details -->
            <div style="background-color:#f8fafc;border-radius:8px;padding:25px;margin:0 0 30px 0;">
              <h2 style="color:#1f2937;margin:0 0 20px 0;font-size:18px;font-weight:bold;">Referral Details</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;width:120px;">Sent by:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.lawyerName}${firmLine}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Clinic:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.clinicName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Patient:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.patientName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Case Type:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.caseType}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Coverage:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.coverage}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">PIP:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.pip}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Date/Time:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${dateStr} (ET)</td>
                </tr>
              </table>
            </div>

            <div style="text-align:center;">
              <a href="https://www.844xpert.com/admin/referrals" style="display:inline-block;background-color:#dc2626;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">View in Admin Dashboard</a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
              © ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              This is an internal automated notification. Do not forward.
            </p>
          </div>
        </div>
      </body>
      </html>
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
    subject: `📩 New Contact Message from ${safe.name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:40px 30px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">New Contact Message</h1>
            <p style="color:#d1fae5;margin:10px 0 0 0;font-size:16px;">Someone wants to connect with you!</p>
          </div>

          <!-- Content -->
          <div style="padding:40px 30px;">
            <!-- Contact Details Card -->
            <div style="background-color:#f0fdf4;border-left:4px solid #10b981;padding:25px;margin:0 0 30px 0;border-radius:8px;">
              <h2 style="color:#065f46;margin:0 0 20px 0;font-size:18px;font-weight:bold;">Contact Information</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;width:120px;">Name:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.name}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Email:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;"><a href="mailto:${safe.email}" style="color:#10b981;text-decoration:none;">${safe.email}</a></td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Phone:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;"><a href="tel:${safe.phone}" style="color:#10b981;text-decoration:none;">${safe.phone}</a></td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-weight:600;vertical-align:top;">Service:</td>
                  <td style="padding:10px 0;color:#1f2937;font-weight:500;">${safe.service}</td>
                </tr>
              </table>
            </div>

            ${safe.message ? `
              <div style="background-color:#f8fafc;border-radius:8px;padding:20px;margin:0 0 30px 0;">
                <h3 style="color:#1f2937;margin:0 0 15px 0;font-size:16px;font-weight:600;">Message:</h3>
                <p style="color:#4b5563;line-height:1.6;margin:0;white-space:pre-wrap;">${safe.message}</p>
              </div>
            ` : ''}

            <div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:15px 20px;border-radius:8px;">
              <p style="color:#92400e;margin:0;font-size:14px;line-height:1.5;">
                <strong>⏱️ Quick Tip:</strong> Respond within 24 hours for the best customer experience!
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
              © ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              This is an automated notification from your website contact form.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
}

/** Email sent when someone subscribes to the newsletter */
export function newsletterSubscriptionEmail(email: string) {
  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `📬 New Newsletter Subscriber: ${email}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%);padding:40px 30px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">New Newsletter Subscriber</h1>
            <p style="color:#ede9fe;margin:10px 0 0 0;font-size:16px;">Your audience is growing!</p>
          </div>

          <!-- Content -->
          <div style="padding:40px 30px;text-align:center;">
            <div style="background:linear-gradient(135deg,#faf5ff 0%,#f3e8ff 100%);border-radius:12px;padding:30px;margin:0 0 30px 0;">
              <p style="color:#6b7280;margin:0 0 15px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">New Subscriber Email</p>
              <p style="color:#7c3aed;font-size:24px;font-weight:bold;margin:0;word-break:break-all;">${escapeHtml(email)}</p>
            </div>

            <div style="background-color:#ecfdf5;border-left:4px solid #10b981;padding:20px;border-radius:8px;text-align:left;">
              <p style="color:#065f46;margin:0;font-size:14px;line-height:1.6;">
                <strong>✅ Action Required:</strong> Add this subscriber to your email marketing list to keep them engaged with your latest updates and offers.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
              © ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#9ca3af;font-size:11px;margin:0;">
              Automated notification from your newsletter signup form.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
}
