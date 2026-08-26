import { Resend } from 'resend'

// Sent by a GitHub Actions workflow as an `if: failure()` step. Loud,
// immediate alert so a broken cron is noticed instead of failing silently
// for months -- which is the failure mode of every job whose absence nothing
// else notices.
//
// Two workflows use it and they fail for different reasons, so the wording is
// parameterised. An email that sends someone to check the keep-alive when the
// address index is what broke costs more than no email at all. The defaults
// are the keep-alive text, so that workflow needs no change.
//
// Best-effort: if RESEND_API_KEY / EMAIL_FROM are not configured we log and
// exit 0 — the alert is a safety net, it must never mask the original failure.

const apiKey = (process.env.RESEND_API_KEY || '').trim()
const from = (process.env.EMAIL_FROM || '').trim()
const to = (process.env.ALERT_EMAIL || '').trim()

if (!apiKey || !from || !to) {
  console.warn(
    'notify-keepalive-failure: missing RESEND_API_KEY / EMAIL_FROM / ALERT_EMAIL — skipping alert.'
  )
  process.exit(0)
}

// GitHub Actions injects these; fall back gracefully when run locally.
const server = process.env.GITHUB_SERVER_URL || 'https://github.com'
const repo = process.env.GITHUB_REPOSITORY || ''
const runId = process.env.GITHUB_RUN_ID || ''
const runUrl = repo && runId ? `${server}/${repo}/actions/runs/${runId}` : ''
const timestamp = new Date().toISOString()

const title = (process.env.ALERT_TITLE || 'Keep-alive de Supabase falló').trim()
const detail = (
  process.env.ALERT_DETAIL ||
  'El ping automático que evita que el proyecto de Supabase se pause <strong>falló</strong>. ' +
    'Si esto se repite varios días seguidos, el proyecto se pausará por inactividad.'
).trim()
const check = (
  process.env.ALERT_CHECK ||
  'los secrets del repo (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) y que el proyecto ' +
    'de Supabase no esté ya pausado.'
).trim()

const resend = new Resend(apiKey)

try {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `⚠️ Xpert Connect: ${title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:24px;font-family:Arial,sans-serif;background:#f3f4f6;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
          <h1 style="margin:0 0 16px;color:#b91c1c;font-size:22px;">⚠️ ${title}</h1>
          <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
            ${detail}
          </p>
          <p style="margin:0 0 12px;color:#374151;line-height:1.6;">
            <strong>Cuándo:</strong> ${timestamp}
          </p>
          <p style="margin:0 0 20px;color:#374151;line-height:1.6;">
            <strong>Qué revisar:</strong> ${check}
          </p>
          ${
            runUrl
              ? `<p style="margin:0 0 12px;"><a href="${runUrl}" style="color:#2563eb;">Ver el run de GitHub Actions →</a></p>`
              : ''
          }
          <p style="margin:0;"><a href="https://supabase.com/dashboard" style="color:#2563eb;">Abrir el dashboard de Supabase →</a></p>
        </div>
      </body>
      </html>
    `,
  })

  if (error) {
    console.error('notify-keepalive-failure: Resend error:', error.message)
    process.exit(0)
  }

  console.log(`notify-keepalive-failure: alert sent to ${to} (id: ${data?.id || 'n/a'})`)
} catch (err) {
  console.error(
    'notify-keepalive-failure: send failed:',
    err instanceof Error ? err.message : err
  )
  process.exit(0)
}
