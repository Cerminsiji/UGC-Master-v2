import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UGC Master - Creator Studio',
  description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'UGC Master - Creator Studio',
    description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
    type: 'website',
    images: [
      '/assets/aistudio/file_0000000004dc82119cb1e14ad74b3554_optimized_500-removebg-preview_92599332.png',
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGC Master - Creator Studio',
    description: 'Aplikasi pembuatan dan generator storyboard UGC (User Generated Content) dengan template video viral, AI script generator, teleprompter, dan export JSON/PDF.',
    images: [
      '/assets/aistudio/file_0000000004dc82119cb1e14ad74b3554_optimized_500-removebg-preview_92599332.png',
    ],
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
