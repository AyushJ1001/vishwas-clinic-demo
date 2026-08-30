import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Vishwas Clinic | Doctor workspace demo',
  description: 'A guided demo of Vishwas Clinic prescription, receipt, certificate, and reporting workflows.',
  openGraph: {
    title: 'Vishwas Clinic | Doctor workspace demo',
    description: 'One calm workspace for the whole consultation.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vishwas Clinic | Doctor workspace demo',
    description: 'One calm workspace for the whole consultation.',
    images: ['/og.png'],
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
        className={`${outfit.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
