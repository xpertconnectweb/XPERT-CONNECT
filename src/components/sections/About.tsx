import Image from 'next/image'
import { CheckCircle } from 'lucide-react'
import { CountUp } from '@/components/ui/CountUp'
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

  return (
    <section id="about" className="section bg-white pattern-bg">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
          {/* Image Column */}
          <div className="relative">
            {/* Main Image */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=450&fit=crop"
                alt="Professional team meeting"
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

            {/* Floating Stats Card */}
            <div className="absolute -bottom-8 -right-8 bg-white rounded-2xl shadow-xl p-6 hidden lg:block">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gold/10">
                  <span className="text-2xl font-bold text-gold">20+</span>
                </div>
                <div>
                  <p className="font-heading font-bold text-navy">Years</p>
                  <p className="text-sm text-gray-500">Industry Experience</p>
                </div>
              </div>
            </div>

            {/* Accent Element */}
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-gold/10 rounded-2xl -z-10" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 border-2 border-gold/30 rounded-2xl -z-10" />
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
