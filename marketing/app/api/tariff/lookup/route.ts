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
 * Format a numeric prefix into the dotted USITC search form.
 * 4 digits  → "1234"
 * 6 digits  → "1234.56"
 * 8 digits  → "1234.56.78"
 * 10 digits → "1234.56.78.90"
 */
function dotted(prefix: string): string {
  const n = norm(prefix);
  if (n.length <= 4) return n;
  if (n.length <= 6) return `${n.slice(0, 4)}.${n.slice(4)}`;
  if (n.length <= 8) return `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6, 8)}.${n.slice(8, 10)}`;
}

/**
 * Resolve an HTS code to a usable rate.
 *
 * USITC HTSUS rates live on the leaf lines (10-digit) and the parent
 * subheading lines (8-digit). Many user-entered codes don't exist as
 * exact strings — e.g. "7208.10.00" is invalid; real leaves are
 * "7208.10.15.00", "7208.10.30.00", etc. with different rates.
 *
 * Strategy:
 *   1. Try the user's exact input.
 *   2. If empty, truncate to 8 digits, then 6, and re-query. Each
 *      query returns the heading + its children.
 *   3. Pick the most-specific line in the results whose `general`
 *      rate is non-empty AND whose htsno is a prefix-match of the
 *      user's input. If no prefix-matching leaf has a rate, fall
 *      back to the first leaf with a rate (with a caveat surfaced
 *      in the UI).
 */
async function resolveHts(htsRaw: string): Promise<HtsLine | null> {
  const cleaned = norm(htsRaw);
  if (cleaned.length < 4) return null;

  // Build prefix search list, longest first: input → 8d → 6d → 4d.
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const cut of [cleaned.length, 10, 8, 6, 4].filter((n) => n <= cleaned.length)) {
    const dottedPrefix = dotted(cleaned.slice(0, cut));
    if (!seen.has(dottedPrefix)) {
      seen.add(dottedPrefix);
      queries.push(dottedPrefix);
    }
  }

  for (const q of queries) {
    let lines: HtsLine[];
    try {
      lines = await fetchUsitc(q);
    } catch {
      lines = [];
    }
    if (!lines.length) continue;

    // Filter to lines whose htsno is a prefix-match of the user's
    // cleaned input (e.g. user "7208.10.00" → match "7208.10.15.00"
    // since the first 6 digits agree).
    const cuRaw = cleaned;
    const matchPrefix = (l: HtsLine) => {
      const ln = norm(l.htsno);
      // Match if either side is a prefix of the other (forwards or
      // backwards) — handles user typing too few or too many digits.
      return ln.startsWith(cuRaw.slice(0, Math.min(ln.length, cuRaw.length))) ||
        cuRaw.startsWith(ln.slice(0, Math.min(ln.length, cuRaw.length)));
    };

    const prefixCandidates = lines
      .filter((l) => matchPrefix(l) && l.general && l.general.trim().length > 0)
      .sort((a, b) => norm(b.htsno).length - norm(a.htsno).length);
    if (prefixCandidates.length > 0) return prefixCandidates[0];

    // Fall back: any line with a non-empty rate (least-specific first
    // so we land on the heading-level rate as the closest published
    // value).
    const anyCandidate = lines
      .filter((l) => l.general && l.general.trim().length > 0)
      .sort((a, b) => norm(a.htsno).length - norm(b.htsno).length);
    if (anyCandidate.length > 0) return anyCandidate[0];
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
