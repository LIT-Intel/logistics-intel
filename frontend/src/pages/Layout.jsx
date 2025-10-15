import { Outlet } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import DebugOverlay from '@/components/DebugOverlay';

/**
 * Minimal layout to satisfy "@/pages/Layout" import.
 * Replace with your real layout whenever you’re ready.
 */
export default function Layout({ children, currentPageName }) {
  // Public pages render without AppShell, everything else inside AppShell
  const isPublic = currentPageName === 'Landing' || currentPageName === 'Demo' || currentPageName === 'Signup';
  if (!isPublic) {
    return (
      <AppShell currentPageName={currentPageName}>
        {children ?? <Outlet />}
        {/* Debug overlay shows only when ?debug=1 or localStorage flag is set */}
        <DebugOverlay />
      </AppShell>
    );
  }
  return (
    <>
      {children ?? <Outlet />}
      <DebugOverlay />
    </>
  );
}
