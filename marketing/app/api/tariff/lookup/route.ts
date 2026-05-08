import { NextRequest } from "next/server";
import { calculate, type HtsLine } from "@/lib/tariff/calculate";

export const dynamic = "force-dynamic";

/**
 * GET /api/tariff/lookup
 *   ?hts=8501.10.40&origin=CN&value=10000&qty=100&unit=kg
 *
 * Looks up a real HTSUS line via the USITC public REST API
 * (https://hts.usitc.gov/reststop/search), walks up the parent code if
 * the leaf has empty rates (HTSUS rates inherit from the 8-digit
 * heading), then computes duty using the live MFN rate + Section
 * overlays from `lib/tariff/overlays.ts`.
 *
 * Returns the structured CalcResult shape — see `lib/tariff/calculate.ts`.
 *
 * Errors:
 *   - missing_hts / missing_value         400
 *   - hts_not_found                       404
 *   - usitc_api_error                     502 (USITC unreachable / 5xx)
 */
const USITC_BASE = "https://hts.usitc.gov/reststop/search";

const norm = (s: string) => s.replace(/[^0-9]/g, "");

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}

async function fetchUsitc(query: string): Promise<HtsLine[]> {
  const res = await fetch(`${USITC_BASE}?keyword=${encodeURIComponent(query)}`, {
    headers: { accept: "application/json" },
    // 10s timeout via AbortController would be ideal; rely on Vercel's
    // built-in 10s function timeout for now.
  });
  if (!res.ok) throw new Error(`usitc_${res.status}`);
  const data = (await res.json()) as HtsLine[];
  return Array.isArray(data) ? data : [];
}

/**
 * Resolve an HTS code to a usable rate. Walks up the parent codes if
 * the leaf has empty rates — HTSUS rates are inherited so 8501.10.40.20
 * uses the rate published at 8501.10.40.
 */
async function resolveHts(htsRaw: string): Promise<HtsLine | null> {
  const cleaned = norm(htsRaw);
  if (cleaned.length < 4) return null;

  // First, search the full code as entered.
  const lines = await fetchUsitc(htsRaw);
  if (!lines.length) return null;

  // Find the line that matches the requested code most closely.
  const exactMatch = lines.find((l) => norm(l.htsno) === cleaned);
  const candidates: HtsLine[] = exactMatch ? [exactMatch] : [];

  // Walk up the digit hierarchy: 8501.10.40.20 → 8501.10.40 → 8501.10.
  // Pick the most-specific line that has a non-empty `general` rate.
  for (const l of lines) {
    if (!candidates.includes(l)) candidates.push(l);
  }

  // Sort by length descending — most specific first.
  candidates.sort((a, b) => norm(b.htsno).length - norm(a.htsno).length);

  // First candidate whose `general` is non-empty wins.
  const usable = candidates.find((c) => c.general && c.general.trim().length > 0);
  if (usable) return usable;

  // No general rate found in result set. As last resort, search shorter
  // prefixes explicitly (USITC sometimes returns leaf-only on broad queries).
  for (let cut = cleaned.length - 2; cut >= 4; cut -= 2) {
    const prefix = cleaned.slice(0, cut);
    const hierLines = await fetchUsitc(prefix);
    const hit = hierLines.find(
      (l) => norm(l.htsno) === prefix && l.general && l.general.trim().length > 0,
    );
    if (hit) return hit;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hts = url.searchParams.get("hts");
  const origin = (url.searchParams.get("origin") || "").toUpperCase();
  const valueStr = url.searchParams.get("value");
  const qtyStr = url.searchParams.get("qty");
  const unit = url.searchParams.get("unit") || undefined;

  if (!hts) return json({ ok: false, error: "missing_hts" }, 400);
  if (!valueStr) return json({ ok: false, error: "missing_value" }, 400);

  const customsValue = parseFloat(valueStr);
  if (!Number.isFinite(customsValue) || customsValue < 0) {
    return json({ ok: false, error: "invalid_value" }, 400);
  }

  const unitQuantity = qtyStr ? parseFloat(qtyStr) : undefined;

  let line: HtsLine | null;
  try {
    line = await resolveHts(hts);
  } catch (e: any) {
    console.error("[tariff/lookup] USITC fetch failed", e?.message || e);
    return json({ ok: false, error: "usitc_api_error" }, 502);
  }

  if (!line) {
    return json(
      {
        ok: false,
        error: "hts_not_found",
        hint: "Try the 6 or 8 digit prefix (e.g. 850110 instead of a 10-digit). Verify the code at hts.usitc.gov.",
      },
      404,
    );
  }

  const result = calculate({
    hts: line,
    originIso: origin,
    customsValue,
    unitQuantity: unitQuantity && Number.isFinite(unitQuantity) ? unitQuantity : undefined,
    unit,
  });

  return json({ ok: true, result });
}
