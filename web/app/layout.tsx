import './globals.css';
import AppShell from '@/components/layout/AppShell';
import type { SidebarItem } from '@/components/layout/Sidebar';

const items: SidebarItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/command-center', label: 'Command Center' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/rfp', label: 'RFPs' }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell items={items}>{children}</AppShell>
      </body>
    </html>
  );
}
