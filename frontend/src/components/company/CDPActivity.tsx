import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bookmark,
  Briefcase,
  Download,
  FolderPlus,
  Loader2,
  MessageSquare,
  Send,
  Ship,
  Sparkles,
  Zap,
} from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { supabase } from "@/lib/supabase";

type ActivityRow = {
  id?: string | number;
  event_type?: string | null;
  metadata?: any;
  created_at?: string | null;
};

type CDPActivityProps = {
  companyId?: string | null;
  ownerName?: string | null;
};

const ICON_BY_TYPE: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  shipment: { icon: Ship, color: "#3B82F6" },
  enrich: { icon: Zap, color: "#8B5CF6" },
  contact_enriched: { icon: Zap, color: "#8B5CF6" },
  note: { icon: MessageSquare, color: "#64748B" },
  campaign: { icon: Send, color: "#10B981" },
  campaign_added: { icon: Send, color: "#10B981" },
  list: { icon: FolderPlus, color: "#0EA5E9" },
  list_added: { icon: FolderPlus, color: "#0EA5E9" },
  research: { icon: Sparkles, color: "#F59E0B" },
  pulse_generated: { icon: Sparkles, color: "#F59E0B" },
  crm: { icon: Briefcase, color: "#3B82F6" },
  crm_stage: { icon: Briefcase, color: "#3B82F6" },
  export: { icon: Download, color: "#64748B" },
  bookmark: { icon: Bookmark, color: "#6366F1" },
  default: { icon: Activity, color: "#64748B" },
};

/**
 * Phase 3 — Activity tab.
 *
 * The dedicated `/api/companies/:id/activity` endpoint from the design
 * brief is not built yet (Phase 0 §6 documented this gap). Until it
 * lands, we read the per-user `lit_activity_events` rows scoped to this
 * company_id when the metadata column references it. Renders an honest
 * empty state when no rows match.
 */
