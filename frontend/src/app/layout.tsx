import type { Metadata } from 'next';
import { Bitter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ClerkProvider } from '@clerk/nextjs';
import { cn, constructMetadata } from '@/lib/utils';
import './globals.css';

const bitter = Bitter({
  weight: '400',
  subsets: ['latin'],
});

export const metadata = constructMetadata();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignOutUrl='/'>
      <html lang='en' className='bg-slate-50'>
        <body className={cn(bitter.className)}>
          <main>{children}</main>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
