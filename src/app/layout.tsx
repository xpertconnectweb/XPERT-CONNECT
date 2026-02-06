import type { Metadata } from 'next'
import { Montserrat, Open_Sans } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { FloatingButton } from '@/components/ui/FloatingButton'

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

export const metadata: Metadata = {
  metadataBase: new URL('https://www.xpertconnect.com'),
  title: 'Xpert Connect | Been in an Accident? We Can Help',
  description: 'Connect with experienced attorneys and medical clinics after an accident. Free consultation. We are not attorneys - we connect you with trusted professionals who can help.',
  keywords: ['accident attorney', 'personal injury', 'medical clinics', 'car accident', 'legal referral', 'injury treatment'],
  openGraph: {
    title: 'Xpert Connect | Been in an Accident? We Can Help',
    description: 'Connect with experienced attorneys and medical clinics after an accident. Free consultation.',
    url: 'https://www.xpertconnect.com',
    siteName: 'Xpert Connect',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/images/logo.png', width: 1200, height: 630, alt: 'Xpert Connect' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Xpert Connect | Been in an Accident? We Can Help',
    description: 'Connect with experienced attorneys and medical clinics after an accident. Free consultation.',
    images: ['/images/logo.png'],
  },
  icons: {
    icon: '/images/logo.png',
    apple: '/images/logo.png',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="bg-white text-gray-700">
        <Header />
        <main id="main-content" className="min-h-screen">
          {children}
        </main>
        <Footer />
        <FloatingButton />
      </body>
    </html>
  )
}
