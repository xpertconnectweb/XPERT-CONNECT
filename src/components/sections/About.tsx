import Image from 'next/image'
import { CheckCircle } from 'lucide-react'
import { CountUp } from '@/components/ui/CountUp'
import { urlFor } from '@/lib/sanity'
import type { AboutData } from '@/lib/sanity-types'

const defaultStats = [
  { value: 20, suffix: '+', label: 'Years of Experience' },
  { value: 500, suffix: '+', label: 'Verified Professionals' },
  { value: 10000, suffix: '+', label: 'Successful Connections', abbreviateThousands: true },
  { value: 98, suffix: '%', label: 'Client Satisfaction' },
]

const defaultHighlights = [
  'Free consultation with no obligations',
  'Vetted attorneys with proven track records',
  'Medical clinics specializing in injury care',
  'Fast response within 24 hours',
]

interface AboutProps {
  data?: AboutData | null
}

export function About({ data }: AboutProps) {
  const label = data?.label ?? 'Who We Are'
  const titleLine1 = data?.titleLine1 ?? 'Your Trusted Bridge to'
  const titleAccent = data?.titleAccent ?? ' Professional Help'
  const paragraph1 = data?.paragraph1 ?? 'An accident can be sudden and life-changing. You may be dealing with injuries, medical bills, and the stress of not knowing where to turn. That\'s where we come in.'
  const paragraph2 = data?.paragraph2 ?? 'Xpert Connect helps you find the legal and medical support you need to recover. As a referral service, we connect you with experienced attorneys and healthcare providers who understand your rights and fight for the compensation you deserve.'
  const highlights = data?.highlights ?? defaultHighlights
  const disclaimer = data?.disclaimer ?? 'We are not attorneys and do not provide legal advice. We connect you with licensed professionals in our network.'
  const stats = data?.stats ?? defaultStats

  /**
   * Wired to the CMS, and served from our own origin.
   *
   * The photograph was hard-coded to images.unsplash.com, which meant a
   * third-party dependency on the critical path and a CSP entry kept open
   * for one image. Same aspect ratio as before, so the column is unchanged.
   */
  const imageUrl = data?.image
    ? urlFor(data.image).width(1200).height(900).fit('crop').url()
    : '/images/about-people.jpg'

  return (
    <section id="about" className="section bg-white pattern-bg">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
          {/* Image Column */}
          <div className="relative">
            {/* Main Image */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src={imageUrl}
                alt="A professional from the Xpert Connect network"
                width={600}
                height={450}
                sizes="(max-width: 1024px) 100vw, 50vw"
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWEyYTRhIi8+PC9zdmc+"
                className="w-full h-auto object-cover"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-navy/20 to-transparent" />
            </div>

            {/* The floating "20+ Years" card that used to hang off this
                image is gone. It repeated the first stat rendered 200px
                below it, but as hard-coded JSX — so editing that stat in
                the Studio made the page disagree with itself.

                The two accent squares went with it: both were `-z-10`
                inside a parent that paints a background, so they have
                never been visible on any browser. */}
          </div>

          {/* Content Column */}
          <div>
            <span className="section-label">{label}</span>
            <h2 className="section-title text-left">
              {titleLine1}
              <span className="text-gold">{titleAccent}</span>
            </h2>

            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              {paragraph1}
            </p>

            <p className="text-gray-600 mb-8 leading-relaxed">
              {paragraph2}
            </p>

            {/* Highlights */}
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {highlights.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-gold flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="p-4 bg-gray-50 rounded-xl border-l-4 border-gold">
              <p className="text-sm text-gray-500 italic">
                <strong className="text-gray-700 not-italic">Note:</strong> {disclaimer}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mt-24 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100"
            >
              <span className="block font-heading text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gold to-navy mb-2">
                <CountUp
                  value={stat.value}
                  suffix={stat.suffix}
                  abbreviateThousands={stat.abbreviateThousands ?? false}
                />
              </span>
              <span className="text-sm text-gray-500 uppercase tracking-wide">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
