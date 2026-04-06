import React from "react";
import { Menu, Search, Bell } from "lucide-react";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <header className="h-20 border-b bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500">Header bell test</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 rounded-xl border px-3 py-2 min-w-[260px]">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search companies, campaigns..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
        >
          <Bell size={18} />
        </button>

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
