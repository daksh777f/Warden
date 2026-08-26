import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Warden — bounded, gated, autonomous commerce.',
  description:
    'Warden — bounded, gated, autonomous commerce. Researches vendors, verifies merchants, enforces spending policies, and executes software purchases autonomously.',
  openGraph: {
    title: 'Warden — bounded, gated, autonomous commerce.',
    description:
      'Bounded, gated, autonomous commerce. Researches vendors, enforces deterministic spending policies, and executes purchases autonomously.',
    siteName: 'Warden',
    type: 'website',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/favicon.ico',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
