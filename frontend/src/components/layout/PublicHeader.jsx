import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PublicHeader() {
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const gotoLogin = () => {
    // hard switch to our login route
    nav("/login");
  };

  return (
    <header className="w-full sticky top-0 z-30 bg-white/70 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3C4EF5] to-[#AB34F5]" />
            <span className="font-semibold tracking-tight">LIT — Trade Intelligence</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link to="#intelligence" className="hover:text-black text-gray-600">Intelligence</Link>
          <Link to="#trade-data" className="hover:text-black text-gray-600">Trade Data</Link>
          <Link to="#pricing" className="hover:text-black text-gray-600">Pricing</Link>
          <Link to="#resources" className="hover:text-black text-gray-600">Resources</Link>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button className="text-sm text-slate-700 hover:underline" onClick={gotoLogin}>Log In</button>
          <a href="/request-demo" className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3C4EF5] to-[#AB34F5] text-white text-sm font-semibold hover:brightness-110">Request Demo</a>
        </div>

        <button
          className="md:hidden inline-flex items-center px-3 py-2 rounded border text-sm"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle menu"
        >
          Menu
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t bg-white">
          <div className="px-4 py-3 space-y-2">
            <a href="#intelligence" className="block py-1" onClick={() => setMobileOpen(false)}>Intelligence</a>
            <a href="#trade-data" className="block py-1" onClick={() => setMobileOpen(false)}>Trade Data</a>
            <a href="#pricing" className="block py-1" onClick={() => setMobileOpen(false)}>Pricing</a>
            <a href="#resources" className="block py-1" onClick={() => setMobileOpen(false)}>Resources</a>
            <a href="/request-demo" className="block py-2 text-center rounded-xl bg-gradient-to-r from-[#3C4EF5] to-[#AB34F5] text-white text-sm font-semibold" onClick={() => setMobileOpen(false)}>Request Demo</a>
            <button className="w-full text-sm text-slate-700 underline" onClick={() => { setMobileOpen(false); gotoLogin(); }}>Log In</button>
          </div>
        </div>
      )}
    </header>
  );
}
