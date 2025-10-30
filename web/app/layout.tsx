import './globals.css';
import MarketingHeader from '@/components/landing/MarketingHeader';
import MarketingFooter from '@/components/landing/MarketingFooter';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-white">
        <MarketingHeader />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          {children}
        </main>
        <MarketingFooter />
      </body>
    </html>
  );
}
