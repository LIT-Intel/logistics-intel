// apollo-job-postings — proxy for Apollo's /organizations/{id}/job_postings.
//
// Returns a compact, vendor-neutral hiring signal for the Pulse Quick
// Card: total count, top departments, freshest posted_at. The frontend
// surfaces this as "Hiring signal: 12 open roles · Engineering, Sales · 3d ago".
//
// Plan-gated like other paid Apollo proxies — free_trial gets nothing,
// everyone else gets 50 calls/day per user (not enforced here yet; the
// limit hook is wired so we can add a usage row later if needed).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";

// Apollo's job-postings endpoint — same family as
// /organizations/enrich. Requires `api_key` in the URL.
function buildJobPostingsUrl(orgId: string): string {
  const u = new URL(
    `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(orgId)}/job_postings`,
  );
  u.searchParams.set("api_key", APOLLO_API_KEY);
  return u.toString();
}

interface JobPosting {
  id?: string;
  title?: string;
  department?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  posted_at?: string | null;
  url?: string | null;
}

interface SignalResponse {
  ok: true;
  org_id: string;
  total: number;
  // Top departments by posting count, capped to 5
  departments: Array<{ name: string; count: number }>;
  // Most-recent posted_at across all postings (ISO)
  most_recent_posted_at: string | null;
  // Freshness bucket the UI can colorize: hot (<14d), warm (<60d), cool (older)
  freshness: "hot" | "warm" | "cool" | "unknown";
  // First 3 postings for a hover-preview / link-out
  sample: Array<Pick<JobPosting, "title" | "department" | "city" | "posted_at" | "url">>;
}

interface ErrorResponse {
  ok: false;
  code: string;
  message: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function freshnessFromDate(iso: string | null): SignalResponse["freshness"] {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso).getTime();
    const ageDays = (Date.now() - d) / 86400000;
    if (ageDays < 14) return "hot";
    if (ageDays < 60) return "warm";
    return "cool";
  } catch {
    return "unknown";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only." },
      405,
    );
  }

  if (!APOLLO_API_KEY) {
    return jsonResponse(
      { ok: false, code: "NOT_CONFIGURED", message: "APOLLO_API_KEY missing." },
      500,
    );
  }

  let body: { org_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, code: "INVALID_JSON", message: "Body must be JSON." },
      400,
    );
  }

  const orgId = String(body?.org_id || "").trim();
  if (!orgId) {
    return jsonResponse(
      { ok: false, code: "MISSING_ORG_ID", message: "org_id is required." },
      400,
    );
  }

  try {
    const upstream = await fetch(buildJobPostingsUrl(orgId), {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });

    if (upstream.status === 403) {
      return jsonResponse(
        {
          ok: false,
          code: "PROVIDER_FORBIDDEN",
          message:
            "Hiring-signal endpoint not allowed on the current data plan.",
        },
        403,
      );
    }
    if (upstream.status === 404) {
      // No postings is a valid state — return an empty signal.
      const empty: SignalResponse = {
        ok: true,
        org_id: orgId,
        total: 0,
        departments: [],
        most_recent_posted_at: null,
        freshness: "unknown",
        sample: [],
      };
      return jsonResponse(empty);
    }
    if (!upstream.ok) {
      return jsonResponse(
        {
          ok: false,
          code: "PROVIDER_ERROR",
          message: `Upstream returned ${upstream.status}`,
        },
        502,
      );
    }

    const data = await upstream.json().catch(() => ({}));
    const postings: JobPosting[] = Array.isArray(data?.organization_job_postings)
      ? data.organization_job_postings
      : Array.isArray(data?.job_postings)
        ? data.job_postings
        : [];

    // Aggregate departments
    const deptCount = new Map<string, number>();
    let mostRecent: string | null = null;

    for (const p of postings) {
      const dept = (p.department || "").trim();
      if (dept) deptCount.set(dept, (deptCount.get(dept) || 0) + 1);
      if (p.posted_at) {
        if (!mostRecent || new Date(p.posted_at).getTime() > new Date(mostRecent).getTime()) {
          mostRecent = p.posted_at;
        }
      }
    }

    const departments = Array.from(deptCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sample = postings.slice(0, 3).map((p) => ({
      title: p.title || null,
      department: p.department || null,
      city: p.city || null,
      posted_at: p.posted_at || null,
      url: p.url || null,
    }));

    const result: SignalResponse = {
      ok: true,
      org_id: orgId,
      total: postings.length,
      departments,
      most_recent_posted_at: mostRecent,
      freshness: freshnessFromDate(mostRecent),
      sample,
    };
    return jsonResponse(result);
  } catch (err) {
    console.error("[apollo-job-postings] fatal", err);
    const error = err as Error;
    return jsonResponse(
      {
        ok: false,
        code: "FATAL",
        message: error?.message || "Unexpected error",
      } satisfies ErrorResponse,
      500,
    );
  }
});
