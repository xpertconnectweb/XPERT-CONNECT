import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Phone } from 'lucide-react'

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center bg-cover bg-fixed bg-center"
      style={{
        backgroundImage: `url('https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop')`,
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-navy/90 to-navy/70" />

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 py-32 text-center text-white">
        <h1 className="mb-5 font-heading text-4xl font-bold text-white drop-shadow-lg md:text-5xl lg:text-6xl">
          Connect with Trusted Experts
        </h1>
        <p className="mb-5 font-heading text-xl font-medium text-gold md:text-2xl">
          Been in an accident? We can help.
        </p>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-white/90 md:text-xl">
          We connect you with experienced attorneys, medical clinics, and real estate professionals
          who can help you get the support you deserve.
        </p>

        {/* Disclaimer */}
        <p className="mx-auto mb-8 max-w-xl text-sm text-white/70 italic">
          We are not attorneys and do not provide legal advice. We connect you with licensed professionals.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="tel:+18449737866">
            <Button variant="primary" size="lg" className="gap-2">
              <Phone className="h-5 w-5" />
              Call Us Now
            </Button>
          </Link>
          <Link href="#contact">
            <Button variant="outline" size="lg">
              Free Consultation
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
