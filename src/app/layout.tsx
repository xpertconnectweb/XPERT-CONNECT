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
  title: 'Xpert Connect | Been in an Accident? We Can Help',
  description: 'Connect with experienced attorneys and medical clinics after an accident. Free consultation. We are not attorneys - we connect you with trusted professionals who can help.',
  keywords: ['accident attorney', 'personal injury', 'medical clinics', 'car accident', 'legal referral', 'injury treatment'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
        <FloatingButton />
      </body>
    </html>
  )
}
