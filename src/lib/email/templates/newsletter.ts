import { COMPANY_NAME, COMPANY_DOMAIN } from '@/lib/constants'
import {
  sendEmail, escapeHtml, INTERNAL_EMAIL,
  wrapInLayout, logoBar, headerBanner, footer, ctaButton,
} from '../base'

/** Welcome email sent to the user after subscribing to the newsletter */
export function newsletterWelcomeEmail(email: string) {
  return sendEmail({
    to: email,
    subject: `Welcome to ${COMPANY_NAME} | Stay Connected`,
    html: wrapInLayout(`
      ${logoBar()}
      ${headerBanner('Welcome Aboard!', 'You&rsquo;re now part of the Xpert Connect community', 'linear-gradient(135deg,#6d28d9 0%,#7c3aed 50%,#8b5cf6 100%)', '&#128227;')}

      <div style="padding:36px 32px;">
        <p style="font-size:16px;color:#1f2937;line-height:1.7;margin:0 0 8px 0;">
          Hello!
        </p>
        <p style="font-size:15px;color:#4b5563;line-height:1.7;margin:0 0 28px 0;">
          Thank you for subscribing to the ${COMPANY_NAME} newsletter. We&rsquo;re thrilled to have you with us! You&rsquo;ll now be among the first to know about what&rsquo;s happening in our network.
        </p>

        <div style="background-color:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;overflow:hidden;margin:0 0 28px 0;">
          <div style="background:linear-gradient(135deg,#6d28d9 0%,#7c3aed 100%);padding:14px 24px;">
            <h2 style="color:#ffffff;margin:0;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">What to Expect</h2>
          </div>
          <div style="padding:20px 24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:32px;color:#7c3aed;font-size:18px;">&#10148;</td>
                <td style="padding:10px 0 10px 8px;color:#1f2937;font-size:15px;line-height:1.6;border-bottom:1px solid #ede9fe;">
                  <strong>Industry Updates</strong> &mdash; Stay informed on the latest in legal and medical fields
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:32px;color:#7c3aed;font-size:18px;">&#10148;</td>
                <td style="padding:10px 0 10px 8px;color:#1f2937;font-size:15px;line-height:1.6;border-bottom:1px solid #ede9fe;">
                  <strong>New Professionals</strong> &mdash; Discover new clinics and service providers in our network
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:32px;color:#7c3aed;font-size:18px;">&#10148;</td>
                <td style="padding:10px 0 10px 8px;color:#1f2937;font-size:15px;line-height:1.6;border-bottom:1px solid #ede9fe;">
                  <strong>Tips &amp; Resources</strong> &mdash; Helpful guides and best practices for your needs
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:32px;color:#7c3aed;font-size:18px;">&#10148;</td>
                <td style="padding:10px 0 10px 8px;color:#1f2937;font-size:15px;line-height:1.6;">
                  <strong>Announcements</strong> &mdash; Exciting news, events, and platform features
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 28px 0;text-align:center;">
          <p style="color:#6b7280;margin:0 0 8px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">About ${COMPANY_NAME}</p>
          <p style="color:#4b5563;margin:0;font-size:14px;line-height:1.7;">
            We bridge the gap between legal professionals and medical providers, creating a seamless referral network that benefits everyone &mdash; especially the patients who need care the most.
          </p>
        </div>

        ${ctaButton(`Visit ${COMPANY_NAME}`, COMPANY_DOMAIN, 'linear-gradient(135deg,#6d28d9 0%,#7c3aed 100%)', 'rgba(124,58,237,0.35)')}

        <div style="border-top:1px solid #e5e7eb;margin:28px 0;"></div>

        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0;">
          Welcome to the community!<br>
          <strong style="color:#1f2937;">The ${COMPANY_NAME} Team</strong>
        </p>
      </div>

      ${footer('You are receiving this email because you subscribed to our newsletter.')}
    `),
  })
}

/** Email sent when someone subscribes to the newsletter (internal) */
export function newsletterSubscriptionEmail(email: string) {
  return sendEmail({
    to: INTERNAL_EMAIL,
    subject: `New Newsletter Subscriber: ${email}`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%);padding:40px 30px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">New Newsletter Subscriber</h1>
      <p style="color:#ede9fe;margin:10px 0 0 0;font-size:16px;">Your audience is growing!</p>
    </div>

    <div style="padding:40px 30px;text-align:center;">
      <div style="background:linear-gradient(135deg,#faf5ff 0%,#f3e8ff 100%);border-radius:12px;padding:30px;margin:0 0 30px 0;">
        <p style="color:#6b7280;margin:0 0 15px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">New Subscriber Email</p>
        <p style="color:#7c3aed;font-size:24px;font-weight:bold;margin:0;word-break:break-all;">${escapeHtml(email)}</p>
      </div>

      <div style="background-color:#ecfdf5;border-left:4px solid #10b981;padding:20px;border-radius:8px;text-align:left;">
        <p style="color:#065f46;margin:0;font-size:14px;line-height:1.6;">
          <strong>Action Required:</strong> Add this subscriber to your email marketing list to keep them engaged with your latest updates and offers.
        </p>
      </div>
    </div>

    <div style="background-color:#f8fafc;padding:30px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">
        &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.
      </p>
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Automated notification from your newsletter signup form.
      </p>
    </div>
  </div>
</body>
</html>`,
  })
}
