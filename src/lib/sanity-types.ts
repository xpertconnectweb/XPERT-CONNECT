// TypeScript interfaces for Sanity CMS content

export interface SanityImage {
  _type: 'image'
  asset: {
    _ref: string
    _type: 'reference'
  }
  alt?: string
}

export interface SiteSettings {
  title: string
  description: string
  keywords: string[]
  ogImage?: SanityImage
}

export interface HeroData {
  badge: string
  headlineLine1: string
  headlineAccent: string
  headlineLine3: string
  subtitle: string
  disclaimer: string
  ctaPrimaryText: string
  ctaPrimaryHref: string
  ctaSecondaryText: string
  ctaSecondaryHref: string
  backgroundImage?: SanityImage
  trustBadges: { text: string }[]
}

export interface AboutData {
  label: string
  titleLine1: string
  titleAccent: string
  paragraph1: string
  paragraph2: string
  highlights: string[]
  disclaimer: string
  image?: SanityImage
  stats: {
    value: number
    suffix: string
    label: string
    abbreviateThousands?: boolean
  }[]
}

export interface ServiceItem {
  title: string
  subtitle: string
  description: string
  features: string[]
  cta: string
  color: 'navy' | 'gold'
  featured: boolean
  iconName: string
}

export interface ServicesData {
  label: string
  titleLine1: string
  titleAccent: string
  description: string
  services: ServiceItem[]
}

export interface StepItem {
  number: string
  title: string
  description: string
  iconName: string
}

export interface HowItWorksData {
  label: string
  titleLine1: string
  titleAccent: string
  description: string
  steps: StepItem[]
  ctaText: string
}

export interface BenefitItem {
  title: string
  description: string
  iconName: string
}

export interface BenefitsData {
  label: string
  titleLine1: string
  titleAccent: string
  description: string
  individualBenefits: BenefitItem[]
  professionalBenefits: BenefitItem[]
}

export interface ContactInfoItem {
  label: string
  value: string
  href?: string
  iconName: string
}

export interface ContactData {
  label: string
  titleLine1: string
  titleAccent: string
  description: string
  disclaimer: string
  formTitle: string
  formDescription: string
  contactInfo: ContactInfoItem[]
}
