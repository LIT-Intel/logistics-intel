import React from "react";
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const AppSidebar = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <aside
      className={[
        "hidden md:flex md:flex-col border-r bg-white transition-all duration-300",
        sidebarOpen ? "w-[270px]" : "w-[88px]",
      ].join(" ")}
    >
      <div className="flex h-20 items-center justify-between px-5 border-b">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold shrink-0">
            LI
          </div>

          {sidebarOpen && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                Logistic Intel
              </div>
              <div className="truncate text-xs text-gray-500">
                Intelligence Platform
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className="flex-1 px-4 py-5">
        <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          {sidebarOpen ? "Navigation" : "Menu"}
        </div>

        <nav className="flex flex-col gap-2">
          <a
            href="/app/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-2 border"
          >
            <LayoutDashboard size={18} />
            {sidebarOpen && <span className="text-sm font-medium">Dashboard</span>}
          </a>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
