import { Hero } from '@/components/sections/Hero'
import { LawyersDirectory } from '@/components/sections/LawyersDirectory'
import { BodyShopsDirectory } from '@/components/sections/BodyShopsDirectory'
import { About } from '@/components/sections/About'
import { Services } from '@/components/sections/Services'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Contact } from '@/components/sections/Contact'
import { Benefits } from '@/components/sections/Benefits'

export const revalidate = 60

export default function Home() {
  return (
    <>
      <Hero />
      {/* Directly under the hero: the client asked for the directory to be
          "todo al frente". */}
      <LawyersDirectory />
      {/* Right under the lawyers, as its own block (client request, 2026-11-09). */}
      <BodyShopsDirectory />
      <About />
      <Services />
      <HowItWorks />
      <Benefits />
      <Contact />
    </>
  )
}
