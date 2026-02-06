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
          src="/images/Office.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/95 to-navy/80" />
        {/* Simple Texture Overlay */}
        <div className="absolute inset-0 bg-white/5" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 pt-32 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-gold animate-pulse" />
            <span className="text-sm font-medium text-white/90">Trusted by 10,000+ clients nationwide</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Been in an
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold to-gold-light">
              Accident?
            </span>
            <span className="block">We Can Help.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-white/80 mb-4 max-w-2xl mx-auto leading-relaxed">
            Connect with experienced attorneys and medical professionals who fight for your rights.
          </p>

          {/* Disclaimer */}
          <p className="text-sm text-white/70 mb-10 max-w-xl mx-auto italic border-t-2 border-gold/50 pt-4">
            We are not attorneys and do not provide legal advice. We connect you with licensed professionals in our network.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-16 justify-center">
            <Link href="tel:+18449737866">
              <Button
                variant="primary"
                size="lg"
                className="gap-3 text-base px-8 py-5 bg-gold hover:bg-gold-dark shadow-lg shadow-gold/25 hover:shadow-gold/30 focus:ring-gold"
              >
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
                  <badge.icon className="h-5 w-5 text-gold" />
                </div>
                <span className="text-sm font-medium text-white/80">{badge.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2">
        <span className="text-xs text-white/70 uppercase tracking-widest">Scroll</span>
        <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2">
          <div className="w-1 h-2 bg-white/50 rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  )
}
