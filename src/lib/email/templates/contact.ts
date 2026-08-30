import { COMPANY_NAME, COMPANY_DOMAIN, COMPANY_PHONE, COMPANY_PHONE_TEL, COMPANY_EMAIL } from '@/lib/constants'
import {
  sendEmail, escapeHtml, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBanner, headerBannerWithBadge, detailsCard, ctaButton, footer,
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
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBannerWithBadge('New Contact Message', 'Someone wants to connect with you', 'linear-gradient(135deg,#047857 0%,#059669 50%,#10b981 100%)', 'Internal')}

      <div style="padding:36px 32px;">
        ${detailsCard('Contact Information', 'linear-gradient(135deg,#047857 0%,#059669 100%)', [
          { label: 'Name', value: safe.name },
          { label: 'Email', value: `<a href="mailto:${safe.email}" style="color:#059669;text-decoration:none;">${safe.email}</a>` },
          { label: 'Phone', value: `<a href="tel:${safe.phone}" style="color:#059669;text-decoration:none;">${safe.phone}</a>` },
          { label: 'Service', value: safe.service },
        ])}

        ${safe.message ? `
          <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;">
            <h3 style="color:#6b7280;margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Message</h3>
            <p style="color:#1f2937;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${safe.message}</p>
          </div>
        ` : ''}

        <div style="background-color:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:8px;">
          <p style="color:#92400e;margin:0;font-size:14px;line-height:1.6;">
            <strong>Quick Tip:</strong> Respond within 24 hours for the best customer experience.
          </p>
        </div>

        ${ctaButton('View in Admin Dashboard', `${COMPANY_DOMAIN}/admin/contacts`, 'linear-gradient(135deg,#047857 0%,#059669 100%)', 'rgba(5,150,105,0.35)')}
      </div>

      ${footer('Internal automated notification from your website contact form.')}
    `),
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
