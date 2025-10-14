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
    <header className="w-full sticky top-0 z-30 bg-[var(--lit-bg)]/85 backdrop-blur border-b border-[var(--lit-border)] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/favicon.svg"
              alt="LIT"
              className="w-8 h-8"
            />
            <span className="font-semibold tracking-tight">LIT — Trade Intelligence</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/platform" className="text-white/70 hover:text-white">Platform</Link>
          <Link to="/solutions" className="text-white/70 hover:text-white">Solutions</Link>
          <Link to="/pricing" className="text-white/70 hover:text-white">Pricing</Link>
          <Link to="/resources" className="text-white/70 hover:text-white">Resources</Link>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" onClick={() => nav("/contact")} className="btn-ghost">Contact</Button>
          <button onClick={gotoLogin} className="btn-brand">Sign in</button>
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
        <div className="md:hidden border-t bg-[var(--lit-bg)] text-white">
          <div className="px-4 py-3 space-y-2">
            <Link to="/platform" className="block py-1" onClick={() => setMobileOpen(false)}>Platform</Link>
            <Link to="/solutions" className="block py-1" onClick={() => setMobileOpen(false)}>Solutions</Link>
            <Link to="/pricing" className="block py-1" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link to="/resources" className="block py-1" onClick={() => setMobileOpen(false)}>Resources</Link>
            <button className="w-full btn-brand" onClick={() => { setMobileOpen(false); gotoLogin(); }}>
              Sign in
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
