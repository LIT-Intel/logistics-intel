"use client";

import { useState } from "react";
import {
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Calculator,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { CalcResult } from "@/lib/tariff/calculate";

/**
 * Tariff Calculator widget. Posts to /api/tariff/lookup which calls the
 * live USITC REST API and returns a structured CalcResult including
 * each duty line, total, effective rate, sources, and notices (IEEPA
 * refunds, AD/CVD pointer).
 *
 * Form state is local; result state replaces the form on success but
 * keeps a "calculate again" button to reset.
 */

const ORIGIN_OPTIONS: { iso: string; label: string }[] = [
  { iso: "CN", label: "China" },
  { iso: "VN", label: "Vietnam" },
  { iso: "MX", label: "Mexico (USMCA)" },
  { iso: "CA", label: "Canada (USMCA)" },
  { iso: "IN", label: "India" },
  { iso: "TH", label: "Thailand" },
  { iso: "MY", label: "Malaysia" },
  { iso: "ID", label: "Indonesia" },
  { iso: "KR", label: "South Korea (KORUS)" },
  { iso: "JP", label: "Japan" },
  { iso: "TW", label: "Taiwan" },
  { iso: "DE", label: "Germany" },
  { iso: "IT", label: "Italy" },
  { iso: "TR", label: "Turkey" },
  { iso: "BR", label: "Brazil" },
  { iso: "BD", label: "Bangladesh" },
  { iso: "GB", label: "United Kingdom" },
  { iso: "PH", label: "Philippines" },
  { iso: "PK", label: "Pakistan" },
  { iso: "EG", label: "Egypt" },
];

type State = "idle" | "loading" | "ok" | "error";

export function TariffCalculator() {
  const [hts, setHts] = useState("");
  const [origin, setOrigin] = useState("CN");
  const [value, setValue] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError(null);

    const params = new URLSearchParams({
      hts,
      origin,
      value: value || "0",
    });
    if (qty) params.set("qty", qty);
    if (unit) params.set("unit", unit);

    try {
      const r = await fetch(`/api/tariff/lookup?${params.toString()}`);
      const data = await r.json();
      if (r.ok && data.ok) {
        setResult(data.result);
        setState("ok");
      } else {
        setError(
          data.error === "hts_not_found"
            ? data.hint || "HTS code not found. Verify at hts.usitc.gov."
            : data.error === "usitc_api_error"
            ? "USITC API is currently unreachable. Try again in a minute."
            : "Lookup failed. Check the HTS code and try again.",
        );
        setState("error");
      }
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  function reset() {
    setResult(null);
    setState("idle");
    setError(null);
  }

  if (state === "ok" && result) {
    return <ResultPanel result={result} onReset={reset} />;
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.10)]"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              background: "rgba(37,99,235,0.08)",
              boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
            }}
          >
            <Calculator className="h-4.5 w-4.5 text-brand-blue" aria-hidden />
          </div>
          <div className="font-display text-[16px] font-semibold text-ink-900">
            Run a duty calculation
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="HTSUS code *"
            hint="e.g. 8501.10.40 or 850110"
            name="hts"
            value={hts}
            onChange={setHts}
            required
            placeholder="8501.10.40"
          />
          <SelectField
            label="Country of origin *"
            name="origin"
            value={origin}
            onChange={setOrigin}
            options={ORIGIN_OPTIONS.map((o) => ({ value: o.iso, label: o.label }))}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Customs value (USD) *"
            hint="Total declared value"
            name="value"
            type="number"
            value={value}
            onChange={setValue}
            required
            placeholder="10000"
          />
          <Field
            label="Quantity"
            hint="Required for specific duties"
            name="qty"
            type="number"
            value={qty}
            onChange={setQty}
            placeholder="100"
          />
          <SelectField
            label="Unit"
            name="unit"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "kg", label: "kg" },
              { value: "ton", label: "metric ton" },
              { value: "l", label: "liter" },
              { value: "pcs", label: "pieces" },
              { value: "doz", label: "dozen" },
              { value: "m", label: "meter" },
              { value: "m2", label: "m²" },
              { value: "m3", label: "m³" },
            ]}
          />
        </div>

        {state === "error" && error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13.5px] text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={state === "loading" || !hts || !value}
          className="font-display mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
        >
          {state === "loading" ? (
            "Looking up live USITC rate…"
          ) : (
            <>
              Calculate duty <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>

        <p className="font-body mt-3 text-center text-[12px] text-ink-500">
          Live MFN rate from USITC. Section 232/301/122 overlays applied where they fit.
        </p>
      </form>
    </div>
  );
}

