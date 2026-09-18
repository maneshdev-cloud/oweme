import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { PwaRegister } from '@/components/pwa-register';
import { Toaster } from '@/components/ui/sonner';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import './globals.css';

/**
 * Inter, self-hosted from src/fonts.
 *
 * Deliberately not `next/font/google`: that fetches from fonts.googleapis.com
 * while building, so a network-restricted sandbox or CI runner fails the build
 * outright — and it sends every visitor to Google for a font we can ship.
 * The local file is a ~65 KB subset (see src/fonts/README.md) that includes the
 * rupee sign, so amounts never fall back to a system font mid-number.
 */
const inter = localFont({
  src: '../fonts/InterVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900', // variable axis range, so font-medium/semibold/bold all resolve
  style: 'normal',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description:
    'Track small money between friends — printouts, chai, tickets, trips — and settle up without the awkwardness.',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: APP_NAME },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#14121c' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-svh font-sans">
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
