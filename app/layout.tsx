import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

function getMetadataBase() {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) return new URL(siteUrl);
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return new URL(`https://${vercelUrl}`);
  return new URL('http://localhost:3000');
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  applicationName: 'Shared Photo Map',
  title: {
    default: 'Shared Photo Map',
    template: '%s | Shared Photo Map',
  },
  description: 'Create a shared map of geotagged photos and invite friends to add theirs.',
  openGraph: {
    type: 'website',
    title: 'Shared Photo Map',
    description: 'Create a shared map of geotagged photos and invite friends to add theirs.',
    siteName: 'Shared Photo Map',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Shared Photo Map' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shared Photo Map',
    description: 'Create a shared map of geotagged photos and invite friends to add theirs.',
    images: ['/twitter-image'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
