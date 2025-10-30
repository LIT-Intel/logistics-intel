"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Logistics Intel logo" width={32} height={32} className="h-8 w-8 rounded" priority />
          <span className="font-semibold text-gray-900">Logistics Intel</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-700">
          <Link href="/search" className="hover:text-gray-900">Search</Link>
          <Link href="/command-center" className="hover:text-gray-900">Command Center</Link>
          <Link href="/rfp" className="hover:text-gray-900">RFPs</Link>
          <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-gray-700 hover:text-gray-900">Sign in</Link>
          <Link href="#demo" className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800">Get a demo</Link>
        </div>
      </div>
    </header>
  );
}
