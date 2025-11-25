import React from "react";
import { ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { SettingsSectionId } from "./SettingsSections";
import { Pill } from "./SettingsPrimitives";
import { cn } from "@/lib/utils";

type SettingsSidebarProps = {
  sections: SettingsSectionId[];
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
};

export default function SettingsSidebar({
  sections,
  activeSection,
  onSelectSection,
}: SettingsSidebarProps) {
  return (
    <aside className="w-full shrink-0 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02] lg:w-72 xl:w-80">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
          LIT
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-600">
            Logistics Intel
          </p>
          <p className="text-base font-semibold text-slate-900">
            Workspace settings
          </p>
        </div>
      </div>

      <nav className="mt-6 flex flex-col gap-2">
        {sections.map((section) => {
          const isActive = activeSection === section;
          return (
            <button
              key={section}
              type="button"
              className={cn(
                "flex items-center justify-between rounded-2xl border px-4 py-2.5 text-left text-sm font-semibold transition",
                isActive
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15"
                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white",
              )}
              onClick={() => onSelectSection(section)}
            >
              <span>{section}</span>
              {section === "Profile" ? (
                <Pill label="Default" tone={isActive ? "warning" : "default"} />
              ) : (
                <ArrowUpRight
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-white" : "text-slate-400",
                  )}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 rounded-2xl bg-slate-900 p-4 text-white shadow-md shadow-slate-900/30">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Enterprise controls
        </div>
        <p className="mt-2 text-sm text-white/80">
          Need a different setup? Enterprise workspaces can customize roles,
          SSO, and data regions.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
        >
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Talk to sales
        </button>
      </div>
    </aside>
  );
}
