import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Search as SearchIcon, Home, BarChart3, Building2, Mail, Activity, FileText, Package, Settings, CreditCard, Users2, Shield, TrendingUp, Database, Bug, Menu, Moon } from 'lucide-react';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator, BreadcrumbLink, BreadcrumbPage } from '@/components/ui/breadcrumb';

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');

  const nav = {
    main: [
      { id: 'dashboard', label: 'Dashboard', icon: Home, to: '/app/dashboard' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, to: '/app/dashboard' },
      { id: 'search', label: 'Search', icon: SearchIcon, to: '/app/search' },
      { id: 'companies', label: 'Companies', icon: Building2, to: '/app/companies' },
      { id: 'campaigns', label: 'Campaigns', icon: Mail, to: '/app/campaigns' },
      { id: 'transactions', label: 'Transactions', icon: Activity, to: '/app/transactions' },
    ],
    tools: [
      { id: 'rfp', label: 'RFP Studio', icon: FileText, to: '/app/rfp' },
      { id: 'widgets', label: 'Widgets', icon: Package, to: '/app/widgets' },
    ],
    account: [
      { id: 'settings', label: 'Settings', icon: Settings, to: '/app/settings' },
      { id: 'billing', label: 'Billing', icon: CreditCard, to: '/app/billing' },
      { id: 'affiliate', label: 'Affiliate', icon: Users2, to: '/app/affiliate' },
    ],
    admin: [
      { id: 'admin', label: 'Admin Dashboard', icon: Shield, to: '/app/admin' },
      { id: 'prospecting', label: 'Lead Prospecting', icon: TrendingUp, to: '/app/prospecting' },
      { id: 'cms', label: 'CMS', icon: Database, to: '/app/cms' },
      { id: 'diagnostic', label: 'Debug Agent', icon: Bug, to: '/app/diagnostic' },
    ],
  };

  const isActive = (to) => location.pathname === to;
  const activeLabel = currentPageName || Object.values(nav).flat().find(i => isActive(i.to))?.label || 'Dashboard';

  if (!isAppRoute) {
    return (
      <div>
        {children ?? <Outlet />}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 text-white shadow-2xl flex flex-col">
        <div className="flex items-center px-6 py-6">
          <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg flex items-center justify-center mr-3">
            <span className="text-white font-bold text-sm">LIT</span>
          </div>
          <div>
            <div className="font-bold text-lg">Lahomes</div>
            <div className="text-gray-300 text-xs">LIVING LIFE</div>
          </div>
        </div>

        <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">Menu</div>
        <nav className="flex-1 overflow-y-auto py-2">
          <Section title="" items={nav.main} isActive={isActive} />
          <Section title="Tools" items={nav.tools} isActive={isActive} />
          <Section title="Account" items={nav.account} isActive={isActive} />
          <Section title="Admin" items={nav.admin} isActive={isActive} />
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                <Menu size={18} />
              </button>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><Moon size={18} /></button>
            </div>
          </div>
          <div className="px-6 py-3 bg-white/50 border-t border-gray-100">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/app/dashboard">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

function Section({ title, items, isActive }) {
  return (
    <div className="mb-4">
      {title ? (
        <div className="px-4 py-2 text-gray-400 text-xs font-semibold uppercase tracking-wider">{title}</div>
      ) : null}
      <div>
        {items.map((item) => (
          <Link key={item.id} to={item.to} className="block">
            <div
              className={
                'flex items-center justify-between px-4 py-3 mx-2 rounded-lg cursor-pointer transition-all duration-200 ' +
                (isActive(item.to)
                  ? 'bg-white/10 text-white backdrop-blur-sm'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white')
              }
            >
              <div className="flex items-center">
                <item.icon size={18} className="mr-3" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
