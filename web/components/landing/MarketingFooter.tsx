import React from "react";

export default function MarketingFooter() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-gray-600 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>© {new Date().getFullYear()} Logistics Intel. All rights reserved.</div>
        <nav className="flex items-center gap-4">
          <a className="hover:text-gray-900" href="#">Privacy</a>
          <a className="hover:text-gray-900" href="#">Terms</a>
          <a className="hover:text-gray-900" href="#">Security</a>
        </nav>
      </div>
    </footer>
  );
}
