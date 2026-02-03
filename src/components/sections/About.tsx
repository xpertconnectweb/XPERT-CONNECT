import Image from 'next/image'
import { CheckCircle } from 'lucide-react'
import { CountUp } from '@/components/ui/CountUp'

const stats = [
  { value: 20, suffix: '+', label: 'Years of Experience' },
  { value: 500, suffix: '+', label: 'Verified Professionals' },
  { value: 10000, suffix: '+', label: 'Successful Connections', abbreviateThousands: true },
  { value: 98, suffix: '%', label: 'Client Satisfaction' },
]

const highlights = [
  'Free consultation with no obligations',
  'Vetted attorneys with proven track records',
  'Medical clinics specializing in injury care',
  'Fast response within 24 hours',
]

export function About() {
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
                className="w-full h-auto object-cover"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-navy/20 to-transparent" />
            </div>

            {/* Floating Stats Card */}
            <div className="absolute -bottom-8 -right-8 bg-white rounded-2xl shadow-xl p-6 hidden lg:block">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-turquoise/10">
                  <span className="text-2xl font-bold text-turquoise">20+</span>
                </div>
                <div>
                  <p className="font-heading font-bold text-navy">Years</p>
                  <p className="text-sm text-gray-500">Industry Experience</p>
                </div>
              </div>
            </div>

            {/* Accent Element */}
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-turquoise/10 rounded-2xl -z-10" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 border-2 border-gold/30 rounded-2xl -z-10" />
          </div>

          {/* Content Column */}
          <div>
            <span className="section-label">Who We Are</span>
            <h2 className="section-title text-left">
              Your Trusted Bridge to
              <span className="text-turquoise"> Professional Help</span>
            </h2>

            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              An accident can be sudden and life-changing. You may be dealing with injuries,
              medical bills, and the stress of not knowing where to turn. That's where we come in.
            </p>

            <p className="text-gray-600 mb-8 leading-relaxed">
              Xpert Connect helps you find the legal and medical support you need to recover.
              As a referral service, we connect you with experienced attorneys and healthcare
              providers who understand your rights and fight for the compensation you deserve.
            </p>

            {/* Highlights */}
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {highlights.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-turquoise flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="p-4 bg-gray-50 rounded-xl border-l-4 border-turquoise">
              <p className="text-sm text-gray-500 italic">
                <strong className="text-gray-700 not-italic">Note:</strong> We are not attorneys and do not provide legal advice.
                We connect you with licensed professionals in our network.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mt-24 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100"
            >
              <span className="block font-heading text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-turquoise to-navy mb-2">
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
