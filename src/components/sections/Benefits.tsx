import { User, Briefcase, Check, Star, Shield, Zap, TrendingUp, Award } from 'lucide-react'

const individualBenefits = [
  {
    icon: Shield,
    title: 'Verified Experts Only',
    description:
      'Every professional in our network is thoroughly vetted with verified credentials and proven experience.',
  },
  {
    icon: Zap,
    title: 'Fast Response',
    description:
      'Get connected within 24 hours. We understand that time is critical when dealing with accident cases.',
  },
  {
    icon: Star,
    title: 'Free Consultation',
    description:
      'Our matching service is completely free. You only pay when you engage with a professional.',
  },
  {
    icon: User,
    title: 'Personalized Matching',
    description:
      "We don't just give you a list. We match you with the right professional for your specific situation.",
  },
]

const professionalBenefits = [
  {
    icon: TrendingUp,
    title: 'Quality Referrals',
    description:
      'Receive pre-qualified leads that match your expertise and practice areas.',
  },
  {
    icon: Briefcase,
    title: 'Grow Your Practice',
    description:
      'Expand your client base with warm introductions to people who need your services.',
  },
  {
    icon: Award,
    title: 'Network Access',
    description:
      'Join a prestigious network of top professionals and benefit from cross-referrals.',
  },
  {
    icon: Star,
    title: 'Build Reputation',
    description:
      'Strengthen your reputation through successful connections and client testimonials.',
  },
]

export function Benefits() {
  return (
    <section id="benefits" className="section bg-white pattern-bg">
      <div className="container mx-auto px-4">
        <div className="section-header">
          <span className="section-label">Why Choose Us</span>
          <h2 className="section-title">
            Benefits for <span className="text-turquoise">Everyone</span>
          </h2>
          <p className="section-description">
            Xpert Connect creates value for both individuals seeking help and
            professionals looking to grow their practice.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* For Individuals */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-turquoise/5 to-transparent rounded-3xl" />
            <div className="relative bg-white rounded-3xl p-8 lg:p-10 shadow-xl border border-gray-100">
              {/* Header */}
              <div className="flex items-center gap-4 mb-10 pb-6 border-b border-gray-100">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-turquoise to-turquoise-dark shadow-lg shadow-turquoise/25">
                  <User className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-2xl font-bold text-navy">For Individuals</h3>
                  <p className="text-sm text-gray-500">Seeking professional help</p>
                </div>
              </div>

              {/* Benefits List */}
              <div className="space-y-6">
                {individualBenefits.map((benefit) => (
                  <div key={benefit.title} className="flex gap-4 group">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-turquoise/10 transition-colors group-hover:bg-turquoise">
                        <benefit.icon className="h-5 w-5 text-turquoise transition-colors group-hover:text-white" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-heading font-bold text-navy mb-1">
                        {benefit.title}
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* For Professionals */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent rounded-3xl" />
            <div className="relative bg-white rounded-3xl p-8 lg:p-10 shadow-xl border border-gray-100">
              {/* Header */}
              <div className="flex items-center gap-4 mb-10 pb-6 border-b border-gray-100">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold to-gold-dark shadow-lg shadow-gold/25">
                  <Briefcase className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-2xl font-bold text-navy">For Professionals</h3>
                  <p className="text-sm text-gray-500">Looking to grow your practice</p>
                </div>
              </div>

              {/* Benefits List */}
              <div className="space-y-6">
                {professionalBenefits.map((benefit) => (
                  <div key={benefit.title} className="flex gap-4 group">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10 transition-colors group-hover:bg-gold">
                        <benefit.icon className="h-5 w-5 text-gold transition-colors group-hover:text-white" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-heading font-bold text-navy mb-1">
                        {benefit.title}
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
