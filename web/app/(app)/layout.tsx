import '../globals.css';
import AppShell from '@/components/layout/AppShell';
import type { SidebarItem } from '@/components/layout/Sidebar';

const items: SidebarItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/command-center', label: 'Command Center' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/rfp', label: 'RFPs' }
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppShell items={items}>{children}</AppShell>
    </div>
  );
}
