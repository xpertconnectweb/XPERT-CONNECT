import type { Metadata } from 'next'
import { currentConsentText } from '@/lib/sms/consent'
import { COMPANY_NAME, COMPANY_PHONE, COMPANY_EMAIL } from '@/lib/constants'

/**
 * Public SMS terms.
 *
 * This page exists for a specific, non-obvious reason: the actual
 * opt-in screen sits behind a login, so the carrier reviewing our
 * toll-free verification cannot see it. Toll-free verification
 * requires inspectable proof of the opt-in workflow and its
 * disclosures, and "it's behind auth, trust us" is a rejection.
 *
 * The consent paragraph is imported from lib/sms/consent.ts rather
 * than retyped, so this page and the checkbox can never drift — and
 * a drift between them is precisely what a reviewer looks for.
 */
export const metadata: Metadata = {
  title: `SMS Terms | ${COMPANY_NAME}`,
  description:
    'Terms, message frequency, rates and opt-out instructions for Xpert Connect referral text alerts.',
}

const SECTIONS: Array<{ heading: string; body: React.ReactNode }> = [
  {
    heading: 'Who receives these messages',
    body: (
      <>
        Only registered {COMPANY_NAME} clinic and attorney account holders who have
        entered their own mobile number, confirmed it with a one-time code, and
        switched alerts on from their account settings. We never add a number on
        a user&apos;s behalf, and consent is never a condition of using the platform.
      </>
    ),
  },
  {
    heading: 'What we send',
    body: (
      <>
        One kind of message: a notification that a new patient referral has
        reached your account, with a link to sign in and view it.{' '}
        <strong>
          These messages never contain patient names, phone numbers, dates of
          birth, injuries or any other health information.
        </strong>{' '}
        Those details stay behind your login. We do not send marketing or
        promotional texts on this number.
      </>
    ),
  },
  {
    heading: 'Message frequency',
    body: <>Varies with your referral volume — one message per referral received.</>,
  },
  {
    heading: 'Cost',
    body: <>Message and data rates may apply. {COMPANY_NAME} does not charge for alerts.</>,
  },
  {
    heading: 'How to stop',
    body: (
      <>
        Reply <strong>STOP</strong> to any message and you will immediately stop
        receiving them. Reply <strong>START</strong> to resume, or{' '}
        <strong>HELP</strong> for assistance. You can also switch alerts off at
        any time from Notifications in your account.
      </>
    ),
  },
  {
    heading: 'Your information',
    body: (
      <>
        Your mobile number is used only to deliver these alerts. No mobile
        information will be sold or shared with third parties or affiliates for
        marketing or promotional purposes.
      </>
    ),
  },
  {
    heading: 'Help',
    body: (
      <>
        Call {COMPANY_PHONE} or email{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-navy underline">
          {COMPANY_EMAIL}
        </a>
        .
      </>
    ),
  },
]

export default function SmsTermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-heading text-3xl font-bold text-navy">
        Text message (SMS) terms
      </h1>
      <p className="mt-3 text-sm text-gray-500">
        Applies to referral alerts sent by {COMPANY_NAME}.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="font-heading text-lg font-bold text-navy">
              {section.heading}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{section.body}</p>
          </section>
        ))}

        <section>
          <h2 className="font-heading text-lg font-bold text-navy">
            What you agree to when you opt in
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-600 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            {currentConsentText()}
          </p>
        </section>
      </div>
    </div>
  )
}
