import type { Metadata, Viewport } from 'next'
import { Azeret_Mono, Bricolage_Grotesque } from 'next/font/google'
import './globals.css'

// Bricolage Grotesque: characterful, slightly irregular, heavy enough to shout
// and odd enough to have a face. Azeret Mono carries the institutional voice:
// codes, timers, verdicts, anything the machine says.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['400', '600', '700', '800'],
  display: 'swap',
})

const azeret = Azeret_Mono({
  subsets: ['latin'],
  variable: '--font-azeret',
  weight: ['400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ruckus',
  description: 'Party games for people who know each other too well.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#faf6ec',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${azeret.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
