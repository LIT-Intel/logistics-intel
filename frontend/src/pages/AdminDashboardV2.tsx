// AdminDashboardV2 — admin dashboard rebuild per the design handoff
// package (docs/admin-dashboard-handoff/).
//
// Mounted at /app/admin via the existing RequireAdmin route guard
// (client-side gate). Server-side enforcement comes from the
// is_admin_caller() RLS helper on every panel's data source — if a
// non-admin somehow reaches this URL their queries return empty.
//
// Phase 3A.3 scope: shell + section nav + 7 panels with empty states.
// Phase 3B: real-time refresh + sparklines.
// Phase 3C: write actions (suspend, pause, retry, force-stop) with
// confirmation modals + CSV export endpoint + feature-flag matrix.

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Cpu,
  DatabaseZap,
  DollarSign,
  FlaskConical,
  LayoutDashboard,
  RefreshCcw,
  ScrollText,
  Send,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { APill, AInput, aBtnGhost, fontBody, fontDisplay } from "@/features/admin/AdminShared";
import {
  AdminOverview,
  RevenueKPIs,
  SubscribersTable,
  SystemHealth,
  PlanDistribution,
  QueueMonitor,
  ErrorLog,
  UserManagement,
  CampaignMonitoring,
  IngestionStatus,
  FeatureFlags,
  AuditLog,
} from "@/features/admin/AdminPanels";

type SectionId =
  | "overview"
  | "revenue"
  | "users"
  | "campaigns"
  | "queue"
  | "ingestion"
  | "flags"
  | "audit";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Monitor" | "Manage" | "Controls";
  superOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Monitor" },
  { id: "revenue", label: "Revenue", icon: DollarSign, group: "Monitor" },
  { id: "users", label: "Users", icon: Users, group: "Manage" },
  { id: "campaigns", label: "Campaigns", icon: Send, group: "Manage" },
  { id: "queue", label: "Queue & Errors", icon: Cpu, group: "Monitor" },
  { id: "ingestion", label: "Data & Ingest", icon: DatabaseZap, group: "Monitor" },
  { id: "flags", label: "Feature Flags", icon: FlaskConical, group: "Controls", superOnly: true },
  { id: "audit", label: "Audit Trail", icon: ScrollText, group: "Controls" },
];

const SECTION_STORAGE_KEY = "lit_admin_section";

export default function AdminDashboardV2() {
  const { user, isSuperAdmin } = useAuth();
  const role: "superadmin" | "admin" = isSuperAdmin ? "superadmin" : "admin";

  const sections = SECTIONS.filter((s) => (s.superOnly ? role === "superadmin" : true));
  const groups: Array<{ group: string; items: SectionDef[] }> = useMemo(() => {
    const map = new Map<string, SectionDef[]>();
    for (const s of sections) {
      const list = map.get(s.group) || [];
      list.push(s);
      map.set(s.group, list);
    }
    return [...map.entries()].map(([group, items]) => ({ group, items }));
  }, [sections]);

  const [section, setSection] = useState<SectionId>(() => {
    try {
      const saved = (window.localStorage.getItem(SECTION_STORAGE_KEY) as SectionId) || "overview";
      if (sections.find((s) => s.id === saved)) return saved;
    } catch {
      // ignore
    }
    return "overview";
  });
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try { window.localStorage.setItem(SECTION_STORAGE_KEY, section); } catch { /* ignore */ }
  }, [section]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6FB]">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1
              className="text-[22px] font-bold tracking-[-0.02em] text-slate-950"
              style={{ fontFamily: fontDisplay }}
            >
              Admin Dashboard
            </h1>
            <APill tone={role === "superadmin" ? "violet" : "blue"} icon={role === "superadmin" ? Crown : Shield}>
              {role}
            </APill>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-500" style={{ fontFamily: fontBody }}>
            Internal ops console · every action is written to lit_audit_log
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <AInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users, campaigns, log entries…"
            className="w-72"
          />
          <APill tone="green" dot>env · prod</APill>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className={aBtnGhost}
          >
            <RefreshCcw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Section nav */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white/60 md:flex">
          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
            {groups.map(({ group, items }) => (
              <div key={group}>
                <div
                  className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"
                  style={{ fontFamily: fontDisplay }}
                >
                  {group}
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map((it) => {
                    const active = section === it.id;
                    const Icon = it.icon;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setSection(it.id)}
                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                          active
                            ? "bg-blue-50 font-semibold text-blue-700"
                            : "font-medium text-slate-600 hover:bg-slate-100"
                        }`}
                        style={{ fontFamily: fontDisplay }}
                      >
                        <Icon className={`h-3.5 w-3.5 ${active ? "text-blue-500" : "text-slate-400"}`} />
                        <span>{it.label}</span>
                        {it.superOnly ? <ShieldAlert className="ml-auto h-3 w-3 text-violet-500" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-200 p-3">
            <div
              className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"
              style={{ fontFamily: fontDisplay }}
            >
              Signed in as
            </div>
            <div className="truncate text-[12px] font-semibold text-slate-900" style={{ fontFamily: fontDisplay }}>
              {user?.email || "unknown"}
            </div>
          </div>
        </aside>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto max-w-6xl">
            <SectionBody key={refreshKey} section={section} />
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionBody({ section }: { section: SectionId }) {
  if (section === "overview") {
    return (
      <div className="flex flex-col gap-4">
        <RevenueKPIs />
        <AdminOverview />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr,1fr]">
          <SystemHealth />
          <PlanDistribution />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QueueMonitor />
          <ErrorLog />
        </div>
        <CampaignMonitoring />
        <AuditLog />
      </div>
    );
  }
  if (section === "revenue") {
    return (
      <div className="flex flex-col gap-4">
        <RevenueKPIs />
        <SubscribersTable />
      </div>
    );
  }
  if (section === "users") return <UserManagement />;
  if (section === "campaigns") return <CampaignMonitoring />;
  if (section === "queue") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueueMonitor />
        <ErrorLog />
      </div>
    );
  }
  if (section === "ingestion") return <IngestionStatus />;
  if (section === "flags") return <FeatureFlags />;
  if (section === "audit") return <AuditLog />;
  return null;
}
