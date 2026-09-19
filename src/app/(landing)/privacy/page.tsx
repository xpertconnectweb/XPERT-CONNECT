import type { Metadata } from 'next'
import Link from 'next/link'
import {
  COMPANY_NAME,
  COMPANY_LEGAL_NAME,
  COMPANY_PHONE,
  COMPANY_EMAIL,
  COMPANY_DOMAIN,
  SMS_HELP_EMAIL,
} from '@/lib/constants'

/**
 * Privacy policy.
 *
 * Written from what the codebase actually does — the contact form,
 * the newsletter table, the referral records, the geocoding proxy and
 * the new SMS columns — rather than from a template. Nothing here
 * describes a practice the software does not have.
 *
 * It exists now because toll-free SMS verification requires a
 * reachable privacy policy on the public site, and reviewers look
 * specifically for the mobile-opt-in sentence in the SMS section
 * below. Until this page shipped, the footer linked to `href="#"`.
 *
 * Two blocks are the exception to "written from what the code does":
 * `Data sharing` and the numbered `Messaging Terms and Conditions` at
 * the foot of the page are the client's own wording, supplied for
 * carrier verification and reproduced verbatim at their instruction.
 * Do not paraphrase or tidy them — a reviewer matches those sentences
 * literally, and this page is the Privacy policy URL submitted on the
 * toll-free form (docs/SMS-PUESTA-EN-MARCHA.md).
 *
 * Known disagreement, deliberate: point 1 of those terms describes a
 * promotional messaging program. The software sends no such thing. It
 * sends one transactional referral alert, and both /sms-terms and the
 * consent text stored per user by lib/sms/consent.ts say so. Keeping
 * the client's wording was their call. If a carrier rejects the
 * application over it, the fix is to rewrite point 1 to describe
 * referral alerts — NOT to edit /sms-terms, which is the page every
 * stored consent record is bound to.
 *
 * This is a factual description of data handling, not legal advice.
 * The client's attorney should review it before publication.
 */
export const metadata: Metadata = {
  title: `Privacy Policy | ${COMPANY_NAME}`,
  description: `How ${COMPANY_NAME} collects, uses and protects your information.`,
}

