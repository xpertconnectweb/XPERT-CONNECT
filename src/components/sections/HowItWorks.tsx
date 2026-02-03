import { ShieldCheck, ClipboardList, UserCheck, Handshake } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: ShieldCheck,
    title: 'Verify',
    description:
      'We thoroughly verify all professionals in our network, checking credentials, licenses, and track records.',
    color: 'turquoise',
  },
  {
    number: '02',
    icon: ClipboardList,
    title: 'Qualify',
    description:
      'We assess your specific situation and requirements to understand exactly what kind of expert you need.',
    color: 'navy',
  },
  {
    number: '03',
    icon: UserCheck,
    title: 'Match',
    description:
      'Using our proprietary system, we match you with professionals best suited to handle your case.',
    color: 'gold',
  },
  {
    number: '04',
    icon: Handshake,
    title: 'Connect',
    description:
      'We facilitate the introduction and ensure a smooth connection between you and your matched expert.',
    color: 'turquoise',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section bg-navy relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="section-header">
          <span className="section-label !bg-white/10 !text-turquoise">Our Process</span>
          <h2 className="section-title !text-white">
            How It <span className="text-turquoise">Works</span>
          </h2>
          <p className="section-description !text-white/60">
            Our proven 4-step process ensures you get matched with the right professional
            for your specific needs.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {steps.map((step, index) => (
            <div key={step.title} className="relative group">
              {/* Connector Line (hidden on mobile) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-16 left-[60%] w-full h-0.5 bg-gradient-to-r from-white/20 to-transparent" />
              )}

              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                {/* Step Number */}
                <span className="absolute -top-3 -right-2 font-heading text-6xl font-bold text-white/5">
                  {step.number}
                </span>

                {/* Icon */}
                <div className="relative mb-6">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-turquoise/20">
                    <step.icon className="h-8 w-8 text-turquoise" />
                  </div>
                  {/* Number Badge */}
                  <span className="absolute -top-2 -left-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold font-heading text-xs font-bold text-white">
                    {index + 1}
                  </span>
                </div>

                {/* Content */}
                <h3 className="font-heading text-xl font-bold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-white/60 mb-6">Ready to get connected with a professional?</p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full bg-turquoise px-8 py-4 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-turquoise-dark hover:shadow-lg hover:shadow-turquoise/25"
          >
            Start Your Free Consultation
          </a>
        </div>
      </div>
    </section>
  )
}
