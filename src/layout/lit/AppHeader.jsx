import React from "react";
import { Menu, Search, Bell, ChevronDown } from "lucide-react";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <header className="lit-header-shell sticky top-0 z-30 h-20">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--lit-dashboard-card-border)] bg-white text-[var(--lit-dashboard-text)] hover:bg-slate-50 md:hidden dark:bg-transparent dark:hover:bg-white/5"
          >
            <Menu size={18} />
          </button>

          <div>
            <h1 className="text-lg font-semibold text-[var(--lit-dashboard-title)]">
              Dashboard
            </h1>
            <p className="text-sm text-[var(--lit-dashboard-muted)]">
              Logistics Intel overview
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-[var(--lit-dashboard-card-border)] bg-white px-3 py-2 min-w-[260px] dark:bg-transparent">
            <Search size={16} className="text-[var(--lit-dashboard-muted)]" />
            <input
              type="text"
              placeholder="Search companies, campaigns..."
              className="w-full bg-transparent text-sm text-[var(--lit-dashboard-text)] placeholder:text-[var(--lit-dashboard-muted)] outline-none"
            />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--lit-dashboard-card-border)] bg-white text-[var(--lit-dashboard-text)] hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5"
          >
            <Bell size={18} />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-xl border border-[var(--lit-dashboard-card-border)] bg-white px-3 py-2 hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lit-dashboard-brand-soft)] text-sm font-semibold text-[var(--lit-dashboard-brand)]">
              VR
            </div>

            <div className="hidden sm:block text-left">
              <div className="text-sm font-semibold text-[var(--lit-dashboard-title)]">
                Valesco
              </div>
              <div className="text-xs text-[var(--lit-dashboard-muted)]">
                Admin
              </div>
            </div>

            <ChevronDown
              size={16}
              className="hidden sm:block text-[var(--lit-dashboard-muted)]"
            />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
