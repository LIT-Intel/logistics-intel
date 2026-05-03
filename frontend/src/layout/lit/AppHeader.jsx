import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Menu,
  Search,
  ChevronDown,
  Settings,
  CreditCard,
  LogOut,
  X,
  LayoutDashboard,
  Briefcase,
  Megaphone,
  Award,
  ExternalLink,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { usePartnerStatus } from "@/lib/affiliate";
import { LitAppIcon, PulseIcon } from "@/components/shared/AppIcons";

const BASE_MOBILE_SECTIONS = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { label: "Search", href: "/app/search", icon: Search },
      // Command Center surfaces a contextual submenu on mobile when the
      // user is already navigating inside it — same pattern as the
      // desktop sidebar so the two surfaces don't drift on feature parity.
      {
        label: "Command Center",
        href: "/app/command-center",
        icon: Briefcase,
        children: [
          { label: "Saved Companies", href: "/app/command-center", icon: Briefcase },
          { label: "Contacts", href: "/app/contacts", icon: Users },
        ],
      },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      // PulseIcon + the "Pulse" label to match the desktop sidebar exactly.
      { label: "Pulse", href: "/app/prospecting", icon: PulseIcon },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/app/settings", icon: Settings },
      { label: "Billing", href: "/app/billing", icon: CreditCard },
      // Award icon (matches the partner pill in the dropdown). Shield was
      // overloaded — also used for Admin Dashboard.
      { label: "Affiliate", href: "/app/affiliate", icon: Award },
    ],
  },
];

const ADMIN_MOBILE_SECTION = {
  title: "Admin",
  items: [
    { label: "Admin Dashboard", href: "/app/admin", icon: Settings },
  ],
};

