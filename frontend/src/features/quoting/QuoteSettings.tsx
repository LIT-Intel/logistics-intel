/**
 * QuoteSettings — the `/app/quoting/settings` page.
 *
 * Org-level quote branding + defaults editor. On mount it loads the saved
 * settings via `quoting.settingsGet()` and seeds the form; any empty field
 * falls back to org-derived starting values (org_name → company_name,
 * org_logo_url → logo_url) so a first-time user immediately sees their
 * workspace name + logo pre-filled (still editable + savable).
 *
 * Logo / signature uploads are resized client-side via a canvas to ≤360px on
 * the long edge and exported as a PNG (or JPEG when the PNG is large) data-URI
 * — that keeps every image well under the server's 700k-char cap.
 *
 * Saving is admin-only on the server: a non-admin save returns a FORBIDDEN
 * EdgeFunctionError, which we surface inline and use to disable Save.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Loader2, CheckCircle2, ImageUp, X, Lock } from "lucide-react";

import { quoting, type QuoteSettings as Settings } from "@/api/quoting";
import { EdgeFunctionError } from "@/api/_client";
import { useAuth } from "@/auth/AuthProvider";
import LitSectionCard from "@/components/ui/LitSectionCard";

const PAYMENT_TERMS_OPTIONS = [
  "Net 30",
  "Net 15",
  "Net 45",
  "Due on receipt",
  "50% deposit, balance on delivery",
];

const CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "MXN"];

const input =
  "h-10 w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 disabled:cursor-not-allowed";
const textarea =
  "w-full rounded-[9px] border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Resize an image File to ≤`maxEdge` on its long edge and return a data-URI.
 * Tries PNG first; if that comes back large (data-URIs balloon for photos),
 * re-exports as JPEG at q0.82. Either way the result stays well under the
 * server's 700k-char limit thanks to the dimension cap.
 */
