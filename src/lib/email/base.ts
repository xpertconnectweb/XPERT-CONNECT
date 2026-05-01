import { Resend } from 'resend'
import { COMPANY_NAME, COMPANY_DOMAIN, COMPANY_LOGO_URL, COMPANY_EMAIL } from '@/lib/constants'
import type { EmailOptions } from '@/types/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM || 'Xpert Connect <onboarding@resend.dev>'
export const INTERNAL_EMAIL = process.env.INTERNAL_EMAIL || 'xpertconnect.web@gmail.com'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  })
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

export function logoBar(): string {
  return `<div style="background-color:#ffffff;padding:28px 30px 20px 30px;text-align:center;border-bottom:1px solid #e5e7eb;">
    <a href="${COMPANY_DOMAIN}" style="text-decoration:none;">
      <img src="${COMPANY_LOGO_URL}" alt="${COMPANY_NAME}" width="180" style="display:inline-block;max-width:180px;height:auto;" />
    </a>
  </div>`
}

export function headerBanner(title: string, subtitle: string, gradient: string, icon?: string): string {
  const iconHtml = icon
    ? `<div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:50%;width:56px;height:56px;line-height:56px;margin-bottom:16px;">
        <span style="font-size:28px;color:#ffffff;">${icon}</span>
      </div>`
    : ''
  return `<div style="background:${gradient};padding:36px 30px;text-align:center;">
    ${iconHtml}
    <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.3px;">${title}</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0 0;font-size:15px;font-weight:400;">${subtitle}</p>
  </div>`
}

export function headerBannerWithBadge(title: string, subtitle: string, gradient: string, badge: string): string {
  return `<div style="background:${gradient};padding:36px 30px;text-align:center;">
    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 16px;margin-bottom:14px;">
      <span style="color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${badge}</span>
    </div>
    <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.3px;">${title}</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0 0;font-size:15px;font-weight:400;">${subtitle}</p>
  </div>`
}

export function footer(note: string): string {
  return `<div style="background-color:#1e293b;padding:28px 30px;text-align:center;">
    <p style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;margin:0 0 10px 0;letter-spacing:0.3px;">
      ${COMPANY_NAME}
    </p>
    <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0 0 6px 0;">
      &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
    </p>
    <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0 0 14px 0;">
      ${note}
    </p>
    <div>
      <a href="${COMPANY_DOMAIN}" style="color:rgba(255,255,255,0.45);font-size:11px;text-decoration:none;margin:0 8px;">www.844xpert.com</a>
      <span style="color:rgba(255,255,255,0.2);">|</span>
      <a href="mailto:${COMPANY_EMAIL}" style="color:rgba(255,255,255,0.45);font-size:11px;text-decoration:none;margin:0 8px;">${COMPANY_EMAIL}</a>
    </div>
  </div>`
}

export function wrapInLayout(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Arial,sans-serif;background-color:#f0f2f5;">
  <div style="max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);margin-top:20px;margin-bottom:20px;">
    ${body}
  </div>
</body>
</html>`
}

export function detailsCard(title: string, gradient: string, rows: { label: string; value: string }[]): string {
  const rowsHtml = rows.map((r, i) => {
    const borderStyle = i < rows.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''
    return `<tr>
      <td style="padding:12px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;width:110px;${borderStyle}">${r.label}</td>
      <td style="padding:12px 0;color:#1f2937;font-size:15px;font-weight:500;${borderStyle}">${r.value}</td>
    </tr>`
  }).join('')

  return `<div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px 0;">
    <div style="background:${gradient};padding:14px 24px;">
      <h2 style="color:#ffffff;margin:0;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">${title}</h2>
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${rowsHtml}
      </table>
    </div>
  </div>`
}

export function ctaButton(text: string, href: string, gradient: string, shadowColor: string): string {
  return `<div style="text-align:center;margin:32px 0;">
    <a href="${href}" style="display:inline-block;background:${gradient};color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px ${shadowColor};">${text}</a>
  </div>`
}
