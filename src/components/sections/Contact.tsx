'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'

export function Contact() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))

    alert('Thank you! We will contact you shortly.')
    ;(e.target as HTMLFormElement).reset()
    setIsSubmitting(false)
  }

  return (
    <section id="contact" className="relative">
      <div className="grid min-h-[600px] lg:grid-cols-2">
        {/* Image */}
        <div className="relative h-64 lg:h-auto">
          <Image
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop"
            alt="Professional consultation"
            fill
            className="object-cover"
          />
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center bg-turquoise px-6 py-12 lg:px-12 lg:py-16">
          <h2 className="mb-2 font-heading text-2xl font-bold text-white md:text-3xl">
            Been in an Accident? Contact Us Now!
          </h2>
          <p className="mb-4 text-white/90">
            Tell us about your situation and we'll connect you with the right professionals.
          </p>
          <p className="mb-6 text-sm text-white/70 italic">
            We are not attorneys and do not provide legal advice.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                required
                className="w-full rounded border border-white/30 bg-white/10 px-5 py-4 text-white placeholder-white/70 transition-colors focus:border-white focus:bg-white/20 focus:outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="email"
                name="email"
                placeholder="Email Address"
                required
                className="w-full rounded border border-white/30 bg-white/10 px-5 py-4 text-white placeholder-white/70 transition-colors focus:border-white focus:bg-white/20 focus:outline-none"
              />
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number"
                required
                className="w-full rounded border border-white/30 bg-white/10 px-5 py-4 text-white placeholder-white/70 transition-colors focus:border-white focus:bg-white/20 focus:outline-none"
              />
            </div>

            <div>
              <select
                name="service"
                required
                defaultValue=""
                className="w-full cursor-pointer appearance-none rounded border border-white/30 bg-white/10 px-5 py-4 text-white transition-colors focus:border-white focus:bg-white/20 focus:outline-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                }}
              >
                <option value="" disabled className="text-gray-700">
                  Select Service Type
                </option>
                <option value="legal" className="text-gray-700">
                  Legal Services
                </option>
                <option value="medical" className="text-gray-700">
                  Medical Clinics
                </option>
                <option value="realestate" className="text-gray-700">
                  Real Estate
                </option>
                <option value="other" className="text-gray-700">
                  Other
                </option>
              </select>
            </div>

            <div>
              <textarea
                name="message"
                placeholder="Describe your needs..."
                rows={4}
                className="w-full resize-none rounded border border-white/30 bg-white/10 px-5 py-4 text-white placeholder-white/70 transition-colors focus:border-white focus:bg-white/20 focus:outline-none"
              />
            </div>

            <Button
              type="submit"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Submit Request'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  )
}
