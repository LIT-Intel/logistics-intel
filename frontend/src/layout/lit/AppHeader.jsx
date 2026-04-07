import React from "react";
import { Menu, Search, Bell, ChevronDown } from "lucide-react";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <header className="h-20 border-b border-slate-200/80 bg-white px-4 md:px-6">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Trade Intelligence overview
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden min-w-[280px] items-center gap-2 rounded-2xl border border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/60 px-3 py-2 shadow-sm md:flex">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search companies, campaigns..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700"
          >
            <Bell size={18} className="stroke-[2.2]" />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-3 py-2 shadow-sm transition hover:border-blue-200 hover:from-white hover:to-blue-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-sm ring-2 ring-blue-100">
              VR
            </div>

            <div className="hidden text-left sm:block">
              <div className="text-sm font-semibold leading-tight text-slate-900">
                Valesco
              </div>
              <div className="text-xs font-medium text-slate-500">
                Admin
              </div>
            </div>

            <ChevronDown size={16} className="text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700 md:hidden"
          >
            <Menu size={18} className="stroke-[2.2]" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
