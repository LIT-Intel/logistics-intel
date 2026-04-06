import React from "react";
import { Menu } from "lucide-react";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  return (
    <header className="h-20 border-b bg-white px-6 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">Header icon test</p>
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
      >
        <Menu size={18} />
      </button>
    </header>
  );
};

export default AppHeader;
