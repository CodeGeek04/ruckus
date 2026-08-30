import type { Metadata, Viewport } from 'next'
import { Archivo, Azeret_Mono } from 'next/font/google'
import './globals.css'

// Archivo: wide heavy grotesque, legible through a compressed stream at four
// metres. Azeret Mono carries the institutional voice: codes, timers, verdicts.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  weight: ['400', '500', '600', '700', '800', '900'],
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
  themeColor: '#17161d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${azeret.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
