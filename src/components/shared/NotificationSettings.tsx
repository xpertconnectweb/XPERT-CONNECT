'use client'

/**
 * The SMS opt-in screen.
 *
 * Two things about this component are compliance requirements rather
 * than design choices, and should not be "tidied":
 *
 *  1. The consent checkbox starts UNCHECKED and sits visually apart
 *     from the phone field. A pre-ticked box, or consent implied by
 *     the act of typing a number, is the single most common TCPA
 *     finding.
 *  2. The full consent text is rendered on screen, not summarised
 *     behind a link. A screenshot of this page is submitted to Twilio
 *     as the required proof of the opt-in workflow, and the carrier
 *     reviewer reads exactly what the user reads.
 *
 * All state comes from GET /api/me/notifications rather than from the
 * session: the JWT only refreshes from the database every five
 * minutes, and a stale consent flag keeps texting somebody who just
 * turned it off.
 */
import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ShieldCheck, AlertTriangle, Loader2, Check } from 'lucide-react'
import { currentConsentText } from '@/lib/sms/consent'

interface NotificationState {
  eligible: boolean
  phoneLast4: string | null
  phoneVerified: boolean
  smsReferralAlerts: boolean
  optedOut: boolean
  consentText: string
  smsAvailable: boolean
}

type Stage = 'loading' | 'phone' | 'code' | 'ready'

export function NotificationSettings() {
  const [state, setState] = useState<NotificationState | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications')
      if (!res.ok) throw new Error('failed')
      const data: NotificationState = await res.json()
      setState(data)
      setStage(data.phoneVerified ? 'ready' : 'phone')
    } catch {
      setError('Could not load your notification settings.')
      setStage('phone')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Seeded from the server's cooldownSeconds, never guessed locally —
  // the authoritative gate lives in Postgres.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/me/phone/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, consent }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not send the code.')
        return
      }
      setCooldown(data.cooldownSeconds ?? 60)
      setStage('code')
      setNotice('We sent you a 6-digit code.')
    } catch {
      setError('Could not send the code.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/me/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'That code is not correct.')
        return
      }
      setCode('')
      setNotice('Your number is verified. Switch alerts on below.')
      await load()
    } catch {
      setError('Could not verify the code.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleAlerts(next: boolean) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsReferralAlerts: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not update your alerts.')
        return
      }
      setNotice(next ? 'SMS alerts are on.' : 'SMS alerts are off.')
      await load()
    } catch {
      setError('Could not update your alerts.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhone() {
    setBusy(true)
    setError('')
    try {
      await fetch('/api/me/phone', { method: 'DELETE' })
      setPhone('')
      setConsent(false)
      setNotice('Your number was removed.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500" data-testid="notifications-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your settings…
      </div>
    )
  }

  if (state && !state.eligible) {
    return (
      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">
          Text alerts are available on clinic and attorney accounts, which are the
          ones that receive referrals.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="sms-settings">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-navy/5 p-2">
            <MessageSquare className="h-5 w-5 text-navy" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-navy">Text alerts</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Get a text the moment a referral reaches you, alongside the email.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600"
            role="alert"
            data-testid="sms-error"
          >
            {error}
          </div>
        )}

        {notice && !error && (
          <div
            className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700"
            data-testid="sms-notice"
          >
            {notice}
          </div>
        )}

        {state?.optedOut && (
          <div
            className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2"
            data-testid="sms-opted-out"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This number replied STOP, so the carrier is blocking our messages.
              Text START to our number to allow them again, then switch alerts
              back on here.
            </span>
          </div>
        )}

        {!state?.smsAvailable && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
            Text alerts are not switched on for the platform yet. You can save
            your number now and it will start working once they are.
          </div>
        )}

        {/* ---- Stage: enter a number ---- */}
        {stage === 'phone' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="sms-phone" className="block text-sm font-medium text-navy mb-1.5">
                Mobile number
              </label>
              <input
                id="sms-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(407) 555-0142"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                data-testid="sms-phone-input"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                US mobile numbers only. This is never shown to other users.
              </p>
            </div>

            {/* Deliberately its own bordered block, below the field and
                visually separate from it: consent must be a distinct
                act, not a by-product of typing a number. */}
            <label className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-navy focus:ring-navy/20"
                data-testid="sms-consent-checkbox"
              />
              {/* Bundled, not fetched. This text is what the user is
                  agreeing to, so it must never depend on a request
                  succeeding — a checkbox rendered beside an empty span
                  because an API call failed is a consent record with
                  nothing behind it. The server still returns the same
                  string and stores it on the row at opt-in; both come
                  from lib/sms/consent.ts, so they cannot disagree. */}
              <span className="text-xs leading-relaxed text-gray-600">
                {state?.consentText ?? currentConsentText()}
              </span>
            </label>

            <button
              type="button"
              onClick={sendCode}
              disabled={busy || !consent || phone.trim().length === 0}
              className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy/90 transition-colors"
              data-testid="sms-send-code"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </div>
        )}

        {/* ---- Stage: enter the code ---- */}
        {stage === 'code' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="sms-code" className="block text-sm font-medium text-navy mb-1.5">
                Enter the 6-digit code
              </label>
              <input
                id="sms-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-40 rounded-xl border border-gray-200 px-4 py-2.5 text-lg tracking-[0.3em] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/10"
                data-testid="sms-code-input"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy/90 transition-colors"
                data-testid="sms-verify-code"
              >
                {busy ? 'Checking…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="text-sm text-gray-500 hover:text-navy disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="sms-resend"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStage('phone')
                  setCode('')
                  setError('')
                }}
                className="text-sm text-gray-500 hover:text-navy"
              >
                Change number
              </button>
            </div>
          </div>
        )}

        {/* ---- Stage: verified ---- */}
        {stage === 'ready' && state && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span data-testid="sms-verified-number">
                Verified: ••• ••• {state.phoneLast4}
              </span>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
              <span className="text-sm text-navy font-medium">
                Text me when I receive a referral
              </span>
              <input
                type="checkbox"
                checked={state.smsReferralAlerts}
                disabled={busy || state.optedOut}
                onChange={(e) => toggleAlerts(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy/20 disabled:opacity-40"
                data-testid="sms-alerts-toggle"
              />
            </label>

            {state.smsReferralAlerts && (
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <Check className="h-3.5 w-3.5" />
                Reply STOP to any message to unsubscribe. Message and data rates
                may apply.
              </p>
            )}

            <button
              type="button"
              onClick={removePhone}
              disabled={busy}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              data-testid="sms-remove-phone"
            >
              Remove this number
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
