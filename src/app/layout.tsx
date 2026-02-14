import type { Metadata } from 'next'
import { Montserrat, Open_Sans } from 'next/font/google'
import './globals.css'
import { getSiteSettings } from '@/lib/sanity-queries'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  display: 'swap',
})

const defaultTitle = 'Xpert Connect | Been in an Accident? We Can Help'
const defaultDescription = 'Connect with experienced attorneys and medical clinics after an accident. Free consultation. We are not attorneys - we connect you with trusted professionals who can help.'
const defaultKeywords = ['accident attorney', 'personal injury', 'medical clinics', 'car accident', 'legal referral', 'injury treatment']

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings().catch(() => null)

  const title = settings?.title ?? defaultTitle
  const description = settings?.description ?? defaultDescription
  const keywords = settings?.keywords ?? defaultKeywords

  return {
    metadataBase: new URL('https://www.xpertconnect.com'),
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      url: 'https://www.xpertconnect.com',
      siteName: 'Xpert Connect',
      locale: 'en_US',
      type: 'website',
      images: [{ url: '/images/logo.png', width: 1200, height: 630, alt: 'Xpert Connect' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/images/logo.png'],
    },
    icons: {
      icon: '/images/logo.png',
      apple: '/images/logo.png',
    },
    manifest: '/manifest.json',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="bg-white text-gray-700">
        {children}
      </body>
    </html>
  )
}
