import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { Phone, Shield, Clock, Users } from 'lucide-react'

const trustBadges = [
  { icon: Shield, text: 'Verified Professionals' },
  { icon: Clock, text: '24/7 Available' },
  { icon: Users, text: '10,000+ Clients Helped' },
]


export function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop"
          alt="Professional office"
          fill
          className="object-cover"
          priority
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/95 to-navy/80" />
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
            backgroundPosition: 'center',
            backgroundSize: '120px 120px',
          }} />
        </div>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 pt-32 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-turquoise animate-pulse" />
            <span className="text-sm font-medium text-white/90">Trusted by 10,000+ clients nationwide</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Been in an
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-turquoise to-turquoise-light">
              Accident?
            </span>
            <span className="block">We Can Help.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-white/80 mb-4 max-w-2xl mx-auto leading-relaxed">
            Connect with experienced attorneys and medical professionals who fight for your rights.
          </p>

          {/* Disclaimer */}
          <p className="text-sm text-white/50 mb-10 max-w-xl mx-auto italic border-t-2 border-turquoise/50 pt-4">
            We are not attorneys and do not provide legal advice. We connect you with licensed professionals in our network.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-16 justify-center">
            <Link href="tel:+18449737866">
              <Button variant="primary" size="lg" className="gap-3 text-base px-8 py-5 shadow-lg shadow-turquoise/25">
                <Phone className="h-5 w-5" />
                Call 1-844-XPERT-NOW
              </Button>
            </Link>
            <Link href="#contact">
              <Button variant="outline" size="lg" className="text-base px-8 py-5">
                Free Consultation
              </Button>
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap gap-6 lg:gap-10 justify-center">
            {trustBadges.map((badge) => (
              <div key={badge.text} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
                  <badge.icon className="h-5 w-5 text-turquoise" />
                </div>
                <span className="text-sm font-medium text-white/80">{badge.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2">
        <span className="text-xs text-white/50 uppercase tracking-widest">Scroll</span>
        <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2">
          <div className="w-1 h-2 bg-white/50 rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  )
}