function Section({
  heading,
  id,
  children,
}: {
  heading: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={id ? 'scroll-mt-28' : undefined}>
      <h2 className="font-heading text-lg font-bold text-navy">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

/**
 * The client's messaging terms, verbatim.
 *
 * An array rather than hand-numbered markup so the numbering belongs
 * to the browser: a clause inserted later cannot leave two items
 * sharing a number, and the number a carrier reviewer quotes back at
 * us always matches what is on screen.
 */
const MESSAGING_TERMS: React.ReactNode[] = [
  <>
    The messaging program consists of promotional offers or discounts, any
    promotion of your products/services.
  </>,
  <>
    You can cancel the SMS service at any time. Just text &apos;STOP&apos; to the
    phone number from which you received messages. After you send the SMS message
    &apos;STOP&apos; to us, we will send you an SMS message to confirm that you
    have been unsubscribed. After this, you will no longer receive SMS messages
    from us. If you want to join again, just sign up as you did the first time and
    we will start sending SMS messages to you again.
  </>,
  <>
    If you are experiencing issues with the messaging program you can reply with
    the keyword HELP for more assistance, or you can get help directly at{' '}
    <a href={`mailto:${SMS_HELP_EMAIL}`} className="text-navy underline">
      {SMS_HELP_EMAIL}
    </a>
    .
  </>,
  <>Carriers are not liable for delayed or undelivered messages.</>,
  <>
    As always, message and data rates may apply for any messages sent to you from
    us and to us from you. Message frequency will vary based on communication
    needs. If you have any questions about your text plan or data plan, it is best
    to contact your wireless provider.
  </>,
  <>
    If you have any questions regarding privacy, please read our privacy policy
    contained in the rest of this document/page.
  </>,
]

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-heading text-3xl font-bold text-navy">Privacy Policy</h1>
      <p className="mt-3 text-sm text-gray-500">
        How {COMPANY_NAME} collects, uses and protects information at{' '}
        {COMPANY_DOMAIN.replace('https://', '')}.
      </p>

      <div className="mt-10 space-y-8">
        <Section heading="Information we collect">
          <p>
            <strong>From visitors.</strong> If you use our contact form or subscribe
            to our newsletter, we collect the name, email address, phone number and
            message you provide.
          </p>
          <p>
            <strong>From account holders.</strong> Clinics, attorneys and partners
            who hold an account provide a name, username, email address and, if they
            choose to enable text alerts, a mobile number.
          </p>
          <p>
            <strong>Referral records.</strong> When a professional refers a patient
            or client through the platform, they submit the information needed to
            handle that referral. This information is visible only to the referring
            party, the receiving provider and {COMPANY_NAME} administrators.
          </p>
          <p>
            <strong>Location searches.</strong> Addresses typed into our provider map
            are sent to our own server, which queries a mapping service on your
            behalf. The mapping service never receives your identity or your browser
            details.
          </p>
        </Section>

        <Section heading="How we use it">
          <p>
            To operate the referral network: routing referrals to the right provider,
            notifying the parties involved by email and — where enabled — by text,
            and responding to enquiries.
          </p>
          <p>
            We do not sell your information. We do not use it for advertising, and we
            do not share it with advertisers or data brokers.
          </p>
        </Section>

        <Section heading="Text messages">
          <p>
            Account holders may opt in to receive referral alerts by text. Opting in
            is entirely voluntary, is never a condition of using {COMPANY_NAME}, and
            requires confirming ownership of the number with a one-time code.
          </p>
          <p className="font-medium text-navy">
            No mobile information will be sold or shared with third parties or
            affiliates for marketing or promotional purposes. Mobile opt-in data and
            consent are never shared with any third party.
          </p>
          <p>
            Our alert messages never contain patient information. Reply STOP to any
            message to unsubscribe, or HELP for assistance. Full details are on our{' '}
            <Link href="/sms-terms" className="text-navy underline">
              SMS terms
            </Link>{' '}
            page, and the complete{' '}
            <a href="#messaging-terms" className="text-navy underline">
              messaging terms and conditions
            </a>{' '}
            appear at the foot of this page.
          </p>
        </Section>

        <Section heading="Who we share it with">
          <p>
            Only the service providers needed to run the platform: our hosting and
            database providers, our email delivery provider and, for text alerts, our
            messaging provider. Each processes data solely to deliver its service to
            us.
          </p>
          <p>
            We may also disclose information where required by law or to protect the
            rights and safety of our users.
          </p>
        </Section>

        <Section heading="Data sharing">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Customer data is not shared with 3rd parties for promotional or
              marketing purposes.
            </li>
            <li>
              Mobile opt-in and consent are never shared with anyone for any purpose.
              Any information sharing that may be mentioned elsewhere in this policy
              excludes mobile opt-in data.
            </li>
          </ul>
        </Section>

        <Section heading="How long we keep it">
          <p>
            Account and referral records are retained while the account is active and
            for as long as needed for legitimate business and legal purposes. Records
            of a request to stop receiving text messages are retained permanently, so
            that the request continues to be honoured.
          </p>
        </Section>

        <Section heading="Your choices">
          <p>
            You can switch text alerts off at any time from Notifications in your
            account, or by replying STOP. To request access to, correction of, or
            deletion of your information, contact us using the details below.
          </p>
        </Section>

        <Section heading="Security">
          <p>
            Traffic is encrypted in transit, passwords are stored hashed, and access
            to referral records is restricted to the parties involved. No system is
            perfectly secure, and text messages in particular travel over carrier
            networks that we do not control — which is why our alerts deliberately
            carry no patient information.
          </p>
        </Section>

        <Section heading="Children">
          <p>
            {COMPANY_NAME} is a service for professionals and is not directed to
            children under 13. We do not knowingly collect their information.
          </p>
        </Section>

        <Section heading="Contact us">
          <p>
            {COMPANY_NAME} — {COMPANY_PHONE} —{' '}
            <a href={`mailto:${COMPANY_EMAIL}`} className="text-navy underline">
              {COMPANY_EMAIL}
            </a>
          </p>
        </Section>

        {/* Its own block, with an id, because this is the part a carrier
            reviewer gets sent to directly: /privacy#messaging-terms. */}
        <section id="messaging-terms" className="scroll-mt-28 border-t border-gray-200 pt-8">
          {/* One interpolation, not `{NAME} Messaging Terms...`: React
              separates an expression from adjacent static text with a
              `<!-- -->` comment, and this heading is a legal string a
              reviewer may well grep for in the page source. */}
          <h2 className="font-heading text-lg font-bold text-navy">
            {`${COMPANY_LEGAL_NAME} Messaging Terms and Conditions`}
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-600 marker:font-semibold marker:text-navy">
            {MESSAGING_TERMS.map((term, index) => (
              <li key={index} className="pl-1">
                {term}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
