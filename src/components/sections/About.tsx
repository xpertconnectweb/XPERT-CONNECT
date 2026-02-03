import Image from 'next/image'

const stats = [
  { number: '20+', label: 'Years Experience' },
  { number: '500+', label: 'Verified Experts' },
  { number: '10K+', label: 'Connections Made' },
]

export function About() {
  return (
    <section id="about" className="section bg-white">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Image */}
          <div className="relative">
            <div className="relative overflow-hidden rounded-lg shadow-xl">
              <Image
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=400&fit=crop"
                alt="Professional team meeting"
                width={600}
                height={400}
                className="h-auto w-full object-cover"
              />
            </div>
            {/* Accent border */}
            <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-lg border-4 border-turquoise" />
          </div>

          {/* Content */}
          <div>
            <span className="section-label">Who We Are</span>
            <h2 className="section-title text-left">Your Bridge to Trusted Professionals</h2>
            <p className="mb-5 text-gray-600">
              An accident can be a sudden and life-changing experience. You may be dealing with
              injuries, medical bills, and the stress of not knowing where to turn. That's where
              we come in.
            </p>
            <p className="mb-5 text-gray-600">
              Xpert Connect helps you find the legal and medical support you need to recover.
              As a referral service, we connect you with experienced attorneys and healthcare
              providers who will make sure you understand your rights and receive the care and
              compensation you're entitled to.
            </p>
            <p className="mb-8 text-sm italic text-gray-500">
              Note: We are not attorneys and do not provide legal advice. We simply connect you
              with licensed professionals in our network.
            </p>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 border-t border-gray-200 pt-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <span className="block font-heading text-4xl font-bold text-turquoise">
                    {stat.number}
                  </span>
                  <span className="text-sm uppercase tracking-wide text-gray-500">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