function resizeImageToDataUrl(file: File, maxEdge = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a valid image."));
      img.onload = () => {
        const { width, height } = img;
        if (!width || !height) {
          reject(new Error("That image has no dimensions."));
          return;
        }
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas isn't available in this browser."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL("image/png");
        // PNG of a photographic image can still be large — fall back to JPEG.
        if (out.length > 600_000) {
          out = canvas.toDataURL("image/jpeg", 0.82);
        }
        resolve(out);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function QuoteSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Server-confirmed: non-admins can't save. Set true when a save 403s.
  const [forbidden, setForbidden] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    quoting
      .settingsGet()
      .then((res) => {
        if (cancelled) return;
        const s = res.data.settings ?? {};
        const orgName = res.data.org_name ?? undefined;
        const orgLogo = res.data.org_logo_url ?? undefined;
        // Seed from saved settings; fall back to org-derived values for the
        // two brandable fields when the saved value is empty.
        setForm({
          ...s,
          company_name: s.company_name || orgName || "",
          logo_url: s.logo_url || orgLogo || "",
          prepared_by: s.prepared_by || (user?.displayName ?? "") || "",
          default_currency: s.default_currency || "USD",
        });
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e?.message ?? "Failed to load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // user?.displayName is only a default seed; don't refetch when it resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<Settings>) {
    setSavedAt(null);
    setForm((f) => ({ ...f, ...p }));
  }

  async function handleImage(
    file: File | undefined,
    key: "logo_url" | "signature_url",
  ) {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      patch({ [key]: dataUrl } as Partial<Settings>);
    } catch (e: any) {
      setImageError(e?.message ?? "Couldn't process that image.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setImageError(null);
    try {
      // Drop empty strings so we don't persist blanks over org-derived values.
      const payload: Settings = {};
      (Object.keys(form) as (keyof Settings)[]).forEach((k) => {
        const v = form[k];
        if (v === "" || v == null) return;
        (payload as any)[k] = v;
      });
      const res = await quoting.settingsUpdate(payload);
      setForm((f) => ({ ...f, ...res.data.settings }));
      setSavedAt(Date.now());
    } catch (e: any) {
      if (e instanceof EdgeFunctionError && e.code === "FORBIDDEN") {
        setForbidden(true);
        setSaveError("Only workspace owners/admins can edit quote branding.");
      } else if (e instanceof EdgeFunctionError && e.code === "IMAGE_TOO_LARGE") {
        setSaveError("Image too large, please use a smaller logo.");
      } else {
        setSaveError(e?.message ?? "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-slate-400">
        <div className="flex items-center gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings…
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="text-[15px] font-bold text-slate-900">
          Couldn&apos;t load quote settings
        </div>
        <p className="mt-1 text-[13px] text-slate-500">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate("/app/quoting")}
          className="mt-5 inline-flex h-10 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Quoting
        </button>
      </div>
    );
  }

  const saveDisabled = saving || forbidden;

  return (
    <div className="min-h-full">
      {/* Sticky action header */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/app/quoting")}
          aria-label="Back to quoting"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[9px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-display text-[18px] font-bold tracking-[-0.3px] text-slate-900">
            Quote Settings
          </h1>
          <small className="truncate text-[12px] text-slate-500">
            Branding &amp; defaults applied to every new quote and PDF.
          </small>
        </div>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          {savedAt && !saving && (
            <span className="hidden items-center gap-1.5 text-[12px] text-slate-400 sm:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            title={forbidden ? "Only workspace owners/admins can edit quote branding." : undefined}
            className="inline-flex h-[38px] w-full items-center justify-center gap-2 rounded-[10px] px-4 font-display text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {forbidden && (
        <div className="mx-auto mt-3 max-w-[760px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] bg-amber-100 text-amber-700">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-semibold text-amber-900">
                Read-only access
              </div>
              <p className="text-[12.5px] text-amber-800">
                Only workspace owners/admins can edit quote branding.
              </p>
            </div>
          </div>
        </div>
      )}

      {saveError && !forbidden && (
        <div className="mx-auto mt-3 max-w-[760px] px-4 sm:px-6">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            {saveError}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-5 pb-20 sm:px-6">
        {/* Company */}
        <LitSectionCard title="Company">
          <div className="space-y-3">
            <Field label="Company Name">
              <input
                value={form.company_name ?? ""}
                onChange={(e) => patch({ company_name: e.target.value })}
                placeholder="Your company name"
                className={input}
                disabled={forbidden}
              />
            </Field>
            <Field label="Address">
              <textarea
                value={form.company_address ?? ""}
                onChange={(e) => patch({ company_address: e.target.value })}
                rows={2}
                placeholder="Street, City, State ZIP, Country"
                className={textarea}
                disabled={forbidden}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input
                  type="email"
                  value={form.company_email ?? ""}
                  onChange={(e) => patch({ company_email: e.target.value })}
                  placeholder="quotes@company.com"
                  className={input}
                  disabled={forbidden}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.company_phone ?? ""}
                  onChange={(e) => patch({ company_phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className={input}
                  disabled={forbidden}
                />
              </Field>
            </div>
          </div>
        </LitSectionCard>

        {/* Logo */}
        <LitSectionCard title="Logo" sub="Shown in the header of every quote PDF.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="grid h-24 w-44 flex-shrink-0 place-items-center overflow-hidden rounded-[10px] border border-dashed border-slate-200 bg-slate-50">
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logo_url}
                  alt="Logo preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-400">No logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleImage(e.target.files?.[0], "logo_url");
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={forbidden}
                  className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ImageUp className="h-4 w-4" />
                  {form.logo_url ? "Replace logo" : "Upload logo"}
                </button>
                {form.logo_url && (
                  <button
                    type="button"
                    onClick={() => patch({ logo_url: "" })}
                    disabled={forbidden}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-slate-400">
                PNG or JPEG. Resized automatically to fit the PDF header.
              </p>
            </div>
          </div>
        </LitSectionCard>

        {/* Signature */}
        <LitSectionCard title="Signature" sub="Appears above the prepared-by line on the PDF.">
          <div className="space-y-3">
            <Field label="Signature Name">
              <input
                value={form.signature_name ?? ""}
                onChange={(e) => patch({ signature_name: e.target.value })}
                placeholder="Jane Doe"
                className={input}
                disabled={forbidden}
              />
            </Field>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="grid h-20 w-44 flex-shrink-0 place-items-center overflow-hidden rounded-[10px] border border-dashed border-slate-200 bg-slate-50">
                {form.signature_url ? (
                  <img
                    src={form.signature_url}
                    alt="Signature preview"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-slate-400">No signature</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleImage(e.target.files?.[0], "signature_url");
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={forbidden}
                    className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ImageUp className="h-4 w-4" />
                    {form.signature_url ? "Replace signature" : "Upload signature"}
                  </button>
                  {form.signature_url && (
                    <button
                      type="button"
                      onClick={() => patch({ signature_url: "" })}
                      disabled={forbidden}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
            <Field label="Prepared By">
              <input
                value={form.prepared_by ?? ""}
                onChange={(e) => patch({ prepared_by: e.target.value })}
                placeholder="Your name"
                className={input}
                disabled={forbidden}
              />
            </Field>
          </div>
        </LitSectionCard>

        {imageError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            {imageError}
          </div>
        )}

        {/* Defaults */}
        <LitSectionCard title="Quote Defaults" sub="Applied to each new quote (you can override per quote).">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Default Payment Terms">
                <select
                  value={form.default_payment_terms ?? ""}
                  onChange={(e) => patch({ default_payment_terms: e.target.value })}
                  className={input}
                  disabled={forbidden}
                >
                  <option value="">— Select —</option>
                  {PAYMENT_TERMS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default Currency">
                <select
                  value={form.default_currency ?? "USD"}
                  onChange={(e) => patch({ default_currency: e.target.value })}
                  className={input}
                  disabled={forbidden}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Default Fuel Surcharge %">
              <input
                value={form.default_fuel_surcharge_pct == null ? "" : String(form.default_fuel_surcharge_pct)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === "") {
                    patch({ default_fuel_surcharge_pct: undefined });
                    return;
                  }
                  const n = Number(v);
                  if (Number.isFinite(n)) patch({ default_fuel_surcharge_pct: n });
                }}
                inputMode="decimal"
                placeholder="e.g. 12.5"
                className={input + " max-w-[200px] font-mono font-semibold"}
                disabled={forbidden}
              />
            </Field>
            <Field label="Terms & Conditions">
              <textarea
                value={form.terms_text ?? ""}
                onChange={(e) => patch({ terms_text: e.target.value })}
                rows={4}
                placeholder="Rates exclude duties & taxes. Subject to space & equipment availability…"
                className={textarea}
                disabled={forbidden}
              />
            </Field>
          </div>
        </LitSectionCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
