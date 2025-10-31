import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function MarketingHeader() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="Logistics Intel logo" className="h-8 w-8 rounded" loading="lazy" />
          <span className="font-semibold text-gray-900">Logistics Intel</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-700">
          <Link to="/search" className="hover:text-gray-900">Search</Link>
          <Link to="/command-center" className="hover:text-gray-900">Command Center</Link>
          <Link to="/rfp" className="hover:text-gray-900">RFPs</Link>
          <button type="button" className="hover:text-gray-900" onClick={() => navigate("/app/dashboard")}>Dashboard</button>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-gray-700 hover:text-gray-900">Sign in</Link>
          <a href="#demo" className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800">Get a demo</a>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:text-gray-900 focus:outline-none"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4 text-sm text-gray-700">
          <nav className="flex flex-col gap-3">
            <Link to="/search" onClick={() => setOpen(false)}>Search</Link>
            <Link to="/command-center" onClick={() => setOpen(false)}>Command Center</Link>
            <Link to="/rfp" onClick={() => setOpen(false)}>RFPs</Link>
            <button
              type="button"
              className="text-left"
              onClick={() => {
                setOpen(false);
                navigate("/app/dashboard");
              }}
            >
              Dashboard
            </button>
            <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
            <a href="#demo" className="inline-flex justify-center rounded-md bg-gray-900 px-3 py-2 text-white" onClick={() => setOpen(false)}>
              Get a demo
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
