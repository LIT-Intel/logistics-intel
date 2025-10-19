import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3Icon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline';

export type SidebarItem = { href: string; label: string; icon?: React.ReactNode; children?: SidebarItem[] };

interface Props {
  items: SidebarItem[];
  collapsed: boolean;
  onToggle(): void;
}

export default function Sidebar({ items, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  return (
    <aside className={`h-full bg-white border-r sticky top-0 transition-[width] duration-300 ${collapsed ? 'w-16' : 'w-64'}`} aria-label="Primary">
      <div className="flex items-center justify-between px-3 h-14 border-b">
        <Link href="/" className="flex items-center gap-2" aria-label="LIT Home">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500" />
          {!collapsed && <span className="font-semibold">LIT</span>}
        </Link>
        <button className="p-1 rounded hover:bg-gray-100" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? <ChevronDoubleRightIcon className="w-5 h-5"/> : <ChevronDoubleLeftIcon className="w-5 h-5"/>}
        </button>
      </div>
      <nav className="px-2 py-3 text-sm">
        {items.map((item) => (
          <SidebarNode key={item.href} item={item} activePath={pathname} collapsed={collapsed} depth={0} />
        ))}
      </nav>
      <div className="mt-auto p-2 hidden">
        <Bars3Icon className="w-5 h-5"/>
      </div>
    </aside>
  );
}

function SidebarNode({ item, activePath, collapsed, depth }: { item: SidebarItem; activePath: string | null; collapsed: boolean; depth: number; }) {
  const isActive = activePath?.startsWith(item.href);
  const [open, setOpen] = React.useState(isActive);
  const hasChildren = (item.children?.length ?? 0) > 0;
  return (
    <div className="mb-1">
      <Link href={item.href} className={`flex items-center gap-2 rounded px-2 py-2 group ${isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'}`} onClick={() => hasChildren && setOpen(v => !v)}>
        {item.icon}
        {!collapsed && <span className={`${depth ? 'ml-2' : ''}`}>{item.label}</span>}
        {collapsed && <span className="sr-only">{item.label}</span>}
      </Link>
      {hasChildren && !collapsed && open && (
        <div className="ml-4 border-l pl-2">
          {item.children!.map((c) => (
            <SidebarNode key={c.href} item={c} activePath={activePath} collapsed={collapsed} depth={depth+1}/>
          ))}
        </div>
      )}
    </div>
  );
}
