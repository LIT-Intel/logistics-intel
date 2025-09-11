import { Outlet } from 'react-router-dom';

/**
 * Minimal layout to satisfy "@/pages/Layout" import.
 * Replace with your real layout whenever you’re ready.
 */
export default function Layout() {
  return (
    <div>
      <Outlet />
    </div>
  );
}
