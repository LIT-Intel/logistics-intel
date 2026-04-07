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
  <aside className="w-full lg:w-72">
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-600">Settings sidebar test</div>
    </div>
  </aside>
);
}
