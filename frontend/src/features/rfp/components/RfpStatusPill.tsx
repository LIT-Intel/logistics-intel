import type { RfpStatus } from "@/api/rfp";

const META: Record<RfpStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  intake: { label: "Intake", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  pricing: { label: "Pricing", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  review: { label: "Review", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  submitted: { label: "Submitted", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  won: { label: "Won", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  lost: { label: "Lost", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  archived: { label: "Archived", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
};

export function RfpStatusPill({ status }: { status: RfpStatus }) {
  const meta = META[status] ?? META.draft;
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10.5px] font-bold ring-1 ring-inset ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
