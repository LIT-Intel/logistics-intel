import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PublicHeader() {
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const gotoLogin = () => {
    // hard switch to our login route (no Base44 redirects)
    nav("/login");
  };

  return (
    <header className="w-full sticky top-0 z-30 bg-white/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a2395cf9b_logisticsintellogo1200x1200px2.png"
              alt="LIT"
              className="w-8 h-8"
            />
            <span className="font-semibold tracking-tight">LIT — Trade Intelligence</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/platform" className="hover:text-black text-gray-600">Platform</Link>
          <Link to="/solutions" className="hover:text-black text-gray-600">Solutions</Link>
          <Link to="/pricing" className="hover:text-black text-gray-600">Pricing</Link>
          <Link to="/resources" className="hover:text-black text-gray-600">Resources</Link>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" onClick={() => nav("/contact")}>Contact</Button>
          <Button onClick={gotoLogin}>Sign in</Button>
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
            <Link to="/platform" className="block py-1" onClick={() => setMobileOpen(false)}>Platform</Link>
            <Link to="/solutions" className="block py-1" onClick={() => setMobileOpen(false)}>Solutions</Link>
            <Link to="/pricing" className="block py-1" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link to="/resources" className="block py-1" onClick={() => setMobileOpen(false)}>Resources</Link>
            <Button className="w-full" onClick={() => { setMobileOpen(false); gotoLogin(); }}>
              Sign in
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
