import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  Sparkles,
  UserPlus,
} from "lucide-react";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import LitKpiStrip from "@/components/ui/LitKpiStrip";
import LitPill from "@/components/ui/LitPill";

/**
 * Workspace Contacts page — every saved-account contact in one clean
 * list. Reuses the design language from the Company Profile Contacts
 * tab (avatar pill, verified badge, source badge) but at workspace
 * scale: filter by company, search, sort by enrichment recency, click
 * a row to deep-link into the company's Contacts tab for actions.
 *
 * Path: /app/contacts (mounted under Command Center submenu)
 */

export default function ContactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // Get the user's saved company UUIDs first; we only show
        // contacts that belong to one of their accounts.
        const { data: saved } = await supabase
          .from("lit_saved_companies")
          .select(
            "company_id, lit_companies (id, name, source_company_key, domain)",
          )
          .eq("user_id", user.id);
        const companyMap = new Map();
        for (const s of saved || []) {
          const co = s?.lit_companies;
          if (co?.id) companyMap.set(co.id, co);
        }
        const companyIds = Array.from(companyMap.keys());
        if (companyIds.length === 0) {
          if (!cancelled) {
            setRows([]);
            setCompanies([]);
            setLoading(false);
          }
          return;
        }
        const { data } = await supabase
          .from("lit_contacts")
          .select(
            "id, company_id, full_name, first_name, last_name, title, department, email, phone, linkedin_url, source, source_provider, verified_by_provider, email_verified, email_verification_status, updated_at, created_at",
          )
          .in("company_id", companyIds)
          .order("updated_at", { ascending: false })
          .limit(250);
        if (cancelled) return;
        const enriched = (data || []).map((c) => ({
          ...c,
          company: companyMap.get(c.company_id) || null,
        }));
        setRows(enriched);
        setCompanies(Array.from(companyMap.values()));
      } catch (err) {
        console.error("contacts page load error:", err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      const verified =
        c.verified_by_provider === true ||
        c.email_verified === true ||
        ["verified", "valid", "deliverable"].includes(
          String(c.email_verification_status || "").toLowerCase(),
        );
      if (companyFilter !== "all" && c.company_id !== companyFilter) {
        return false;
      }
      if (statusFilter === "verified" && !verified) return false;
      if (statusFilter === "with_email" && !c.email) return false;
      if (statusFilter === "with_phone" && !c.phone) return false;
      if (!q) return true;
      const name = String(c.full_name || c.name || "").toLowerCase();
      const title = String(c.title || "").toLowerCase();
      const email = String(c.email || "").toLowerCase();
      const company = String(c.company?.name || "").toLowerCase();
      return (
        name.includes(q) ||
        title.includes(q) ||
        email.includes(q) ||
        company.includes(q)
      );
    });
  }, [rows, query, companyFilter, statusFilter]);

  const verifiedCount = useMemo(
    () =>
      rows.filter(
        (c) =>
          c.verified_by_provider === true ||
          c.email_verified === true ||
          ["verified", "valid", "deliverable"].includes(
            String(c.email_verification_status || "").toLowerCase(),
          ),
      ).length,
    [rows],
  );

  const withEmail = useMemo(() => rows.filter((c) => c.email).length, [rows]);
  const withPhone = useMemo(() => rows.filter((c) => c.phone).length, [rows]);

  const kpiCells = [
    { label: "TOTAL CONTACTS", value: rows.length.toLocaleString() },
    { label: "VERIFIED", value: verifiedCount.toLocaleString() },
    { label: "WITH EMAIL", value: withEmail.toLocaleString() },
    { label: "WITH PHONE", value: withPhone.toLocaleString() },
    { label: "ACCOUNTS COVERED", value: companies.length.toLocaleString() },
  ];

  return (
    <AppLayout>
      <div className="flex min-h-full flex-col bg-[#F8FAFC]">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-6">
            <div className="font-body flex items-center gap-1.5 text-[12px] text-slate-500">
              <Link
                to="/app/dashboard"
                className="font-semibold text-slate-900 hover:text-blue-700"
              >
                Command Center
              </Link>
              <span className="text-slate-300">/</span>
              <span>Contacts</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-3.5 md:gap-3.5 md:px-6">
            <div className="min-w-0 flex-1">
              <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Workspace contacts
              </div>
              <h1 className="font-display m-0 truncate text-[20px] font-bold leading-tight tracking-tight text-slate-900 md:text-[24px]">
                Every saved-account contact in one place
              </h1>
              <div className="font-body mt-1 text-[12px] leading-relaxed text-slate-600">
                Showing{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {filtered.length.toLocaleString()}
                </strong>{" "}
                of{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {rows.length.toLocaleString()}
                </strong>{" "}
                contacts across{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {companies.length.toLocaleString()}
                </strong>{" "}
                saved {companies.length === 1 ? "account" : "accounts"}.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                to="/app/companies"
                className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                <Bookmark className="h-3 w-3" />
                Saved companies
              </Link>
              <Link
                to="/app/search"
                className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
              >
                <Search className="h-3 w-3" />
                Discover
              </Link>
            </div>
          </div>
          <LitKpiStrip cells={kpiCells} />
        </div>

        {/* Toolbar + body */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3.5 p-3 md:p-6">
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts by name, title, email, or company…"
                  className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="font-body rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900"
              >
                <option value="all">All accounts</option>
                {companies
                  .slice()
                  .sort((a, b) =>
                    String(a.name || "").localeCompare(String(b.name || "")),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: "all", label: "All" },
                  { id: "verified", label: "Verified" },
                  { id: "with_email", label: "With email" },
                  { id: "with_phone", label: "With phone" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={[
                      "font-display whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                      statusFilter === f.id
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-blue-500" />
                <p className="font-body text-[12px] text-slate-500">
                  Loading contacts…
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
                <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
                  No saved contacts yet
                </p>
                <p className="font-body mx-auto max-w-md text-[12px] text-slate-400">
                  Save a company, open the Contacts tab, and run{" "}
                  <strong className="text-slate-700">Find contacts with LIT</strong>{" "}
                  to populate this list.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
                <p className="font-display text-[12.5px] font-semibold text-slate-700">
                  No contacts match this filter set.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#FAFBFC]">
                      {[
                        "Contact",
                        "Title",
                        "Company",
                        "Email",
                        "Phone",
                        "Source",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          className="font-display whitespace-nowrap px-3.5 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <ContactRow
                        key={c.id}
                        contact={c}
                        onOpenCompany={() => {
                          const slug =
                            c.company?.source_company_key || c.company?.id;
                          if (slug) {
                            navigate(
                              `/app/companies/${encodeURIComponent(String(slug))}?tab=contacts`,
                            );
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
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

function ContactRow({ contact, onOpenCompany }) {
  const name =
    contact.full_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    contact.first_name ||
    "Unnamed contact";
  const verified =
    contact.verified_by_provider === true ||
    contact.email_verified === true ||
    ["verified", "valid", "deliverable"].includes(
      String(contact.email_verification_status || "").toLowerCase(),
    );
  const dept = contact.department;
  const source = contact.source || contact.source_provider;
  const isLit = /apollo|lit/i.test(String(source || ""));
  return (
    <tr className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/60">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenCompany}
                className="font-display truncate text-left text-[12px] font-semibold text-slate-900 hover:text-blue-700"
              >
                {name}
              </button>
              {verified ? (
                <span className="font-display inline-flex items-center rounded-sm border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-green-700">
                  Verified
                </span>
              ) : (
                <span className="font-display inline-flex items-center rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-400">
                  Inferred
                </span>
              )}
            </div>
            {dept && (
              <div className="font-body mt-0.5 text-[10px] text-slate-400">
                {dept}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="font-body px-3.5 py-2.5 text-[11px] text-slate-600">
        {contact.title || "—"}
      </td>
      <td className="px-3.5 py-2.5">
        <button
          type="button"
          onClick={onOpenCompany}
          className="font-display truncate text-[11.5px] font-semibold text-slate-700 hover:text-blue-700"
        >
          {contact.company?.name || "—"}
        </button>
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.email || <span className="text-slate-300">—</span>}
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.phone || <span className="text-slate-300">—</span>}
      </td>
      <td className="font-display px-3.5 py-2.5 text-[10px] font-semibold text-slate-500">
        {source ? (
          isLit ? (
            <span className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-violet-700">
              <Sparkles className="h-2.5 w-2.5" />
              LIT
            </span>
          ) : (
            String(source)
          )
        ) : (
          "—"
        )}
      </td>
      <td className="px-3.5 py-2.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onOpenCompany}
            title="Open in company Contacts tab"
            className="flex h-6 w-6 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            <Send className="h-3 w-3" />
          </button>
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noreferrer noopener"
              title="LinkedIn"
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:text-blue-700"
            >
              <Linkedin className="h-3 w-3" />
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              title="Email"
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:text-blue-700"
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

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
      className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
    >
      {initials || "?"}
    </div>
  );
}
