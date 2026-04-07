import React, { useEffect, useRef, useState } from "react";
import { Menu, Search, Bell, ChevronDown, Settings, CreditCard, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") { setProfileOpen(false); setMobileNavOpen(false); }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut?.();
    } catch (error) {
      console.error("Supabase sign out failed", error);
    }

    try {
      localStorage.removeItem("supabase.auth.token");
      sessionStorage.clear();
    } catch (error) {
      console.error("Sign out cleanup failed", error);
    }

    navigate("/login", { replace: true });
  };

  return (
    <header className="relative z-40 h-20 border-b border-slate-200/80 bg-white px-4 md:px-6">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Trade Intelligence overview</p>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden min-w-[280px] items-center gap-2 rounded-2xl border border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/60 px-3 py-2 shadow-sm md:flex">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search companies, campaigns..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700"
          >
            <Bell size={18} className="stroke-[2.2]" />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              setProfileOpen(false);
              setMobileNavOpen((prev) => !prev);
              setSidebarOpen(!sidebarOpen);
            }}
            aria-label="Toggle menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700 md:hidden"
          >
            <Menu size={18} className="stroke-[2.2]" />
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="inline-flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-3 py-2 shadow-sm transition hover:border-blue-200 hover:from-white hover:to-blue-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-sm ring-2 ring-blue-100">
                VR
              </div>

              <div className="hidden text-left sm:block">
                <div className="text-sm font-semibold leading-tight text-slate-900">Valesco</div>
                <div className="text-xs font-medium text-slate-500">Admin</div>
              </div>

              <ChevronDown
                size={16}
                className={`text-slate-500 transition ${profileOpen ? "rotate-180" : ""}`}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Valesco</div>
                  <div className="text-xs text-slate-500">Admin</div>
                </div>

                <div className="p-2">
                  <Link
                    to="/app/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Settings size={16} />
                    Settings
                  </Link>
                  <Link
                    to="/app/billing"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <CreditCard size={16} />
                    Billing
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {mobileNavOpen && (
        <div className="absolute inset-x-4 top-[calc(100%+12px)] z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl md:hidden">
          {[
            ["Dashboard", "/dashboard"],
            ["Search", "/search"],
            ["Command Center", "/command-center"],
            ["Campaigns", "/campaigns"],
            ["Settings", "/app/settings"],
            ["Billing", "/app/billing"],
          ].map(([label, href]) => (
            <Link
              key={href}
              to={href}
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-xl px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {label}
            </Link>
          ))}
        </div>
      )}

    </header>
  );
};

export default AppHeader;
