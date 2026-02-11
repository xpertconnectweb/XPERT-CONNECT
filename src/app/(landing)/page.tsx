import { Hero } from '@/components/sections/Hero'
import { About } from '@/components/sections/About'
import { Services } from '@/components/sections/Services'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Contact } from '@/components/sections/Contact'
import { Benefits } from '@/components/sections/Benefits'

export default function Home() {
  return (
    <>
      <Hero />
      <About />
      <Services />
      <HowItWorks />
      <Benefits />
      <Contact />
    </>
  )
}
