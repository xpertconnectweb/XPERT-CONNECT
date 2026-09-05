import { Scale, Sparkles } from 'lucide-react'
import { COMPANY_EMAIL } from '@/lib/constants'

/**
 * The "Lawyers Directory" masthead.
 *
 * Deliberately the dashboard's gradient-CTA idiom (the two big cards in
 * ClinicDashboard) rather than the landing page's centred
 * `.section-header`, because this block is a tool rather than a pitch —
 * it should read as the front of a database, not as another marketing
 * panel between About and Contact.
 *
 * Shared by the landing section and /directory so the two cannot drift.
 * `as` exists only so the page gets the single <h1> it should have and
 * the landing section stays at <h2> beneath the hero's.
 */
export function DirectoryBanner({
  as: Heading = 'h2',
  total,
  areaCount,
  countyCount,
}: {
  as?: 'h1' | 'h2'
  total: number
  areaCount: number
  countyCount: number
}) {
  const stats = [
    { value: total > 0 ? `${total.toLocaleString('en-US')}` : '—', label: 'Law firms' },
    { value: areaCount > 0 ? `${areaCount}` : '—', label: 'Practice areas' },
    { value: countyCount > 0 ? `${countyCount}` : '—', label: 'Counties' },
    { value: 'Free', label: 'No sign-up' },
  ]

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
          <Scale className="h-10 w-10 lg:h-12 lg:w-12 text-white" strokeWidth={2.2} aria-hidden="true" />
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            Florida · Free · No sign-up
          </span>
        </div>

        <Heading className="mt-3 font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight">
          Lawyers Directory
        </Heading>

        <p className="mt-5 max-w-2xl text-base lg:text-lg text-white/70 leading-relaxed">
          Every kind of attorney in Florida, in one place — family, accident,
          criminal, immigration, estate, business and more. Search by firm, city
          or county, then call them directly. No account needed.
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
                <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">
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
        className="font-semibold text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold"
      >
        Report an error or request removal
      </a>
      .
    </p>
  )
}
