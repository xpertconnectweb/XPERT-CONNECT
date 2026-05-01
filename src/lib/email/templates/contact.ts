import { COMPANY_NAME, COMPANY_DOMAIN, COMPANY_PHONE, COMPANY_PHONE_TEL, COMPANY_EMAIL } from '@/lib/constants'
import {
  sendEmail, escapeHtml, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBanner, footer,
} from '../base'

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
    subject: `New Contact Message from ${safe.name}`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:40px 30px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">New Contact Message</h1>
      <p style="color:#d1fae5;margin:10px 0 0 0;font-size:16px;">Someone wants to connect with you!</p>
    </div>

    <div style="padding:40px 30px;">
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
          <strong>Quick Tip:</strong> Respond within 24 hours for the best customer experience!
        </p>
      </div>
    </div>

    <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
        &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
      </p>
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        This is an automated notification from your website contact form.
      </p>
    </div>
  </div>
</body>
</html>`,
  })
}

/** Confirmation email sent to the user after submitting the contact form */
export function contactConfirmationEmail(
  name: string,
  email: string,
  service: string
) {
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
  }

  const serviceLabels: Record<string, string> = {
    legal: 'Legal Services',
    medical: 'Medical Clinics',
    insurance: 'Insurance Services',
    consultation: 'Free Consultation',
    other: 'General Inquiry',
  }
  const serviceLabel = serviceLabels[service.toLowerCase()] || escapeHtml(service)

  return sendEmail({
    to: email,
    subject: 'Thank You for Contacting Us | Xpert Connect',
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBanner('Thank You for Reaching Out!', 'We&rsquo;ve received your message and will be in touch soon', 'linear-gradient(135deg,#047857 0%,#059669 50%,#10b981 100%)', '&#9993;')}

      <div style="padding:36px 32px;">
        <p style="font-size:16px;color:#1f2937;line-height:1.7;margin:0 0 8px 0;">
          Dear <strong>${safe.name}</strong>,
        </p>
        <p style="font-size:15px;color:#4b5563;line-height:1.7;margin:0 0 28px 0;">
          Thank you for contacting ${COMPANY_NAME} regarding <strong style="color:#1f2937;">${serviceLabel}</strong>. We appreciate your interest and want you to know that your inquiry is important to us.
        </p>

        <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;overflow:hidden;margin:0 0 28px 0;">
          <div style="background:linear-gradient(135deg,#047857 0%,#059669 100%);padding:14px 24px;">
            <h2 style="color:#ffffff;margin:0;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">What Happens Next?</h2>
          </div>
          <div style="padding:20px 24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:12px 0;vertical-align:top;width:36px;">
                  <div style="background:#059669;color:#ffffff;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:700;">1</div>
                </td>
                <td style="padding:12px 0 12px 12px;color:#1f2937;font-size:15px;line-height:1.6;border-bottom:1px solid #dcfce7;">
                  <strong>Review</strong> &mdash; Our team will carefully review your inquiry.
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;vertical-align:top;">
                  <div style="background:#059669;color:#ffffff;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:700;">2</div>
                </td>
                <td style="padding:12px 0 12px 12px;color:#1f2937;font-size:15px;line-height:1.6;border-bottom:1px solid #dcfce7;">
                  <strong>Response</strong> &mdash; A specialist will reach out to you within <strong style="color:#047857;">24 hours</strong>.
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;vertical-align:top;">
                  <div style="background:#059669;color:#ffffff;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-size:14px;font-weight:700;">3</div>
                </td>
                <td style="padding:12px 0 12px 12px;color:#1f2937;font-size:15px;line-height:1.6;">
                  <strong>Connect</strong> &mdash; We&rsquo;ll match you with the right professional for your needs.
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
          <p style="color:#6b7280;margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Need Immediate Assistance?</p>
          <p style="color:#1f2937;margin:0 0 4px 0;font-size:15px;">
            Call us at <a href="${COMPANY_PHONE_TEL}" style="color:#059669;text-decoration:none;font-weight:600;">${COMPANY_PHONE}</a>
          </p>
          <p style="color:#1f2937;margin:0;font-size:15px;">
            Email: <a href="mailto:${COMPANY_EMAIL}" style="color:#059669;text-decoration:none;font-weight:500;">${COMPANY_EMAIL}</a>
          </p>
        </div>

        <div style="border-top:1px solid #e5e7eb;margin:28px 0;"></div>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 20px 0;">
          We look forward to helping you. Thank you for choosing ${COMPANY_NAME}!
        </p>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0;">
          Warm regards,<br>
          <strong style="color:#1f2937;">The ${COMPANY_NAME} Team</strong>
        </p>
      </div>

      ${footer('You are receiving this email because you submitted a contact form on our website.')}
    `),
  })
}
