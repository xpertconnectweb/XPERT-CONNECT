import { Hero } from '@/components/sections/Hero'
import { LawyersDirectory } from '@/components/sections/LawyersDirectory'
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
      {/* Directly under the hero: the client asked for the directory to be
          "todo al frente". It also reads its own data, so it takes no prop
          from the Sanity fetch above. */}
      <LawyersDirectory />
      <About data={about} />
      <Services data={services} />
      <HowItWorks data={howItWorks} />
      <Benefits data={benefits} />
      <Contact data={contact} />
    </>
  )
}
