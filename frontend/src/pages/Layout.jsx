import { Outlet } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';

/**
 * Minimal layout to satisfy "@/pages/Layout" import.
 * Replace with your real layout whenever you’re ready.
 */
export default function Layout({ children, currentPageName }) {
  // If currentPageName starts with "App:", render inside AppShell
  if (currentPageName && currentPageName !== 'Landing' && currentPageName !== 'Search' && currentPageName !== 'Company' && currentPageName !== 'Demo' && currentPageName !== 'Signup') {
    return (
      <AppShell currentPageName={currentPageName}>
        {children ?? <Outlet />}
      </AppShell>
    );
  }
  return children ?? <Outlet />;
}
