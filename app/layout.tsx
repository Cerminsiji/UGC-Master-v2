import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UGC Master - Creator Studio',
  description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
  openGraph: {
    title: 'UGC Master - Creator Studio',
    description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGC Master - Creator Studio',
    description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-[#070a12] text-slate-100 antialiased selection:bg-purple-600 selection:text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