export default function CDPActivity({ companyId, ownerName }: CDPActivityProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [resolvedCompanyUuid, setResolvedCompanyUuid] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Resolve slug ("company/old-navy") → UUID once per company. The
  // activity table stores company_id as a UUID column (not metadata),
  // so we must query by the resolved UUID.
  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setResolvedCompanyUuid(null);
      return;
    }
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(companyId),
      );
    if (isUuid) {
      setResolvedCompanyUuid(String(companyId));
      return;
    }
    (async () => {
      const candidates = String(companyId).startsWith("company/")
        ? [String(companyId)]
        : [String(companyId), `company/${companyId}`];
      for (const cand of candidates) {
        const { data } = await supabase
          .from("lit_companies")
          .select("id")
          .eq("source_company_key", cand)
          .maybeSingle();
        if (!cancelled && data?.id) {
          setResolvedCompanyUuid(String(data.id));
          return;
        }
      }
      if (!cancelled) setResolvedCompanyUuid(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function loadActivity() {
    if (!resolvedCompanyUuid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Primary: filter by the company_id column (this is where every
      // edge function writes the value). Fall back to scanning metadata
      // for legacy rows where the column was null.
      const { data, error } = await supabase
        .from("lit_activity_events")
        .select("id, event_type, metadata, created_at")
        .eq("company_id", resolvedCompanyUuid)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) {
        setRows([]);
        return;
      }
      setRows((data || []) as ActivityRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadActivity();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCompanyUuid]);

  async function handleSaveNote() {
    const text = noteDraft.trim();
    if (!text || savingNote) return;
    if (!resolvedCompanyUuid) {
      setNoteError("Save the company first before adding notes.");
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setNoteError("Sign in again to save notes.");
        return;
      }
      const { data, error } = await supabase
        .from("lit_activity_events")
        .insert({
          user_id: userId,
          event_type: "note",
          company_id: resolvedCompanyUuid,
          metadata: { note: text, author: ownerName || null },
        })
        .select("id, event_type, metadata, created_at")
        .single();
      if (error) {
        setNoteError(error.message || "Couldn't save note.");
        return;
      }
      if (data) {
        setRows((prev) => [data as ActivityRow, ...prev]);
      }
      setNoteDraft("");
    } catch (err: any) {
      setNoteError(err?.message || "Couldn't save note.");
    } finally {
      setSavingNote(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => {
      const t = String(r.event_type || "").toLowerCase();
      return t.startsWith(filter);
    });
  }, [rows, filter]);

  const stats = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = rows.filter((r) => {
      const t = r.created_at ? new Date(r.created_at).getTime() : 0;
      return Number.isFinite(t) && t >= last30;
    });
    const groupCount = (prefix: string) =>
      recent.filter((r) =>
        String(r.event_type || "").toLowerCase().startsWith(prefix),
      ).length;
    return {
      shipments: groupCount("shipment"),
      enriched: groupCount("enrich") + groupCount("contact_enriched"),
      notes: groupCount("note"),
      campaigns: groupCount("campaign"),
    };
  }, [rows]);

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
      <LitSectionCard
        title="Activity Timeline"
        sub="Account events, enrichment, and engagement history"
        action={
          <div className="flex gap-1">
            {[
              { k: "all", l: "All" },
              { k: "shipment", l: "Shipments" },
              { k: "enrich", l: "Enrichment" },
              { k: "campaign", l: "Campaigns" },
              { k: "note", l: "Notes" },
            ].map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className={[
                  "font-display whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-semibold",
                  filter === f.k
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {f.l}
              </button>
            ))}
          </div>
        }
        padded={false}
      >
        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-blue-500" />
            <p className="font-body text-[12px] text-slate-500">
              Loading activity…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
              No activity yet
            </p>
            <p className="font-body mx-auto max-w-md text-[12px] text-slate-400">
              Account events will surface here as the user enriches contacts,
              adds the company to lists or campaigns, and ships imports.
            </p>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map((row, i) => {
              const type = String(row.event_type || "").toLowerCase();
              const tone =
                ICON_BY_TYPE[type] ||
                ICON_BY_TYPE[type.split("_")[0]] ||
                ICON_BY_TYPE.default;
              const Icon = tone.icon;
              const meta = row.metadata || {};
              const subject =
                meta.title || meta.subject || meta.name || meta.query;
              const detail = meta.summary || meta.note;
              return (
                <div
                  key={row.id || i}
                  className={[
                    "relative grid items-start gap-3 px-4 py-3",
                    i < filtered.length - 1 ? "border-b border-slate-50" : "",
                  ].join(" ")}
                  style={{ gridTemplateColumns: "28px 1fr auto" }}
                >
                  {i < filtered.length - 1 && (
                    <div
                      className="absolute left-[30px] top-9 bottom-0 w-px bg-slate-100"
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative z-10 flex h-7 w-7 items-center justify-center rounded-md"
                    style={{
                      background: tone.color + "15",
                      border: `1px solid ${tone.color}25`,
                      color: tone.color,
                    }}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display mb-0.5 text-[12px] font-semibold text-slate-900">
                      {humanize(type)}
                      {subject ? <span className="text-slate-500"> — {subject}</span> : null}
                    </div>
                    {detail && (
                      <div className="font-body text-[11px] leading-snug text-slate-600">
                        {detail}
                      </div>
                    )}
                    <div className="font-body mt-1 text-[10px] text-slate-400">
                      by{" "}
                      <span className="font-semibold text-slate-500">
                        {ownerName || "you"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-[11px] font-semibold text-slate-600">
                      {formatRelativeShort(row.created_at)}
                    </div>
                    {row.created_at && (
                      <div className="font-mono mt-0.5 text-[10px] text-slate-400">
                        {formatAbsoluteShort(row.created_at)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </LitSectionCard>

      {/* Sidebar */}
      <aside className="flex flex-col gap-2.5">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            30-day activity
          </div>
          {[
            { l: "New shipments", v: stats.shipments },
            { l: "Contacts enriched", v: stats.enriched },
            { l: "Notes added", v: stats.notes },
            { l: "Campaign sends", v: stats.campaigns },
          ].map((d) => (
            <div
              key={d.l}
              className="flex items-center justify-between border-b border-slate-100 py-1 last:border-b-0"
            >
              <span className="font-body text-[11px] text-slate-600">{d.l}</span>
              <span className="font-mono text-[12px] font-bold text-slate-900">
                {d.v}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Add note
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            disabled={savingNote}
            placeholder="Drop a note for the team…"
            className="font-body min-h-[60px] w-full resize-none rounded-md border-[1.5px] border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-900 outline-none focus:border-blue-500"
          />
          {noteError && (
            <div className="font-body mt-1.5 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10.5px] text-rose-700">
              {noteError}
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveNote}
            disabled={savingNote || !noteDraft.trim() || !resolvedCompanyUuid}
            className="font-display mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingNote && <Loader2 className="h-3 w-3 animate-spin" />}
            Save note
          </button>
        </div>
      </aside>
    </div>
  );
}

function humanize(type: string) {
  if (!type) return "Activity";
  return type
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeShort(value?: string | null) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  if (delta < 0) return "";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.round(delta / minute))}m ago`;
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  if (delta < 2 * day) return "1d ago";
  if (delta < 30 * day) return `${Math.round(delta / day)}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatAbsoluteShort(value: string) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}