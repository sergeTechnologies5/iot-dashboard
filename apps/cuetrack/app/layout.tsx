import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { StoreProvider } from '@/context/Store';
import { MpesaProvider } from '@/context/Mpesa';
import { Toasts } from '@/components/overlays';

export const metadata: Metadata = {
  title: 'CueTrack · Billiard Token Management',
  description: 'Monitor pool tables, control token credits and track Manual and Online payments across every venue in real time.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <StoreProvider>
          <MpesaProvider>
            {children}
            <Toasts />
          </MpesaProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
