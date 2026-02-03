import Link from 'next/link'
import { Scale, Hospital, Home } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const services = [
  {
    icon: Scale,
    title: 'Legal Services',
    description:
      'Connect with experienced personal injury attorneys who fight for your rights. Our legal partners specialize in accident cases and have decades of courtroom success.',
    features: [
      'Auto Accident Attorneys',
      'Personal Injury Lawyers',
      'Workers Compensation',
      'Slip & Fall Cases',
    ],
    cta: 'Find an Attorney',
    featured: true,
    badge: 'Most Requested',
  },
  {
    icon: Hospital,
    title: 'Medical Clinics',
    description:
      'Access top-rated medical clinics specializing in accident injuries. Get the treatment you need and proper documentation for your case.',
    features: [
      'Accident Injury Clinics',
      'Chiropractic Care',
      'Physical Therapy',
      'Diagnostic Imaging',
    ],
    cta: 'Find a Clinic',
    featured: false,
  },
  {
    icon: Home,
    title: 'Real Estate',
    description:
      'Work with seasoned realtors who know the market inside and out. Whether buying, selling, or investing, our real estate professionals deliver results.',
    features: [
      'Residential Sales',
      'Commercial Properties',
      'Investment Consulting',
      'Property Management',
    ],
    cta: 'Find a Realtor',
    featured: false,
  },
]

export function Services() {
  return (
    <section id="services" className="section bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="section-header">
          <span className="section-label">Our Services</span>
          <h2 className="section-title">Expert Connections in Three Key Areas</h2>
          <p className="section-description">
            We specialize in connecting you with thoroughly vetted professionals who have
            proven track records.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.title}
              className={cn(
                'group relative rounded-lg bg-white p-8 shadow-md transition-all duration-300 hover:-translate-y-2 hover:shadow-xl',
                service.featured && 'border-2 border-turquoise'
              )}
            >
              {service.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-4 py-1 font-heading text-xs font-semibold uppercase tracking-wide text-white">
                  {service.badge}
                </span>
              )}

              {/* Icon */}
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-turquoise">
                <service.icon className="h-10 w-10 text-turquoise transition-colors group-hover:text-white" />
              </div>

              <h3 className="mb-4 text-center font-heading text-2xl font-bold">
                {service.title}
              </h3>
              <p className="mb-5 text-center text-sm text-gray-600">{service.description}</p>

              {/* Features */}
              <ul className="mb-6 space-y-2">
                {service.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 border-b border-gray-100 py-2 text-sm text-gray-700"
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-turquoise" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href="#contact" className="block">
                <Button
                  variant={service.featured ? 'primary' : 'secondary'}
                  className="w-full"
                >
                  {service.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
