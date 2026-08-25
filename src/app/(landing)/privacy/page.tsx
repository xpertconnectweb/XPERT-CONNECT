import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY_NAME, COMPANY_PHONE, COMPANY_EMAIL, COMPANY_DOMAIN } from '@/lib/constants'

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
 * This is a factual description of data handling, not legal advice.
 * The client's attorney should review it before publication.
 */
export const metadata: Metadata = {
  title: `Privacy Policy | ${COMPANY_NAME}`,
  description: `How ${COMPANY_NAME} collects, uses and protects your information.`,
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-bold text-navy">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  )
}

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
            page.
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
      </div>
    </div>
  )
}
