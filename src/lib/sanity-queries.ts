import { sanityClient } from './sanity'
import type {
  SiteSettings,
  HeroData,
  AboutData,
  ServicesData,
  HowItWorksData,
  BenefitsData,
  ContactData,
} from './sanity-types'

export async function getSiteSettings(): Promise<SiteSettings | null> {
  return sanityClient.fetch<SiteSettings | null>(
    `*[_type == "siteSettings"][0]{
      title,
      description,
      keywords,
      ogImage
    }`
  )
}

export async function getHeroData(): Promise<HeroData | null> {
  return sanityClient.fetch<HeroData | null>(
    `*[_type == "hero"][0]{
      badge,
      headlineLine1,
      headlineAccent,
      headlineLine3,
      subtitle,
      disclaimer,
      ctaPrimaryText,
      ctaPrimaryHref,
      ctaSecondaryText,
      ctaSecondaryHref,
      backgroundImage,
      trustBadges[]{ text }
    }`
  )
}

export async function getAboutData(): Promise<AboutData | null> {
  return sanityClient.fetch<AboutData | null>(
    `*[_type == "about"][0]{
      label,
      titleLine1,
      titleAccent,
      paragraph1,
      paragraph2,
      highlights,
      disclaimer,
      image,
      stats[]{ value, suffix, label, abbreviateThousands }
    }`
  )
}

export async function getServicesData(): Promise<ServicesData | null> {
  return sanityClient.fetch<ServicesData | null>(
    `*[_type == "services"][0]{
      label,
      titleLine1,
      titleAccent,
      description,
      services[]{ title, subtitle, description, features, cta, color, featured, iconName }
    }`
  )
}

export async function getHowItWorksData(): Promise<HowItWorksData | null> {
  return sanityClient.fetch<HowItWorksData | null>(
    `*[_type == "howItWorks"][0]{
      label,
      titleLine1,
      titleAccent,
      description,
      steps[]{ number, title, description, iconName },
      ctaText
    }`
  )
}

export async function getBenefitsData(): Promise<BenefitsData | null> {
  return sanityClient.fetch<BenefitsData | null>(
    `*[_type == "benefits"][0]{
      label,
      titleLine1,
      titleAccent,
      description,
      individualBenefits[]{ title, description, iconName },
      professionalBenefits[]{ title, description, iconName }
    }`
  )
}

export async function getContactData(): Promise<ContactData | null> {
  return sanityClient.fetch<ContactData | null>(
    `*[_type == "contact"][0]{
      label,
      titleLine1,
      titleAccent,
      description,
      disclaimer,
      formTitle,
      formDescription,
      contactInfo[]{ label, value, href, iconName }
    }`
  )
}
