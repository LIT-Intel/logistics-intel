import React from "react";
import { Menu, Search, Bell, ChevronDown } from "lucide-react";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <header className="h-20 border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex h-full items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Trade Intelligence overview</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 md:flex">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search companies, campaigns..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white"
          >
            <Bell size={18} />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-800">
              VR
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-semibold text-slate-900">Valesco</div>
              <div className="text-xs text-slate-500">Admin</div>
            </div>
            <ChevronDown size={16} className="text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white md:hidden"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
