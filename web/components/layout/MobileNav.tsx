import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import type { SidebarItem } from './Sidebar';

export default function MobileNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b h-14 flex items-center px-3">
        <button className="p-2 -ml-1" aria-label="Open menu" onClick={()=>setOpen(true)}>
          <Bars3Icon className="w-6 h-6" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500" />
          <span className="font-semibold">LIT</span>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] bg-white shadow-xl">
            <div className="h-14 border-b flex items-center justify-between px-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500" />
                <span className="font-semibold">LIT</span>
              </div>
              <button className="p-2" onClick={()=>setOpen(false)} aria-label="Close menu"><XMarkIcon className="w-6 h-6"/></button>
            </div>
            <nav className="p-3 space-y-1">
              {items.map(i => (
                <Link key={i.href} href={i.href} className={`block px-3 py-2 rounded ${pathname?.startsWith(i.href)?'bg-indigo-50 text-indigo-700':'hover:bg-gray-50'}`} onClick={()=>setOpen(false)}>
                  {i.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
