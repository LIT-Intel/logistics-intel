import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  Settings,
  CreditCard,
  LogOut,
  X,
  LayoutDashboard,
  Briefcase,
  Megaphone,
  RadioTower,
  Blocks,
  Shield,
  Database,
  Bug,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

const BASE_MOBILE_SECTIONS = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { label: "Search", href: "/app/search", icon: Search },
      { label: "Command Center", href: "/app/command-center", icon: Briefcase },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      { label: "Lead Prospecting", href: "/app/prospecting", icon: RadioTower },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "RFP Studio", href: "/app/rfp", icon: Blocks },
      { label: "Widgets", href: "/app/widgets", icon: Blocks },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/app/settings", icon: Settings },
      { label: "Billing", href: "/app/billing", icon: CreditCard },
      { label: "Affiliate", href: "/app/affiliate", icon: Shield },
    ],
  },
];

const ADMIN_MOBILE_SECTION = {
  title: "Admin",
  items: [
    { label: "Admin Dashboard", href: "/app/admin", icon: Shield },
    { label: "CMS", href: "/app/cms", icon: Database },
    { label: "Debug Agent", href: "/app/agent", icon: Bug },
  ],
};

const PAGE_META = [
  { match: /^\/app\/dashboard/, title: "Dashboard", subtitle: "Trade Intelligence overview" },
  { match: /^\/app\/search/, title: "Search", subtitle: "Find companies and shipment intelligence" },
  { match: /^\/app\/command-center/, title: "Command Center", subtitle: "Your saved accounts and CRM workspace" },
  { match: /^\/app\/campaigns/, title: "Campaigns", subtitle: "Create and manage campaigns" },
  { match: /^\/app\/prospecting/, title: "Lead Prospecting", subtitle: "Target outreach and pipeline generation" },
  { match: /^\/app\/rfp/, title: "RFP Studio", subtitle: "Build and manage freight RFPs" },
  { match: /^\/app\/widgets/, title: "Widgets", subtitle: "Interactive logistics tools" },
  { match: /^\/app\/settings/, title: "Settings", subtitle: "Manage profile, preferences, and account" },
  { match: /^\/app\/billing/, title: "Billing", subtitle: "Plan, invoices, and payment methods" },
  { match: /^\/app\/affiliate/, title: "Affiliate", subtitle: "Partner performance and referrals" },
  { match: /^\/app\/admin/, title: "Admin", subtitle: "Administration and internal controls" },
  { match: /^\/app\/cms/, title: "CMS", subtitle: "Content and publishing controls" },
  { match: /^\/app\/agent/, title: "Debug Agent", subtitle: "Diagnostics and developer tools" },
];

function getInitials(nameOrEmail) {
  const value = (nameOrEmail || "").trim();
  if (!value) return "U";

  const parts = value.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

const AppHeader = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, fullName, role, isSuperAdmin, logout } = useAuth();

  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileRef = useRef(null);

  const mobileSections = isSuperAdmin
    ? [...BASE_MOBILE_SECTIONS, ADMIN_MOBILE_SECTION]
    : BASE_MOBILE_SECTIONS;

  const currentMeta = useMemo(
    () => PAGE_META.find((item) => item.match.test(location.pathname)) || PAGE_META[0],
    [location.pathname],
  );

  const displayName = fullName || user?.displayName || user?.email?.split("@")[0] || "User";
  const displayRole = role === "admin" ? "Admin" : role === "owner" ? "Owner" : "User";
  const displayInitials = getInitials(displayName || user?.email || "User");

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setMobileNavOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileOpen(false);
  }, [location.pathname, location.search]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Sign out failed", error);
    } finally {
      setProfileOpen(false);
      setMobileNavOpen(false);
      navigate("/login", { replace: true });
    }
  };

  const profileMenuItems = useMemo(
    () => [
      { label: "Settings", href: "/app/settings", icon: Settings },
      { label: "Billing", href: "/app/billing", icon: CreditCard },
    ],
    [],
  );

  return (
    <>
      <header className="relative z-40 h-20 border-b border-slate-200/80 bg-white px-4 md:px-6">
        <div className="flex h-full items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">{currentMeta.title}</h1>
            <p className="text-sm text-slate-500">{currentMeta.subtitle}</p>
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
                setMobileNavOpen(true);
              }}
              aria-label="Open mobile navigation"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700 md:hidden"
            >
              <Menu size={18} className="stroke-[2.2]" />
            </button>

            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle desktop sidebar"
              className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700 shadow-sm transition hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700 md:inline-flex xl:hidden"
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
                  {displayInitials}
                </div>

                <div className="hidden text-left sm:block">
                  <div className="text-sm font-semibold leading-tight text-slate-900">{displayName}</div>
                  <div className="text-xs font-medium text-slate-500">{displayRole}</div>
                </div>

                <ChevronDown
                  size={16}
                  className={`text-slate-500 transition ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{displayName}</div>
                    <div className="text-xs text-slate-500">{displayRole}</div>
                  </div>

                  <div className="p-2">
                    {profileMenuItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.label}
                          to={item.href}
                          onClick={() => setProfileOpen(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Icon size={16} />
                          {item.label}
                        </Link>
                      );
                    })}
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
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="Close mobile navigation overlay"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
          />

          <aside className="absolute inset-y-0 right-0 flex w-[88%] max-w-[360px] flex-col overflow-hidden border-l border-white/10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl">
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg">
                  LIT
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Trade Intelligence</div>
                  <div className="text-xs text-slate-300">Logistic Intel</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-semibold text-white">
                  {displayInitials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                  <div className="text-xs text-slate-300">{displayRole}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              {mobileSections.map((section) => (
                <div key={section.title} className="mb-6">
                  <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {section.title}
                  </div>
                  <nav className="space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.href ||
                        (item.href !== "/" && location.pathname.startsWith(item.href));

                      return (
                        <Link
                          key={item.label}
                          to={item.href}
                          onClick={() => setMobileNavOpen(false)}
                          className={[
                            "flex items-center gap-3 rounded-2xl px-3 py-3.5 text-sm transition-colors",
                            isActive
                              ? "bg-white/12 text-white font-semibold shadow-sm"
                              : "text-slate-200 hover:bg-white/8 hover:text-white",
                          ].join(" ")}
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 p-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Pro Intelligence</div>
                <div className="mt-1 text-xs leading-5 text-slate-300">
                  Track companies, campaigns, shipment activity, and pipeline in one branded workspace.
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default AppHeader;
