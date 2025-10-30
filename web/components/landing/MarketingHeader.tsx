"use client";
import React from "react";

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-gray-900" aria-hidden />
          <span className="font-semibold text-gray-900">Logistics Intel</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-700">
          <a href="/search" className="hover:text-gray-900">Search</a>
          <a href="/command-center" className="hover:text-gray-900">Command Center</a>
          <a href="/rfp" className="hover:text-gray-900">RFPs</a>
          <a href="/dashboard" className="hover:text-gray-900">Dashboard</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-sm text-gray-700 hover:text-gray-900">Sign in</a>
          <a href="#demo" className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800">Get a demo</a>
        </div>
      </div>
    </header>
  );
}
