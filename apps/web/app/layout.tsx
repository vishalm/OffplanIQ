import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/layout/Nav'
import { GlobalChat } from '@/components/chat/GlobalChat'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OffplanIQ | Dubai Off-Plan Intelligence',
  description: 'Track 142+ Dubai off-plan projects. Live PSF data, sell-through velocity, IRR calculator, developer scorecards.',
  openGraph: {
    title: 'OffplanIQ',
    description: 'Dubai off-plan property intelligence for serious investors',
    url: 'https://offplaniq.com',
    siteName: 'OffplanIQ',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Nav />
        {children}
        <GlobalChat />
      </body>
    </html>
  )
}