const PAGE_META = [
  // Company profile routes — Company.jsx renders into AppLayout via the
  // `/company/:id` and `/app/companies/:id` routes. Keep these checks above
  // the broader `/app/companies` index match so the detail-page header text
  // wins over the listing-page text.
  { match: /^\/company\/[^/]+/, title: "Company Intelligence", subtitle: "Shipment profile and trade activity" },
  { match: /^\/app\/companies\/[^/]+/, title: "Company Intelligence", subtitle: "Shipment profile and trade activity" },
  { match: /^\/app\/companies\/?$/, title: "Companies", subtitle: "Saved accounts and trade intelligence" },
  { match: /^\/app\/dashboard/, title: "Dashboard", subtitle: "Trade Intelligence overview" },
  { match: /^\/app\/search/, title: "Search", subtitle: "Find companies and shipment intelligence" },
  { match: /^\/app\/command-center/, title: "Command Center", subtitle: "Your saved accounts and CRM workspace" },
  { match: /^\/app\/campaigns/, title: "Campaigns", subtitle: "Create and manage campaigns" },
  { match: /^\/app\/prospecting/, title: "Pulse", subtitle: "AI lead intelligence" },
  { match: /^\/app\/settings/, title: "Settings", subtitle: "Manage profile, preferences, and account" },
  { match: /^\/app\/billing/, title: "Billing", subtitle: "Plan, invoices, and payment methods" },
  { match: /^\/app\/affiliate/, title: "Affiliate", subtitle: "Partner performance and referrals" },
  { match: /^\/app\/admin/, title: "Admin", subtitle: "Administration and internal controls" },
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
  const partner = usePartnerStatus(user?.id);

  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileRef = useRef(null);

  // Mobile nav adapts the Account section to the partner state so an
  // affiliate sees their dashboard while a non-partner sees the apply CTA.
  const mobileSections = useMemo(() => {
    const sections = BASE_MOBILE_SECTIONS.map((section) => {
      if (section.title !== "Account") return section;
      const items = section.items.map((item) => {
        if (item.label !== "Affiliate") return item;
        return partner.isPartner
          ? { label: "Affiliate dashboard", href: "/app/affiliate", icon: Award }
          : { label: "Become a partner", href: "/partners/apply", icon: Award };
      });
      return { ...section, items };
    });
    return isSuperAdmin ? [...sections, ADMIN_MOBILE_SECTION] : sections;
  }, [isSuperAdmin, partner.isPartner]);

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

  const profileMenuItems = useMemo(() => {
    const items = [{ label: "Settings", href: "/app/settings", icon: Settings }];
    // Active partners see Affiliate ahead of Billing. Non-partners and
    // 'invited'-state users still see Billing for their subscriber plan.
    if (partner.isPartner) {
      items.push({ label: "Affiliate dashboard", href: "/app/affiliate", icon: Award });
    }
    items.push({ label: "Billing", href: "/app/billing", icon: CreditCard });
    return items;
  }, [partner.isPartner]);

  // Partner pill that replaces the noisy plan label in the dropdown header
  // when the user has an active partner record. Non-partners keep their
  // subscriber role label intact.
  const partnerBadge =
    partner.isPartner && partner.status === "active"
      ? { tone: "success", label: "Partner · active" }
      : partner.isPartner && partner.status === "invited"
        ? { tone: "warn", label: "Partner · finish onboarding" }
        : partner.isPartner && (partner.status === "suspended" || partner.status === "deactivated")
          ? { tone: "danger", label: `Partner · ${partner.status}` }
          : null;

  return (
    <>
      <header className="relative z-40 h-20 border-b border-slate-200/80 bg-white px-4 md:px-6">
        <div className="flex h-full items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">{currentMeta.title}</h1>
            <p className="text-sm text-slate-500">{currentMeta.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Header search — neutralized white pill with a single
                slate ring so it stops competing with the sidebar's
                cyan accent. Same idea as the Profile-page chrome. */}
            <div className="hidden min-w-[280px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search companies, campaigns..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Notifications bell intentionally hidden — the green dot
                was promising a feature that doesn't exist. Re-enable
                here once notifications ship. */}

            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                setMobileNavOpen(true);
              }}
              aria-label="Open mobile navigation"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 md:hidden"
            >
              <Menu size={18} className="stroke-[2.2]" />
            </button>

            {/* The desktop sidebar collapse toggle now lives as a
                floating boundary button on the sidebar itself — single,
                obvious, persistent. The redundant in-header hamburger
                was removed. */}

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-sm">
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
                <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{displayName}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {user?.email || displayRole}
                    </div>
                    {partnerBadge ? (
                      <span
                        className={[
                          "mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          partnerBadge.tone === "success"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : partnerBadge.tone === "warn"
                              ? "border border-amber-200 bg-amber-50 text-amber-700"
                              : "border border-rose-200 bg-rose-50 text-rose-700",
                        ].join(" ")}
                      >
                        <Award size={11} />
                        {partnerBadge.label}
                      </span>
                    ) : null}
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
                    {!partner.loading && !partner.isPartner ? (
                      <Link
                        to="/partners/apply"
                        onClick={() => setProfileOpen(false)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                      >
                        <Award size={16} />
                        Become a partner
                        <ExternalLink size={11} className="ml-auto opacity-60" />
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-slate-100 px-3 py-2 pt-3 text-sm text-rose-600 hover:bg-rose-50"
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

          <aside
            className="absolute inset-y-0 right-0 flex w-[88%] max-w-[360px] flex-col overflow-hidden border-l border-white/10 text-white shadow-2xl"
            // Same Pulse Coach gradient as the desktop sidebar, Profile-page
            // quota cards, Settings Account Snapshot, and Billing modals.
            // Single canonical brand surface across every dark-chrome
            // touchpoint in the app.
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 1px 0 0 rgba(0,240,255,0.18)",
            }}
          >
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
              <div className="flex items-center gap-3">
                {/* Match the desktop sidebar logo treatment — real LitAppIcon
                    in cyan #00F0FF inside a slate-950 box. The previous
                    "LIT" text in indigo-violet gradient diverged from
                    every other branded surface in the app. */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 shadow-lg ring-1 ring-white/10">
                  <LitAppIcon className="h-7 w-7" style={{ color: "#00F0FF" }} />
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
                  <div className="truncate text-xs text-slate-300">{user?.email || displayRole}</div>
                  {partnerBadge ? (
                    <span
                      className={[
                        "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        partnerBadge.tone === "success"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : partnerBadge.tone === "warn"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-rose-500/15 text-rose-300",
                      ].join(" ")}
                    >
                      <Award size={10} />
                      {partnerBadge.label}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              {mobileSections.map((section) => (
                <div key={section.title} className="mb-6">
                  <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {section.title}
                  </div>
                  <nav className="space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.href ||
                        (item.href !== "/" && location.pathname.startsWith(item.href));

                      // Pulse uses cyan #00F0FF inline so the
                      // mobile Pulse row picks up the same accent the
                      // desktop sidebar applies to its Pulse icon.
                      const isPulse = item.label === "Pulse";
                      // Show the contextual submenu (e.g. Command Center
                      // → Saved Companies / Contacts) when the user is
                      // already navigating inside it. Mirrors the desktop
                      // sidebar exactly so mobile + desktop don't drift.
                      const inItemContext =
                        item.children &&
                        (location.pathname === item.href ||
                          location.pathname.startsWith(item.href) ||
                          item.children.some((c) =>
                            location.pathname.startsWith(c.href),
                          ));
                      return (
                        <div key={item.label}>
                          <Link
                            to={item.href}
                            onClick={() => setMobileNavOpen(false)}
                            className={[
                              // Match the desktop sidebar's exact active state
                              // (bg-white/10) so the two surfaces don't drift.
                              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                              isActive
                                ? "bg-white/10 text-white font-semibold"
                                : "text-slate-200 hover:bg-white/5 hover:text-white",
                            ].join(" ")}
                          >
                            <Icon
                              size={18}
                              className="shrink-0"
                              style={
                                isPulse
                                  ? { color: "#00F0FF", opacity: isActive ? 1 : 0.85 }
                                  : undefined
                              }
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                          {inItemContext && item.children?.length > 0 && (
                            <div className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
                              {item.children.map((child) => {
                                const ChildIcon = child.icon;
                                const childActive =
                                  location.pathname === child.href ||
                                  (child.href !== "/app/command-center" &&
                                    location.pathname.startsWith(child.href));
                                return (
                                  <Link
                                    key={child.label}
                                    to={child.href}
                                    onClick={() => setMobileNavOpen(false)}
                                    className={[
                                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                                      childActive
                                        ? "bg-white/10 text-white font-semibold"
                                        : "text-slate-400 hover:bg-white/5 hover:text-white",
                                    ].join(" ")}
                                  >
                                    {ChildIcon && (
                                      <ChildIcon size={14} className="shrink-0" />
                                    )}
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            {/* Same Pulse footer card as the desktop sidebar so the
                two chrome surfaces share the brand anchor. */}
            <div className="border-t border-white/10 p-4">
              <div
                className="rounded-2xl border border-white/10 px-4 py-3"
                style={{
                  background: "rgba(0,240,255,0.05)",
                  boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 ring-1 ring-white/10">
                    <PulseIcon className="h-[18px] w-[18px]" style={{ color: "#00F0FF" }} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">Pulse</div>
                    <div className="truncate text-xs text-slate-300">
                      AI lead intelligence
                    </div>
                  </div>
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
