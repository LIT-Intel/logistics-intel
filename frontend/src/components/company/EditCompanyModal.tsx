/**
 * EditCompanyModal — persist user-driven corrections back to
 * `lit_companies` via the `update-company` edge fn.
 *
 * Enrichment Phase 2. Surfaces in the company-profile header. Until this
 * existed, edited company name/domain values were local React state only
 * and reverted on the next page load, so broken records (NULL domain on
 * Razor USA, Werma USA, Rivian, etc.) could never be repaired and could
 * never enrich.
 */
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { updateCompany } from "@/lib/api";

type Initial = {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  headcount?: string | number | null;
};

type Props = {
  companyId: string;
  initial: Initial;
  onClose: () => void;
  /** Fires when the save succeeds. The page should refetch the company. */
  onSaved: (updated: {
    name?: string | null;
    domain?: string | null;
    website?: string | null;
    industry?: string | null;
    headcount?: string | null;
  }) => void;
};

export default function EditCompanyModal({
  companyId,
  initial,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState<string>(initial.name ?? "");
  const [domain, setDomain] = useState<string>(initial.domain ?? "");
  const [website, setWebsite] = useState<string>(initial.website ?? "");
  const [industry, setIndustry] = useState<string>(initial.industry ?? "");
  const [headcount, setHeadcount] = useState<string>(
    initial.headcount == null ? "" : String(initial.headcount),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    // Build a delta — only forward fields that actually changed so the
    // server never gets a stale empty value that overwrites valid data.
    const payload: Parameters<typeof updateCompany>[0] = { companyId };
    const initName = (initial.name ?? "").trim();
    const initDomain = (initial.domain ?? "").trim();
    const initWebsite = (initial.website ?? "").trim();
    const initIndustry = (initial.industry ?? "").trim();
    const initHeadcount = String(initial.headcount ?? "").trim();
    if (name.trim() !== initName) payload.name = name.trim();
    if (domain.trim() !== initDomain) payload.domain = domain.trim();
    if (website.trim() !== initWebsite) payload.website = website.trim();
    if (industry.trim() !== initIndustry) payload.industry = industry.trim();
    if (headcount.trim() !== initHeadcount) payload.headcount = headcount.trim();

    // Nothing to save.
    if (Object.keys(payload).length === 1) {
      setError("No changes to save.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const r = await updateCompany(payload);
      if (!r.ok) {
        setError(r.error || "Save failed.");
        return;
      }
      onSaved({
        name: r.company?.name ?? null,
        domain: r.company?.domain ?? null,
        website: r.company?.website ?? null,
        industry: r.company?.industry ?? null,
        headcount: r.company?.headcount ?? null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-company-title"
    >
      <form
        onSubmit={handleSave}
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2
            id="edit-company-title"
            className="font-display text-[14px] font-semibold text-slate-900"
          >
            Edit company profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <Field label="Company name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Logistics, Inc."
              maxLength={200}
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>
          <Field
            label="Domain"
            hint="Just the hostname — example.com, not https://example.com."
          >
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>
          <Field label="Website">
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>
          <Field label="Industry">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Consumer Goods"
              maxLength={100}
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>
          <Field
            label="Headcount"
            hint="Free-form, e.g. 1-10, 50, 500-1000."
          >
            <input
              type="text"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              placeholder="100-250"
              maxLength={50}
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </Field>
          {error && (
            <div className="font-body rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="font-display rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-display block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
      {hint && (
        <p className="font-body mt-0.5 text-[10px] text-slate-400">{hint}</p>
      )}
    </label>
  );
}
