/**
 * Phase 1 — Non-UUID / unresolvable-input guard for the Company Profile route.
 *
 * Wraps a child render-prop so a clearly malformed identifier (empty string,
 * leading/trailing whitespace, query fragments, etc.) renders a clean
 * "Company not found" panel instead of letting the page mount with broken
 * data. Slug-style inputs (e.g. "company/sony-electronics") are accepted —
 * the resolver handles UUID and slug equally.
 *
 * Conservative: only blocks input that is *clearly* invalid. Slug-shaped
 * inputs that fail to resolve still render the children so existing pages
 * keep their current empty-state behavior. Phase 2 can tighten this once
 * the V2 container is canonical.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";

type CompanyProfileGuardProps = {
  rawId: string | null | undefined;
  children: (resolvedId: string) => ReactNode;
};

function isClearlyInvalid(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 256) return true;
  if (/^[?#&=]/.test(trimmed)) return true;
  return false;
}

export default function CompanyProfileGuard({ rawId, children }: CompanyProfileGuardProps) {
  if (isClearlyInvalid(rawId)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Company not found</h2>
          <p className="text-sm text-slate-600 mb-6">
            The company identifier in this URL is missing or malformed. Open a
            company from search or your Command Center to view its profile.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/app/command-center"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Command Center
            </Link>
            <Link
              to="/app/search"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Search
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(rawId!.trim())}</>;
}
