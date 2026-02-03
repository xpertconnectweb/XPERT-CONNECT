import { User, Briefcase, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const individualBenefits = [
  {
    title: 'Verified Experts Only',
    description:
      'Every professional in our network is thoroughly vetted with verified credentials and experience.',
  },
  {
    title: 'Personalized Matching',
    description:
      "We don't just give you a list - we match you with the right professional for your specific situation.",
  },
  {
    title: 'Free Consultation',
    description:
      'Our matching service is completely free. You only pay when you engage with a professional.',
  },
  {
    title: 'Ongoing Support',
    description:
      "We follow up to ensure your connection is working and you're getting the help you need.",
  },
]

const professionalBenefits = [
  {
    title: 'Quality Referrals',
    description:
      'Receive pre-qualified leads that match your expertise and practice areas.',
  },
  {
    title: 'Grow Your Practice',
    description:
      'Expand your client base with warm introductions to people who need your services.',
  },
  {
    title: 'Network Access',
    description:
      'Join a prestigious network of top professionals and benefit from cross-referrals.',
  },
  {
    title: 'Reputation Building',
    description:
      'Strengthen your reputation through successful connections and client testimonials.',
  },
]

interface BenefitColumnProps {
  title: string
  icon: typeof User
  benefits: { title: string; description: string }[]
  variant: 'individual' | 'professional'
}

function BenefitColumn({ title, icon: Icon, benefits, variant }: BenefitColumnProps) {
  return (
    <div className="rounded-lg bg-white p-8 shadow-md lg:p-10">
      <h3 className="mb-8 flex items-center gap-4 border-b-2 border-gray-100 pb-6 font-heading text-2xl font-bold">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            variant === 'individual' ? 'bg-turquoise' : 'bg-gold'
          )}
        >
          <Icon className="h-6 w-6 text-white" />
        </span>
        {title}
      </h3>

      <ul className="space-y-6">
        {benefits.map((benefit) => (
          <li key={benefit.title} className="flex gap-4">
            <span
              className={cn(
                'mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                variant === 'individual' ? 'bg-turquoise' : 'bg-gold'
              )}
            >
              <Check className="h-4 w-4 text-white" />
            </span>
            <div>
              <strong className="mb-1 block font-heading text-base font-bold text-navy">
                {benefit.title}
              </strong>
              <p className="text-sm leading-relaxed text-gray-600">{benefit.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Benefits() {
  return (
    <section id="benefits" className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="section-header">
          <span className="section-label">Why Choose Us</span>
          <h2 className="section-title">Benefits for Everyone</h2>
          <p className="section-description">
            Xpert Connect creates value for both individuals seeking help and professionals
            looking to grow.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <BenefitColumn
            title="For Individuals"
            icon={User}
            benefits={individualBenefits}
            variant="individual"
          />
          <BenefitColumn
            title="For Professionals"
            icon={Briefcase}
            benefits={professionalBenefits}
            variant="professional"
          />
        </div>
      </div>
    </section>
  )
}
