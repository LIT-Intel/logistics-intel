/**
 * GET /api/admin/linkedin-analytics — server-side proxy for the LIT admin
 * marketing-analytics page. Pulls LinkedIn Ads + LinkedIn Organic metrics
 * from Windsor.ai (read-only aggregator) and returns a slimmed-down JSON
 * tailored to the dashboard cards.
 *
 * The admin dashboard is a CLIENT-SIDE React page; it can't talk to MCP
 * or hold the Windsor API key. This route is the bridge.
 *
 * Auth:
 *   - Authorization: Bearer <Supabase access token>
 *   - The user must be an admin per public.is_admin_caller() RPC.
 *
 * Query params:
 *   - days   (optional, default 30, max 90) — rolling window for Ads spend
 *            + organic post performance.
 *
 * Env required:
 *   WINDSOR_API_KEY                 the operator-issued Windsor key
 *   NEXT_PUBLIC_SUPABASE_URL or
 *     VITE_SUPABASE_URL             Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY       to verify the bearer token + call RPC
 *
 * Optional env:
 *   LINKEDIN_ADS_ACCOUNT            override the LinkedIn Ads account id
 *                                   (default: 536270862, "Logistic Intel")
 *   LINKEDIN_ORG_ACCOUNT            override the LinkedIn Organic account id
 *                                   (default: 115993203, "Logistics Intel")
 *
 * Caching: the Windsor data refreshes daily, so we set s-maxage=3600.
 *
 * If WINDSOR_API_KEY is unset we return 503 with a clear shape so the
 * frontend can render an "LinkedIn not configured yet" empty state
 * gracefully instead of erroring.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Windsor.ai's documented REST endpoint for unified connector data.
// Fields + connector + accounts get passed as query params, comma-separated.
// Reference: https://windsor.ai/api-fields/  (the docs page lists the
// `/all` endpoint plus per-connector field IDs). The exact path can drift
// — Windsor recently aliased a few variants — but `/api/all` (also served
// at `/all`) has been stable for the LinkedIn connectors as of 2026-05.
const WINDSOR_BASE = "https://connectors.windsor.ai/all";

const ADS_ACCOUNT = process.env.LINKEDIN_ADS_ACCOUNT || "536270862";
const ORG_ACCOUNT = process.env.LINKEDIN_ORG_ACCOUNT || "115993203";

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const reply = (b: unknown, s = 200) => json(b, s, origin);

  // ----- 1. Auth ------------------------------------------------------------
  const authHeader = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return reply({ ok: false, error: "unauthorized" }, 401);
  const accessToken = m[1].trim();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return reply({ ok: false, error: "supabase_not_configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // Verify the token resolves to a real user and that user is an admin.
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return reply({ ok: false, error: "invalid_token" }, 401);
  }

  // The is_admin_caller() RPC checks JWT claims server-side. We pass the
  // user's token in headers (above) so RLS + the RPC's auth.uid() resolve.
  const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_admin_caller");
  if (rpcErr) {
    console.error("[linkedin-analytics] is_admin_caller rpc failed", rpcErr);
    return reply({ ok: false, error: "admin_check_failed" }, 500);
  }
  if (isAdmin !== true) {
    return reply({ ok: false, error: "forbidden" }, 403);
  }

  // ----- 2. Param parsing ---------------------------------------------------
  const url = new URL(req.url);
  let days = Number(url.searchParams.get("days") || "30");
  if (!Number.isFinite(days) || days <= 0) days = 30;
  if (days > 90) days = 90;
  // Windsor uses date_preset shorthand "last_Nd".
  const datePreset = `last_${days}d`;

  // ----- 3. Snapshot fallback (Windsor MCP path) ----------------------------
  // Windsor is read-only via the Claude MCP connector — there's no REST API
  // key on the operator's plan. A scheduled Claude routine writes a daily
  // snapshot to public.lit_linkedin_snapshots; serve that when WINDSOR_API_KEY
  // isn't configured. The snapshot row's payload already matches the response
  // contract, so the dashboard renders identically either way.
  const windsorKey = process.env.WINDSOR_API_KEY;
  if (!windsorKey) {
    const { data: snap, error: snapErr } = await supabase
      .from("lit_linkedin_snapshots")
      .select("snapshot_date, window_days, ads, organic, partial_failures, generated_at")
      .eq("window_days", days)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapErr) {
      console.error("[linkedin-analytics] snapshot read failed", snapErr.message);
      return reply({ ok: false, error: "snapshot_read_failed" }, 500);
    }
    if (!snap) {
      // Still no snapshot has run — surface the not-configured shape so the
      // dashboard renders its empty-state panel.
      return reply(
        {
          ok: false,
          error: "windsor_not_configured",
          message:
            "No LinkedIn snapshot has been written yet. The daily Windsor → Supabase routine will populate this on its next run.",
        },
        503,
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        days: snap.window_days,
        generated_at: snap.generated_at,
        ads: snap.ads,
        organic: snap.organic,
        partial_failures: snap.partial_failures ?? undefined,
        source: "snapshot",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "private, max-age=300, s-maxage=3600",
          ...corsHeaders(origin),
        },
      },
    );
  }

  // ----- 4. Fetch both connectors in parallel -------------------------------
  // Ads: spend + impressions + clicks per (date, campaign).
  // Organic: impressions + engagements per (date, post). Follower count
  // comes from a second slice using ORGANIZATION-level fields (no per-post
  // grouping, so we ask Windsor for organization_follower_count + date and
  // pick the latest row).
  const adsFields = [
    "date",
    "campaign",
    "campaign_id",
    "spend",
    "impressions",
    "clicks",
    "oneclickleads",
    "externalwebsiteconversions",
  ];
  const orgPostFields = [
    "date",
    "post_id",
    "share_title",
    "share_text",
    "share_impression_count",
    "share_clicks_count",
    "share_like_count",
    "share_comment_count",
    "share_count",
    "share_engagement_rate",
  ];
  const orgFollowerFields = ["date", "organization_follower_count"];

  const adsUrl = buildWindsorUrl({
    key: windsorKey,
    connector: "linkedin",
    accounts: [ADS_ACCOUNT],
    fields: adsFields,
    datePreset,
  });
  const orgPostsUrl = buildWindsorUrl({
    key: windsorKey,
    connector: "linkedin_organic",
    accounts: [ORG_ACCOUNT],
    fields: orgPostFields,
    datePreset,
  });
  const orgFollowersUrl = buildWindsorUrl({
    key: windsorKey,
    connector: "linkedin_organic",
    accounts: [ORG_ACCOUNT],
    fields: orgFollowerFields,
    datePreset,
  });

  let adsRows: AdsRow[] = [];
  let orgPostRows: OrgPostRow[] = [];
  let orgFollowerRows: OrgFollowerRow[] = [];
  const failures: string[] = [];

  await Promise.all([
    fetchWindsor<AdsRow>(adsUrl)
      .then((r) => {
        adsRows = r;
      })
      .catch((e) => {
        failures.push(`ads:${e?.message || e}`);
      }),
    fetchWindsor<OrgPostRow>(orgPostsUrl)
      .then((r) => {
        orgPostRows = r;
      })
      .catch((e) => {
        failures.push(`organic_posts:${e?.message || e}`);
      }),
    fetchWindsor<OrgFollowerRow>(orgFollowersUrl)
      .then((r) => {
        orgFollowerRows = r;
      })
      .catch((e) => {
        failures.push(`organic_followers:${e?.message || e}`);
      }),
  ]);

  // If all three failed Windsor is likely down or the key is bad.
  if (failures.length === 3) {
    console.error("[linkedin-analytics] all windsor calls failed", failures);
    return reply(
      {
        ok: false,
        error: "windsor_fetch_failed",
        details: failures,
      },
      502,
    );
  }

  // ----- 5. Aggregate -------------------------------------------------------
  const ads = aggregateAds(adsRows);
  const organic = aggregateOrganic(orgPostRows, orgFollowerRows);

  const body = {
    ok: true,
    days,
    generated_at: new Date().toISOString(),
    ads,
    organic,
    // Surface partial failures so the UI can show a subtle indicator.
    partial_failures: failures.length ? failures : undefined,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Windsor refreshes daily; one-hour edge cache keeps the dashboard snappy.
      "cache-control": "private, max-age=300, s-maxage=3600",
      ...corsHeaders(origin),
    },
  });
}

// ─── Windsor helpers ────────────────────────────────────────────────────────

function buildWindsorUrl(opts: {
  key: string;
  connector: string;
  accounts: string[];
  fields: string[];
  datePreset: string;
}): string {
  const params = new URLSearchParams();
  params.set("api_key", opts.key);
  params.set("connector", opts.connector);
  params.set("accounts", opts.accounts.join(","));
  params.set("fields", opts.fields.join(","));
  params.set("date_preset", opts.datePreset);
  params.set("_format", "json");
  return `${WINDSOR_BASE}?${params.toString()}`;
}

async function fetchWindsor<T>(url: string): Promise<T[]> {
  const r = await fetch(url, {
    method: "GET",
    // Windsor responses are big-ish; let the runtime stream.
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`windsor_http_${r.status}:${txt.slice(0, 200)}`);
  }
  const j = (await r.json()) as { data?: T[] } | T[];
  // Windsor's `/all` endpoint returns either { data: [...] } or a bare array
  // depending on the connector — normalise.
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
}

// ─── Row types ──────────────────────────────────────────────────────────────

type AdsRow = {
  date?: string;
  campaign?: string;
  campaign_id?: string;
  spend?: number | string;
  impressions?: number | string;
  clicks?: number | string;
  oneclickleads?: number | string;
  externalwebsiteconversions?: number | string;
};

type OrgPostRow = {
  date?: string;
  post_id?: string;
  share_title?: string;
  share_text?: string;
  share_impression_count?: number | string;
  share_clicks_count?: number | string;
  share_like_count?: number | string;
  share_comment_count?: number | string;
  share_count?: number | string;
  share_engagement_rate?: number | string;
};

type OrgFollowerRow = {
  date?: string;
  organization_follower_count?: number | string;
};

// ─── Aggregations ───────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function aggregateAds(rows: AdsRow[]) {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let leads = 0;
  const byCampaign = new Map<
    string,
    { campaign: string; spend: number; impressions: number; clicks: number; leads: number }
  >();

  for (const r of rows) {
    const sp = num(r.spend);
    const im = num(r.impressions);
    const cl = num(r.clicks);
    const ld = num(r.oneclickleads) + num(r.externalwebsiteconversions);
    spend += sp;
    impressions += im;
    clicks += cl;
    leads += ld;
    const key = r.campaign || r.campaign_id || "(unattributed)";
    const cur =
      byCampaign.get(key) ||
      { campaign: key, spend: 0, impressions: 0, clicks: 0, leads: 0 };
    cur.spend += sp;
    cur.impressions += im;
    cur.clicks += cl;
    cur.leads += ld;
    byCampaign.set(key, cur);
  }

  const topCampaigns = [...byCampaign.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3)
    .map((c) => ({
      campaign: c.campaign,
      spend: round2(c.spend),
      impressions: c.impressions,
      clicks: c.clicks,
      leads: c.leads,
      ctr: c.impressions ? c.clicks / c.impressions : 0,
      cpc: c.clicks ? c.spend / c.clicks : 0,
    }));

  return {
    spend: round2(spend),
    impressions,
    clicks,
    leads,
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? spend / clicks : 0,
    top_campaigns: topCampaigns,
  };
}

function aggregateOrganic(posts: OrgPostRow[], followers: OrgFollowerRow[]) {
  // Posts: each row is a (date, post) pair. We sum impressions/engagements
  // across the window per post for the leaderboard and across all posts
  // for the totals.
  let postImpressions = 0;
  let engagements = 0;
  const byPost = new Map<
    string,
    {
      post_id: string;
      title: string;
      impressions: number;
      engagements: number;
    }
  >();

  for (const p of posts) {
    const im = num(p.share_impression_count);
    const eng =
      num(p.share_clicks_count) +
      num(p.share_like_count) +
      num(p.share_comment_count) +
      num(p.share_count);
    postImpressions += im;
    engagements += eng;
    const key = p.post_id || "(unknown)";
    const title =
      (p.share_title && p.share_title.trim()) ||
      (p.share_text && p.share_text.trim().slice(0, 80)) ||
      "(untitled post)";
    const cur =
      byPost.get(key) ||
      { post_id: key, title, impressions: 0, engagements: 0 };
    cur.impressions += im;
    cur.engagements += eng;
    if (cur.title === "(untitled post)" && title !== "(untitled post)") {
      cur.title = title;
    }
    byPost.set(key, cur);
  }

  const topPosts = [...byPost.values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)
    .map((p) => ({
      post_id: p.post_id,
      title: p.title,
      impressions: p.impressions,
      engagements: p.engagements,
      engagement_rate: p.impressions ? p.engagements / p.impressions : 0,
    }));

  // Followers: pick the latest by date, compute delta against the earliest
  // row in the window.
  const sortedFollowers = [...followers]
    .filter((f) => typeof f.date === "string")
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const first = sortedFollowers[0];
  const last = sortedFollowers[sortedFollowers.length - 1];
  const followersCurrent = last ? num(last.organization_follower_count) : 0;
  const followersStart = first ? num(first.organization_follower_count) : 0;
  const followersDelta =
    followersCurrent && followersStart ? followersCurrent - followersStart : 0;

  return {
    followers: followersCurrent,
    followers_delta: followersDelta,
    post_impressions: postImpressions,
    engagements,
    engagement_rate: postImpressions ? engagements / postImpressions : 0,
    top_posts: topPosts,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// app.logisticintel.com calls this cross-origin — keep the allowlist tight
// (route still requires a Supabase admin JWT, but exposing the endpoint to
// any origin would let third-party scripts probe for the error shape).
const ALLOWED_ORIGINS = new Set([
  "https://app.logisticintel.com",
  "https://logisticintel.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (!allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, OPTIONS",
    vary: "origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
