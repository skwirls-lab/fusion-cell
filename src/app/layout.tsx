import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ExerciseBanner } from '@/components/shell/ExerciseBanner';

export const metadata: Metadata = {
  title: 'Fusion Cell',
  description: 'Meridian Reach all-source intelligence workspace (exercise, fictional data)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col bg-bg text-text antialiased">
        <ExerciseBanner />
        <Providers>{children}</Providers>
        <ExerciseBanner />
      </body>
    </html>
  );
}
