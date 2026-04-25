import 'dotenv/config'
import { Resend } from 'resend'

const to = (process.argv[2] || process.env.INTERNAL_EMAIL || '').trim()
const subject = (process.argv[3] || 'Test email from Xpert Connect').trim()
const from = (process.env.EMAIL_FROM || '').trim()
const apiKey = (process.env.RESEND_API_KEY || '').trim()

if (!apiKey) {
  console.error('Missing RESEND_API_KEY in environment.')
  process.exit(1)
}

if (!from) {
  console.error('Missing EMAIL_FROM in environment.')
  process.exit(1)
}

if (!to) {
  console.error('Missing recipient email. Use: node scripts/send-test-email.mjs you@example.com')
  process.exit(1)
}

const resend = new Resend(apiKey)

try {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:24px;font-family:Arial,sans-serif;background:#f3f4f6;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
          <h1 style="margin:0 0 16px;color:#111827;font-size:24px;">Xpert Connect test email</h1>
          <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
            This message was sent through Resend using your verified domain configuration.
          </p>
          <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
            <strong>From:</strong> ${from}
          </p>
          <p style="margin:0;color:#374151;line-height:1.6;">
            If you received this, your outbound email setup is working.
          </p>
        </div>
      </body>
      </html>
    `,
  })

  if (error) {
    console.error('Resend error:', error.message)
    process.exit(1)
  }

  console.log(`Email sent successfully to ${to}`)
  console.log(`Resend id: ${data?.id || 'n/a'}`)
} catch (error) {
  console.error('Send failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
