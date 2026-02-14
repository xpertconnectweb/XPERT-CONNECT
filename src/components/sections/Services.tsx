import Link from 'next/link'
import { Scale, Hospital, Home, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ServicesData } from '@/lib/sanity-types'

const iconMap: Record<string, typeof Scale> = { Scale, Hospital, Home }

const defaultServices = [
  {
    icon: Scale,
    title: 'Legal Services',
    subtitle: 'Personal Injury Attorneys',
    description:
      'Connect with experienced personal injury attorneys who fight for your rights. Our legal partners specialize in accident cases and have decades of courtroom success.',
    features: [
      'Auto Accident Attorneys',
      'Personal Injury Lawyers',
      'Workers Compensation',
      'Slip & Fall Cases',
    ],
    cta: 'Find an Attorney',
    color: 'navy' as const,
    featured: true,
  },
  {
    icon: Hospital,
    title: 'Medical Clinics',
    subtitle: 'Injury Treatment Centers',
    description:
      'Access top-rated medical clinics specializing in accident injuries. Get the treatment you need and proper documentation for your case.',
    features: [
      'Accident Injury Clinics',
      'Chiropractic Care',
      'Physical Therapy',
      'Diagnostic Imaging',
    ],
    cta: 'Find a Clinic',
    color: 'gold' as const,
    featured: false,
  },
  {
    icon: Home,
    title: 'Real Estate',
    subtitle: 'Trusted Realtors',
    description:
      'Work with seasoned realtors who know the market inside and out. Whether buying, selling, or investing, our real estate professionals deliver results.',
    features: [
      'Residential Sales',
      'Commercial Properties',
      'Investment Consulting',
      'Property Management',
    ],
    cta: 'Find a Realtor',
    color: 'navy' as const,
    featured: false,
  },
]

interface ServicesProps {
  data?: ServicesData | null
}

export function Services({ data }: ServicesProps) {
  const label = data?.label ?? 'Our Services'
  const titleLine1 = data?.titleLine1 ?? 'Expert Connections in'
  const titleAccent = data?.titleAccent ?? ' Three Key Areas'
  const description = data?.description ?? 'We specialize in connecting you with thoroughly vetted professionals who have proven track records of success.'

  const services = data?.services
    ? data.services.map((s) => ({
        icon: iconMap[s.iconName] ?? Scale,
        title: s.title,
        subtitle: s.subtitle,
        description: s.description,
        features: s.features,
        cta: s.cta,
        color: s.color as 'navy' | 'gold',
        featured: s.featured,
      }))
    : defaultServices

  return (
    <section id="services" className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="section-header">
          <span className="section-label">{label}</span>
          <h2 className="section-title">
            {titleLine1}
            <span className="text-gold">{titleAccent}</span>
          </h2>
          <p className="section-description">
            {description}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.title}
              className={cn(
                'group relative rounded-3xl bg-white p-8 lg:p-10 transition-all duration-500',
                'hover:-translate-y-2 hover:shadow-2xl',
                service.featured
                  ? 'shadow-xl ring-2 ring-gold/25'
                  : 'shadow-lg hover:shadow-xl'
              )}
            >
              {/* Featured Badge */}
              {service.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-gold to-gold-dark px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
                    Most Requested
                  </span>
                </div>
              )}

              {/* Icon */}
              <div
                className={cn(
                  'mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300',
                  service.color === 'navy' && 'bg-navy/10 group-hover:bg-navy',
                  service.color === 'gold' && 'bg-gold/10 group-hover:bg-gold'
                )}
              >
                <service.icon
                  className={cn(
                    'h-8 w-8 transition-colors duration-300 group-hover:text-white',
                    service.color === 'navy' && 'text-navy',
                    service.color === 'gold' && 'text-gold'
                  )}
                />
              </div>

              {/* Content */}
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  {service.subtitle}
                </p>
                <h3 className="font-heading text-2xl font-bold text-navy mb-3">
                  {service.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {service.description}
                </p>
              </div>

              {/* Features */}
              <ul className="mb-8 space-y-3">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-white text-xs',
                        service.color === 'navy' && 'bg-navy/20 text-navy',
                        service.color === 'gold' && 'bg-gold/20 text-gold'
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="#contact"
                className={cn(
                  'inline-flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide transition-all',
                  'group-hover:gap-3',
                  service.color === 'navy' && 'text-navy',
                  service.color === 'gold' && 'text-gold'
                )}
              >
                {service.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
