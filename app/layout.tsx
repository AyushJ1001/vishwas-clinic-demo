import type { Metadata } from 'next';
import './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vishwas Clinic',
  description: 'Prescriptions, receipts, certificates and patient records for Vishwas Clinic.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
