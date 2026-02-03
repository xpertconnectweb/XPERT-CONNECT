import { CheckCircle, BarChart3, Users, CircleCheckBig } from 'lucide-react'

const steps = [
  {
    number: 1,
    icon: CheckCircle,
    title: 'Verify',
    description:
      'We thoroughly verify all professionals in our network, checking credentials, experience, and reputation.',
  },
  {
    number: 2,
    icon: BarChart3,
    title: 'Qualify',
    description:
      'We assess your specific needs and requirements to understand exactly what kind of expert you need.',
  },
  {
    number: 3,
    icon: Users,
    title: 'Match',
    description:
      'Using our proprietary system, we match you with professionals best suited to handle your case.',
  },
  {
    number: 4,
    icon: CircleCheckBig,
    title: 'Connect',
    description:
      'We facilitate the introduction and ensure a smooth connection between you and your matched expert.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section bg-white">
      <div className="container mx-auto px-4">
        <div className="section-header">
          <span className="section-label">Our Process</span>
          <h2 className="section-title">How It Works</h2>
          <p className="section-description">
            Our proven 4-step process ensures you get matched with the right professional
            for your needs.
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-6 lg:gap-4">
          {steps.map((step, index) => (
            <div key={step.title} className="flex items-start">
              {/* Step Card */}
              <div className="w-64 text-center">
                {/* Number Badge */}
                <div className="relative mx-auto mb-6">
                  <span className="absolute -top-2 left-1/2 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-gold font-heading text-sm font-bold text-white">
                    {step.number}
                  </span>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-navy shadow-lg mx-auto">
                    <step.icon className="h-11 w-11 text-white" />
                  </div>
                </div>

                <h3 className="mb-3 font-heading text-xl font-bold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{step.description}</p>
              </div>

              {/* Connector */}
              {index < steps.length - 1 && (
                <div className="hidden h-0.5 w-16 self-center bg-gradient-to-r from-turquoise to-navy lg:block mt-12" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
