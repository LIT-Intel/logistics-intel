import React from 'react';
import Sidebar, { SidebarItem } from './Sidebar';
import MobileNav from './MobileNav';

export default function AppShell({ children, items }: { children: React.ReactNode; items: SidebarItem[] }) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[auto,1fr] lg:grid-rows-[auto,1fr]">
      <div className="hidden lg:block"><Sidebar items={items} collapsed={collapsed} onToggle={()=>setCollapsed(v=>!v)} /></div>
      <MobileNav items={items} />
      <main className="lg:col-start-2 lg:row-span-2 p-4 lg:p-6 bg-gray-50 min-h-[calc(100vh-56px)]">{children}</main>
    </div>
  );
}