function ResultPanel({
  result,
  onReset,
}: {
  result: CalcResult;
  onReset: () => void;
}) {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="mx-auto max-w-[820px]">
      {/* Result hero */}
      <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-blue">
              Calculated duty
            </div>
            <div className="font-display mt-1.5 text-[14px] font-semibold text-ink-900">
              HTSUS {result.htsno}
            </div>
            <div className="font-body mt-1 max-w-[480px] text-[13.5px] text-ink-500">
              {result.description}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
              <span className="font-mono rounded bg-ink-50 px-2 py-0.5">
                Origin: {result.origin || "—"}
              </span>
              <span className="font-mono rounded bg-ink-50 px-2 py-0.5">
                Value: {fmt(result.customsValue)}
              </span>
              {result.unitQuantity && result.unit && (
                <span className="font-mono rounded bg-ink-50 px-2 py-0.5">
                  Qty: {result.unitQuantity} {result.unit}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Total duty
            </div>
            <div className="font-display mt-1 text-[34px] font-bold tracking-[-0.02em] text-ink-900">
              {fmt(result.totalDuty)}
            </div>
            <div className="font-mono mt-0.5 text-[12.5px] text-brand-blue-700">
              Effective rate {fmtPct(result.effectiveRate)}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-6 overflow-hidden rounded-xl border border-ink-100">
          <table className="w-full text-left">
            <thead className="bg-ink-25">
              <tr className="text-[10.5px] uppercase tracking-wider text-ink-500">
                <th className="font-display px-4 py-3 font-bold">Authority</th>
                <th className="font-display px-4 py-3 font-bold">Description</th>
                <th className="font-display px-4 py-3 text-right font-bold">Rate</th>
                <th className="font-display px-4 py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l, i) => (
                <tr
                  key={i}
                  className="border-t border-ink-100 align-top text-[13px]"
                >
                  <td className="px-4 py-3 font-mono text-[11.5px] text-ink-500">
                    {l.authority || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-display font-semibold text-ink-900">{l.label}</div>
                    {l.note && (
                      <div className="font-body mt-0.5 text-[12px] text-ink-500">{l.note}</div>
                    )}
                    {l.source && (
                      <a
                        href={l.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-display mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-blue-700 hover:underline"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-700">
                    {l.rate != null ? fmtPct(l.rate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink-900">
                    {fmt(l.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-100 bg-ink-25/60">
                <td colSpan={3} className="px-4 py-3 text-right font-display font-semibold text-ink-700">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-mono text-[15px] font-bold text-brand-blue-700">
                  {fmt(result.totalDuty)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Caveats */}
        {result.caveats.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <div className="font-display mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Caveats
            </div>
            <ul className="ml-1 space-y-1">
              {result.caveats.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={result.htsLookupUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-display inline-flex h-10 items-center gap-1.5 rounded-md border border-ink-100 bg-white px-4 text-[13px] font-semibold text-ink-700 transition hover:bg-ink-25"
          >
            Verify on USITC <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <button
            type="button"
            onClick={onReset}
            className="font-display inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-blue px-4 text-[13px] font-semibold text-white transition hover:bg-brand-blue-700"
          >
            Calculate again
          </button>
        </div>
      </div>

      {/* Notices */}
      {result.notices.length > 0 && (
        <div className="mt-4 space-y-3">
          {result.notices.map((n, i) => (
            <div
              key={i}
              className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5"
            >
              <div className="font-display flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-blue-700">
                <Info className="h-3.5 w-3.5" aria-hidden />
                {n.headline}
              </div>
              <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-700">
                {n.body}
              </p>
              <a
                href={n.source}
                target="_blank"
                rel="noreferrer noopener"
                className="font-display mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:underline"
              >
                Read more
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  name,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  hint?: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-[11.5px] font-semibold text-ink-700">
        {label}
        {hint && (
          <span className="font-body ml-1.5 text-[10.5px] font-normal text-ink-500">
            {hint}
          </span>
        )}
      </span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        className="font-mono block h-11 w-full rounded-lg border border-ink-100 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-200 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-body block h-11 w-full rounded-lg border border-ink-100 bg-white px-3 text-[14px] text-ink-900 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
