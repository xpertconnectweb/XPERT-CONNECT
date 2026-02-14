import { Hero } from '@/components/sections/Hero'
import { About } from '@/components/sections/About'
import { Services } from '@/components/sections/Services'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Contact } from '@/components/sections/Contact'
import { Benefits } from '@/components/sections/Benefits'
import {
  getHeroData,
  getAboutData,
  getServicesData,
  getHowItWorksData,
  getBenefitsData,
  getContactData,
} from '@/lib/sanity-queries'

export const revalidate = 60

export default async function Home() {
  const [hero, about, services, howItWorks, benefits, contact] =
    await Promise.all([
      getHeroData().catch(() => null),
      getAboutData().catch(() => null),
      getServicesData().catch(() => null),
      getHowItWorksData().catch(() => null),
      getBenefitsData().catch(() => null),
      getContactData().catch(() => null),
    ])

  return (
    <>
      <Hero data={hero} />
      <About data={about} />
      <Services data={services} />
      <HowItWorks data={howItWorks} />
      <Benefits data={benefits} />
      <Contact data={contact} />
    </>
  )
}
