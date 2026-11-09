import { Car, Scale, Sparkles, type LucideIcon } from 'lucide-react'
import { COMPANY_EMAIL } from '@/lib/constants'

/**
 * The masthead of a public directory.
 *
 * Deliberately the dashboard's gradient-CTA idiom (the two big cards in
 * ClinicDashboard) rather than the landing page's centred
 * `.section-header`, because this block is a tool rather than a pitch —
 * it should read as the front of a database, not as another marketing
 * panel between About and Contact.
 *
 * One markup for both directories (lawyers and body shops), on the
 * landing page and on their own pages, so none of the four can drift.
 * `as` exists only so a directory's page gets the single <h1> it should
 * have and the landing sections stay at <h2> beneath the hero's.
 */
function DirectoryMasthead({
  as: Heading = 'h2',
  icon: Icon,
  eyebrow,
  title,
  description,
  stats,
}: {
  as?: 'h1' | 'h2'
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  stats: { value: string; label: string }[]
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-[#1a2a4a] via-[#243456] to-[#2a3f6a] p-8 lg:p-14 shadow-xl shadow-navy/10">
      <div
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_85%_15%,rgba(212,168,75,0.18),transparent_55%)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_10%_90%,rgba(212,168,75,0.10),transparent_50%)]"
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex h-20 w-20 lg:h-24 lg:w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d4a84b] to-[#c49a3f] shadow-lg shadow-gold/40">
          <Icon className="h-10 w-10 lg:h-12 lg:w-12 text-white" strokeWidth={2.2} aria-hidden="true" />
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            {eyebrow}
          </span>
        </div>

        <Heading className="mt-3 font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight">
          {title}
        </Heading>

        <p className="mt-5 max-w-2xl text-base lg:text-lg text-white/70 leading-relaxed">
          {description}
        </p>

        <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block font-heading text-2xl lg:text-3xl font-bold text-gold">
                  {stat.value}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-white/70">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

const count = (n: number) => (n > 0 ? n.toLocaleString('en-US') : '—')

/** The "Lawyers Directory" masthead. */
export function DirectoryBanner({
  as,
  total,
  areaCount,
  countyCount,
}: {
  as?: 'h1' | 'h2'
  total: number
  areaCount: number
  countyCount: number
}) {
  return (
    <DirectoryMasthead
      as={as}
      icon={Scale}
      eyebrow="Florida · Free · No sign-up"
      title="Lawyers Directory"
      description="Every kind of attorney in Florida, in one place — family, accident, criminal, immigration, estate, business and more. Search by firm, city or county, then request their contact information. No account needed."
      stats={[
        { value: count(total), label: 'Law firms' },
        { value: count(areaCount), label: 'Practice areas' },
        { value: count(countyCount), label: 'Counties' },
        { value: 'Free', label: 'No sign-up' },
      ]}
    />
  )
}

/** The "Body Shops Directory" masthead. */
export function BodyShopBanner({
  as,
  total,
  stateCount,
  countyCount,
}: {
  as?: 'h1' | 'h2'
  total: number
  stateCount: number
  countyCount: number
}) {
  return (
    <DirectoryMasthead
      as={as}
      icon={Car}
      eyebrow="Florida & Minnesota · Free · No sign-up"
      title="Body Shops Directory"
      description="Collision, auto body and paint shops in Florida and Minnesota — independent shops and the major chains, each one verified against an official source. Search by shop, city or county, then request their contact information. No account needed."
      stats={[
        { value: count(total), label: 'Body shops' },
        { value: count(stateCount), label: 'States' },
        { value: count(countyCount), label: 'Counties' },
        { value: 'Free', label: 'No sign-up' },
      ]}
    />
  )
}

const disclaimerLink =
  'font-semibold text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold'

/**
 * Required, not decorative.
 *
 * These firms did not ask to be listed — the directory is compiled from
 * public sources — and the site around it says Xpert Connect connects
 * people with trusted professionals. Left unsaid, a listing reads as an
 * endorsement and as a referral service, and Florida Bar Rule 4-7 is
 * specific about both. The removal address is the same reason: a firm
 * that wants out needs somewhere to say so.
 */
export function DirectoryDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-gray-500">
      This directory is compiled from publicly available information. A listing
      does not imply endorsement, affiliation, or any relationship between the
      firm and Xpert Connect. Xpert Connect is not a law firm and is not a lawyer
      referral service, and nothing here is legal advice.{' '}
      <a
        href={`mailto:${COMPANY_EMAIL}?subject=Lawyers%20Directory%20listing%20correction`}
        className={disclaimerLink}
      >
        Report an error or request removal
      </a>
      .
    </p>
  )
}

/**
 * The body shops' version. The shops did not ask to be listed either, so
 * it names the sources, disclaims endorsement and gives a way out.
 */
export function BodyShopDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-gray-500">
      This directory is compiled from publicly available information: chain
      location pages, the Florida Department of Agriculture and Consumer
      Services motor vehicle repair registry, shops&rsquo; own websites and the
      Alliance of Automotive Service Providers of Minnesota. A listing does not
      imply endorsement, affiliation, or any relationship between the shop and
      Xpert Connect.{' '}
      <a
        href={`mailto:${COMPANY_EMAIL}?subject=Body%20Shops%20Directory%20listing%20correction`}
        className={disclaimerLink}
      >
        Report an error or request removal
      </a>
      .
    </p>
  )
}
