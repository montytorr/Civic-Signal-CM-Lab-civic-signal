import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import { AppNav } from '@/components/nav/app-nav'
import { getViewer } from '@/lib/auth/server'
import { RouteBreadcrumbs } from '@/components/nav/route-breadcrumbs'
import { Footer } from '@/components/footer'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://civicsignal.montytorr.com'),
  title: 'CivicSignal',
  description: 'Open-source verified-human civic polling for auditable public opinion signals.',
  openGraph: {
    title: 'CivicSignal',
    description: 'Verified-human civic polling for auditable public opinion signals.',
    url: '/',
    siteName: 'CivicSignal',
    images: [{ url: '/social/preview.png', width: 1280, height: 640, alt: 'CivicSignal — verified-human civic polling' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CivicSignal',
    description: 'Verified-human civic polling for auditable public opinion signals.',
    images: ['/social/preview.png'],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The nav shows the session read on the server (it also makes every page render per request).
  const viewer = await getViewer()
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-parchment-bg text-parchment-ink">
        <AppNav viewer={viewer ? { handle: viewer.handle, isAdmin: viewer.isAdmin } : null} />
        <RouteBreadcrumbs />
        <div className="min-h-screen">{children}</div>
        <Footer />
      </body>
    </html>
  )
}
