/**
 * AdminScopeToggle — header chip rendered only for platform_admins.
 *
 * Default state: "My Org" chip. Toggled state: amber-tinted "All Orgs
 * (Admin)" chip so scope state is unmistakable in screenshots/demos.
 * Per CLAUDE.md, this is a UX hint — backend RLS remains permissive
 * for platform_admins. The frontend choice is what scopes the query.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Shield, Building2 } from "lucide-react";
import { useAdminScope } from "@/hooks/useAdminScope";

interface Props {
  currentOrgName?: string | null;
}

export function AdminScopeToggle({ currentOrgName }: Props) {
  const { scope, setScope, isPlatformAdmin } = useAdminScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!isPlatformAdmin) return null;

  const label = scope === "all"
    ? "All Orgs (Admin)"
    : (currentOrgName ?? "My Org");
  const Icon = scope === "all" ? Shield : Building2;
  const chipClass = scope === "all"
    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-medium shadow-sm transition ${chipClass}`}
      >
        <Icon size={14} />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Viewing as
          </div>
          <button
            type="button"
            onClick={() => { setScope("org"); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 ${scope === "org" ? "bg-slate-50 font-semibold" : ""}`}
          >
            <Building2 size={14} className="text-slate-500" />
            {currentOrgName ?? "My Org"}
          </button>
          <button
            type="button"
            onClick={() => { setScope("all"); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-amber-50 ${scope === "all" ? "bg-amber-50 font-semibold text-amber-800" : ""}`}
          >
            <Shield size={14} className="text-amber-600" />
            All Orgs (Platform Admin)
          </button>
        </div>
      )}
    </div>
  );
}
