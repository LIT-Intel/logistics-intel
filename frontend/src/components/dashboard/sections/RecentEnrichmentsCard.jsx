import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Linkedin, Mail, Sparkles, UserPlus, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Recent Enrichments — last 7 days of contacts the user has enriched
 * across their workspace. Each row exposes a one-click route into the
 * relevant company's Contacts tab so the user can add the contact to
 * a campaign without hunting for them.
 */
export default function RecentEnrichmentsCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Pull the last 7 days of enriched lit_contacts for companies
        // the user has saved.
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 7);
        const { data: savedRows } = await supabase
          .from("lit_saved_companies")
          .select("company_id")
          .eq("user_id", user.id);
        const companyIds = (savedRows || [])
          .map((r) => r?.company_id)
          .filter(Boolean);
        if (companyIds.length === 0) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        const { data } = await supabase
          .from("lit_contacts")
          .select(
            "id, company_id, full_name, first_name, last_name, title, email, linkedin_url, updated_at, verified_by_provider, email_verified, source, company:lit_companies(id, name, source_company_key, domain)",
          )
          .in("company_id", companyIds)
          .gte("updated_at", since.toISOString())
          .order("updated_at", { ascending: false })
          .limit(8);
        if (cancelled) return;
        setRows((data || []).filter((c) => c?.id));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <div className="font-display text-[12px] font-bold text-slate-900">
            Recent Enrichments
          </div>
          <div className="font-body text-[10.5px] text-slate-500">
            Contacts enriched in the last 7 days
          </div>
        </div>
        <a
          href="/app/contacts"
          className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
        >
          View all contacts
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>

      {loading ? (
        <div className="font-body px-6 py-8 text-center text-[12px] text-slate-500">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="font-display text-[12px] font-semibold text-slate-700">
            No recent enrichments.
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            Open a saved company → Contacts tab → Find contacts with LIT to
            populate this list.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const name =
              c.full_name ||
              [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
              c.first_name ||
              "Unnamed contact";
            const verified =
              c.verified_by_provider === true || c.email_verified === true;
            const slug = c.company?.source_company_key || c.company?.id;
            return (
              <div
                key={c.id}
                className="flex flex-col gap-1.5 border-b border-slate-100 p-3 last:border-b-0 sm:[&:nth-child(2n)]:border-l xl:[&:nth-child(2n)]:border-l-0 xl:[&:not(:nth-child(3n+1))]:border-l"
              >
                <div className="flex items-center gap-2">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display flex items-center gap-1 truncate text-[12px] font-semibold text-slate-900">
                      {name}
                      {verified && (
                        <span className="font-display inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1 text-[8.5px] font-bold uppercase tracking-[0.04em] text-emerald-700">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="font-body truncate text-[10.5px] text-slate-500">
                      {c.title || "—"}
                    </div>
                  </div>
                </div>
                <div className="font-body text-[10.5px] text-slate-500">
                  {c.company?.name || "—"}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
                    {c.email ? (
                      <Mail className="h-3 w-3 text-slate-500" />
                    ) : (
                      <Mail className="h-3 w-3 text-slate-300" />
                    )}
                    {c.linkedin_url ? (
                      <Linkedin className="h-3 w-3 text-blue-500" />
                    ) : (
                      <Linkedin className="h-3 w-3 text-slate-300" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (slug)
                        navigate(
                          `/app/companies/${encodeURIComponent(String(slug))}?tab=contacts`,
                        );
                    }}
                    className="font-display inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2 py-1 text-[10.5px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                    title="Open in Contacts tab to add to a campaign"
                  >
                    <UserPlus className="h-2.5 w-2.5" />
                    Add to campaign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PALETTE = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#14B8A6",
];

function Avatar({ name }) {
  const initials = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
  const color = PALETTE[(name || "").charCodeAt(0) % PALETTE.length];
  return (
    <div
      className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
    >
      {initials || "?"}
    </div>
  );
}
