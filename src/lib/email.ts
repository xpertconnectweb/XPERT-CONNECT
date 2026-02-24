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
    subject: `New Patient Referral from ${safe.lawyerName} | Xpert Connect`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;background-color:#f0f2f5;">
        <div style="max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);margin-top:20px;margin-bottom:20px;">

          <!-- Logo Bar -->
          <div style="background-color:#1e293b;padding:28px 30px 20px 30px;text-align:center;">
            <a href="https://www.844xpert.com" style="text-decoration:none;">
              <img src="https://www.844xpert.com/images/logo.png" alt="Xpert Connect" width="180" style="display:inline-block;max-width:180px;height:auto;" />
            </a>
          </div>

          <!-- Header Banner -->
          <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 50%,#3b82f6 100%);padding:36px 30px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:50%;width:56px;height:56px;line-height:56px;margin-bottom:16px;">
              <span style="font-size:28px;color:#ffffff;">&#127973;</span>
            </div>
            <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.3px;">New Patient Referral</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0 0;font-size:15px;font-weight:400;">A new referral has been submitted for your clinic</p>
          </div>

          <!-- Content -->
          <div style="padding:36px 32px;">
            <p style="font-size:16px;color:#1f2937;line-height:1.7;margin:0 0 8px 0;">
              Dear <strong>${safe.clinicName}</strong>,
            </p>
            <p style="font-size:15px;color:#4b5563;line-height:1.7;margin:0 0 28px 0;">
              You have received a new patient referral from attorney <strong style="color:#1f2937;">${safe.lawyerName}</strong>${firmLine}. Please review the details below and take the appropriate action.
            </p>

            <!-- Referral Details Card -->
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px 0;">
              <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:14px 24px;">
                <h2 style="color:#ffffff;margin:0;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Referral Details</h2>
              </div>
              <div style="padding:20px 24px;">
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;width:110px;border-bottom:1px solid #f1f5f9;">Patient</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.patientName}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Case Type</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.caseType}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Coverage</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.coverage}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">PIP</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;">${safe.pip}</td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align:center;margin:32px 0;">
              <a href="https://www.844xpert.com/professionals/referrals" style="display:inline-block;background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">View Full Referral Details</a>
            </div>

            <!-- Divider -->
            <div style="border-top:1px solid #e5e7eb;margin:28px 0;"></div>

            <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0;">
              If you have any questions, please contact us at <a href="mailto:xpertconnect.web@gmail.com" style="color:#2563eb;text-decoration:none;font-weight:500;">xpertconnect.web@gmail.com</a>
            </p>

            <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:20px 0 0 0;">
              Best regards,<br>
              <strong style="color:#1f2937;">The Xpert Connect Team</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color:#ffffff;padding:32px 30px;text-align:center;border-top:1px solid #e5e7eb;">
            <a href="https://www.844xpert.com" style="text-decoration:none;">
              <img src="https://www.844xpert.com/images/logo.png" alt="Xpert Connect" width="120" style="display:inline-block;max-width:120px;height:auto;opacity:0.7;margin-bottom:16px;" />
            </a>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px 0;">
              &copy; ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#d1d5db;font-size:11px;margin:0 0 12px 0;">
              This is an automated notification. Please do not reply directly to this email.
            </p>
            <div style="margin-top:12px;">
              <a href="https://www.844xpert.com" style="color:#9ca3af;font-size:11px;text-decoration:none;margin:0 8px;">www.844xpert.com</a>
              <span style="color:#d1d5db;">|</span>
              <a href="mailto:xpertconnect.web@gmail.com" style="color:#9ca3af;font-size:11px;text-decoration:none;margin:0 8px;">xpertconnect.web@gmail.com</a>
            </div>
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
    subject: `[Internal] New Referral: ${safe.lawyerName} → ${safe.clinicName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;background-color:#f0f2f5;">
        <div style="max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);margin-top:20px;margin-bottom:20px;">

          <!-- Logo Bar -->
          <div style="background-color:#1e293b;padding:28px 30px 20px 30px;text-align:center;">
            <a href="https://www.844xpert.com" style="text-decoration:none;">
              <img src="https://www.844xpert.com/images/logo.png" alt="Xpert Connect" width="180" style="display:inline-block;max-width:180px;height:auto;" />
            </a>
          </div>

          <!-- Header Banner -->
          <div style="background:linear-gradient(135deg,#991b1b 0%,#dc2626 50%,#ef4444 100%);padding:36px 30px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 16px;margin-bottom:14px;">
              <span style="color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Internal</span>
            </div>
            <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.3px;">New Referral Activity</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0 0;font-size:15px;font-weight:400;">A new referral has been recorded in the system</p>
          </div>

          <!-- Content -->
          <div style="padding:36px 32px;">

            <!-- Summary Banner -->
            <div style="background:linear-gradient(135deg,#fef2f2 0%,#fff1f2 100%);border:1px solid #fecaca;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
              <p style="color:#6b7280;margin:0 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Referral Flow</p>
              <p style="color:#991b1b;margin:0;font-size:17px;font-weight:700;">
                ${safe.lawyerName}${firmLine} &rarr; ${safe.clinicName}
              </p>
            </div>

            <!-- Referral Details Card -->
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px 0;">
              <div style="background:linear-gradient(135deg,#991b1b 0%,#dc2626 100%);padding:14px 24px;">
                <h2 style="color:#ffffff;margin:0;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Referral Details</h2>
              </div>
              <div style="padding:20px 24px;">
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;width:110px;border-bottom:1px solid #f1f5f9;">Sent By</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.lawyerName}${firmLine}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Clinic</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.clinicName}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Patient</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.patientName}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Case Type</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.caseType}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">Coverage</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.coverage}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;border-bottom:1px solid #f1f5f9;">PIP</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;border-bottom:1px solid #f1f5f9;">${safe.pip}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Timestamp</td>
                    <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;">${dateStr} (ET)</td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align:center;margin:32px 0;">
              <a href="https://www.844xpert.com/admin/referrals" style="display:inline-block;background:linear-gradient(135deg,#991b1b 0%,#dc2626 100%);color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(220,38,38,0.35);">View in Admin Dashboard</a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color:#ffffff;padding:32px 30px;text-align:center;border-top:1px solid #e5e7eb;">
            <a href="https://www.844xpert.com" style="text-decoration:none;">
              <img src="https://www.844xpert.com/images/logo.png" alt="Xpert Connect" width="120" style="display:inline-block;max-width:120px;height:auto;opacity:0.7;margin-bottom:16px;" />
            </a>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px 0;">
              &copy; ${new Date().getFullYear()} Xpert Connect. All rights reserved.
            </p>
            <p style="color:#d1d5db;font-size:11px;margin:0 0 12px 0;">
              Internal automated notification. Confidential &mdash; Do not forward.
            </p>
            <div style="margin-top:12px;">
              <a href="https://www.844xpert.com" style="color:#9ca3af;font-size:11px;text-decoration:none;margin:0 8px;">www.844xpert.com</a>
              <span style="color:#d1d5db;">|</span>
              <a href="mailto:xpertconnect.web@gmail.com" style="color:#9ca3af;font-size:11px;text-decoration:none;margin:0 8px;">xpertconnect.web@gmail.com</a>
            </div>
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
