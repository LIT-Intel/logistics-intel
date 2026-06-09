import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import AppLayout from "@/layout/lit/AppLayout.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import LitKpiStrip from "@/components/ui/LitKpiStrip";
import LitPill from "@/components/ui/LitPill";
import LitEmptyState from "@/components/ui/LitEmptyState";
import { LitSkeletonRow } from "@/components/ui/LitSkeleton";
import { removeContactFromList } from "@/features/pulse/pulseListsApi";
import AddToListPicker from "@/features/pulse/AddToListPicker";

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
  // Geo + industry + list filters — populated from data, not preset.
  const [industryFilter, setIndustryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter_, setStateFilter_] = useState("all");
  const [listFilter, setListFilter] = useState("all");
  // List membership map<contactId, [{id, name, syncs_to_attio}]>.
  // Populated alongside contact fetch; mutated on add/remove.
  const [memberships, setMemberships] = useState(new Map());
  // Per-row "Add to list" picker target { contactId, companyId, contactName }.
  const [pickerTarget, setPickerTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // 1. The user's saved company ids. Don't embed lit_companies here
        //    — PostgREST relationship-embed sometimes returns null when
        //    the relationship cache is stale, which would silently empty
        //    the page even though the data exists.
        const { data: saved } = await supabase
          .from("lit_saved_companies")
          .select("company_id")
          .eq("user_id", user.id);
        const companyIds = (saved || [])
          .map((s) => s?.company_id)
          .filter(Boolean);
        if (companyIds.length === 0) {
          if (!cancelled) {
            setRows([]);
            setCompanies([]);
            setLoading(false);
          }
          return;
        }
        // 2. Hydrate company metadata + contacts in parallel.
        // NOTE: lit_contacts schema does NOT have a `source_provider`
        // column — it only has `source`. Including the non-existent
        // column made PostgREST return a 400, which the outer catch
        // block silently swallowed and the page rendered as "0 contacts"
        // even when the user's saved companies had verified Apollo
        // contacts on file. The error is now surfaced explicitly so a
        // future schema drift won't hide behind an empty success state.
        const [companyRes, contactRes] = await Promise.all([
          supabase
            .from("lit_companies")
            .select("id, name, source_company_key, domain, industry, city, state, country_code")
            .in("id", companyIds),
          supabase
            .from("lit_contacts")
            .select(
              "id, company_id, full_name, first_name, last_name, title, department, seniority, email, phone, linkedin_url, source, verified_by_provider, email_verified, email_verification_status, city, state, country_code, updated_at, created_at",
            )
            .in("company_id", companyIds)
            .order("updated_at", { ascending: false })
            .limit(250),
        ]);
        if (companyRes.error) {
          console.error(
            "[contacts page] lit_companies query failed:",
            companyRes.error,
          );
        }
        if (contactRes.error) {
          console.error(
            "[contacts page] lit_contacts query failed:",
            contactRes.error,
          );
        }
        const companyRows = companyRes.data;
        const contactRows = contactRes.data;
        if (cancelled) return;
        const companyMap = new Map();
        for (const co of companyRows || []) {
          if (co?.id) companyMap.set(co.id, co);
        }
        const enriched = (contactRows || []).map((c) => ({
          ...c,
          company: companyMap.get(c.company_id) || null,
        }));
        setRows(enriched);
        setCompanies(Array.from(companyMap.values()));

        // Fetch pulse_list memberships for these contacts. RLS-scoped to
        // the caller, so other workspaces' lists never leak in. We use
        // the relationship-embed syntax — if the FK isn't named, PostgREST
        // still resolves via list_id → pulse_lists.id.
        const contactIds = enriched.map((c) => c.id).filter(Boolean);
        if (contactIds.length > 0) {
          const { data: memRows, error: memErr } = await supabase
            .from("pulse_list_contacts")
            .select("contact_id, list_id, pulse_lists(id, name, syncs_to_attio)")
            .in("contact_id", contactIds);
          if (memErr) {
            console.error("[contacts page] memberships query failed:", memErr);
          }
          if (!cancelled) {
            const m = new Map();
            for (const row of memRows || []) {
              const list = row.pulse_lists;
              if (!list?.id) continue;
              const arr = m.get(row.contact_id) || [];
              arr.push({ id: list.id, name: list.name, syncs_to_attio: !!list.syncs_to_attio });
              m.set(row.contact_id, arr);
            }
            setMemberships(m);
          }
        }
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

  // Distinct facet values used to populate the new filter dropdowns.
  // Industry comes off the contact's parent company. City/State come off
  // the contact row first (Apollo enrichment populates them), falling back
  // to the company row if the contact is missing geo.
  const facets = useMemo(() => {
    const industries = new Set();
    const cities = new Set();
    const states = new Set();
    const lists = new Map();
    for (const c of rows) {
      const ind = c.company?.industry;
      if (ind) industries.add(String(ind).trim());
      const city = c.city || c.company?.city;
      if (city) cities.add(String(city).trim());
      const st = c.state || c.company?.state;
      if (st) states.add(String(st).trim());
      const ms = memberships.get(c.id) || [];
      for (const m of ms) lists.set(m.id, m.name);
    }
    return {
      industries: Array.from(industries).sort((a, b) => a.localeCompare(b)),
      cities: Array.from(cities).sort((a, b) => a.localeCompare(b)),
      states: Array.from(states).sort((a, b) => a.localeCompare(b)),
      lists: Array.from(lists.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [rows, memberships]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      const verified =
        c.verified_by_provider === true ||
        c.email_verified === true ||
        ["verified", "valid", "deliverable"].includes(
          String(c.email_verification_status || "").toLowerCase(),
        );
      if (companyFilter !== "all" && c.company_id !== companyFilter) return false;
      if (statusFilter === "verified" && !verified) return false;
      if (statusFilter === "with_email" && !c.email) return false;
      if (statusFilter === "with_phone" && !c.phone) return false;
      if (industryFilter !== "all" && c.company?.industry !== industryFilter) return false;
      if (cityFilter !== "all" && (c.city || c.company?.city) !== cityFilter) return false;
      if (stateFilter_ !== "all" && (c.state || c.company?.state) !== stateFilter_) return false;
      if (listFilter !== "all") {
        const ms = memberships.get(c.id) || [];
        if (!ms.some((m) => m.id === listFilter)) return false;
      }
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
  }, [rows, query, companyFilter, statusFilter, industryFilter, cityFilter, stateFilter_, listFilter, memberships]);

  // Mutation handlers — keep local memberships state in sync so the UI
  // updates without a refetch. The DB writes happen optimistically; on
  // failure we revert and surface a console error (toast layer is per-page).
  const handleRemoveFromList = useCallback(async (contactId, listId) => {
    setMemberships((prev) => {
      const next = new Map(prev);
      const arr = (next.get(contactId) || []).filter((m) => m.id !== listId);
      if (arr.length) next.set(contactId, arr);
      else next.delete(contactId);
      return next;
    });
    const res = await removeContactFromList(listId, contactId);
    if (!res.ok) {
      console.error("[contacts page] removeContactFromList failed:", res);
      // Refetch memberships from DB to recover from drift.
      const { data: memRows } = await supabase
        .from("pulse_list_contacts")
        .select("contact_id, list_id, pulse_lists(id, name, syncs_to_attio)")
        .eq("contact_id", contactId);
      const arr = (memRows || [])
        .map((row) => row.pulse_lists)
        .filter(Boolean)
        .map((l) => ({ id: l.id, name: l.name, syncs_to_attio: !!l.syncs_to_attio }));
      setMemberships((prev) => {
        const next = new Map(prev);
        if (arr.length) next.set(contactId, arr);
        else next.delete(contactId);
        return next;
      });
    }
  }, []);

  // Called by AddToListPicker after a successful add — pull the membership
  // for this contact again and merge it in.
  const handleListAdded = useCallback(async (contactId) => {
    const { data: memRows } = await supabase
      .from("pulse_list_contacts")
      .select("contact_id, list_id, pulse_lists(id, name, syncs_to_attio)")
      .eq("contact_id", contactId);
    const arr = (memRows || [])
      .map((row) => row.pulse_lists)
      .filter(Boolean)
      .map((l) => ({ id: l.id, name: l.name, syncs_to_attio: !!l.syncs_to_attio }));
    setMemberships((prev) => {
      const next = new Map(prev);
      if (arr.length) next.set(contactId, arr);
      else next.delete(contactId);
      return next;
    });
  }, []);

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
              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                disabled={facets.industries.length === 0}
                className="font-body rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900 disabled:opacity-40"
              >
                <option value="all">All industries</option>
                {facets.industries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                disabled={facets.lists.length === 0}
                className="font-body rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900 disabled:opacity-40"
              >
                <option value="all">All lists</option>
                {facets.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                value={stateFilter_}
                onChange={(e) => setStateFilter_(e.target.value)}
                disabled={facets.states.length === 0}
                className="font-body rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900 disabled:opacity-40"
              >
                <option value="all">All states</option>
                {facets.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                disabled={facets.cities.length === 0}
                className="font-body rounded-md border-[1.5px] border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] text-slate-900 disabled:opacity-40"
              >
                <option value="all">All cities</option>
                {facets.cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
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
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <LitSkeletonRow count={6} />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white">
                <LitEmptyState
                  icon={<UserPlus className="h-5 w-5" />}
                  title="No saved contacts yet"
                  body={
                    <>
                      Save a company, open its Contacts tab, and run{" "}
                      <strong className="text-slate-700">Find contacts with LIT</strong>{" "}
                      to populate this list with verified buying-committee names.
                    </>
                  }
                  primary={{
                    label: "Search companies",
                    to: "/app/search",
                    icon: <Search className="h-3 w-3" />,
                  }}
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white">
                <LitEmptyState
                  size="sm"
                  title="No contacts match this filter"
                  body="Try a broader title, role, or seniority filter — or clear filters to see everything."
                  primary={{
                    label: "Clear filters",
                    onClick: () => {
                      setQuery("");
                      setCompanyFilter("all");
                      setStatusFilter("all");
                      setIndustryFilter("all");
                      setCityFilter("all");
                      setStateFilter_("all");
                      setListFilter("all");
                    },
                  }}
                />
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
                        "Industry",
                        "Lists",
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
                        memberships={memberships.get(c.id) || []}
                        onRemoveFromList={(listId) => handleRemoveFromList(c.id, listId)}
                        onAddToList={() =>
                          setPickerTarget({
                            contactId: c.id,
                            companyId: c.company_id || null,
                            contactName: c.full_name || c.first_name || "Contact",
                          })
                        }
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

      {/* Per-row Add-to-list picker. Mounted once at page level so
          the modal can render on top of the table. Closing it clears
          the target. Successful add triggers a membership refetch for
          the affected contact via handleListAdded. */}
      <AddToListPicker
        open={Boolean(pickerTarget)}
        onClose={() => setPickerTarget(null)}
        contactId={pickerTarget?.contactId || null}
        contactName={pickerTarget?.contactName || ""}
        companyId={pickerTarget?.companyId || null}
        onSaved={() => {
          if (pickerTarget?.contactId) handleListAdded(pickerTarget.contactId);
        }}
      />
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

function ContactRow({ contact, memberships = [], onOpenCompany, onRemoveFromList, onAddToList }) {
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
      <td className="font-body px-3.5 py-2.5 text-[11px] text-slate-600">
        {contact.company?.industry ? (
          <span className="inline-block max-w-[160px] truncate" title={contact.company.industry}>
            {contact.company.industry}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
          {memberships.length === 0 ? (
            <span className="font-body text-[10.5px] text-slate-400">No lists</span>
          ) : (
            memberships.map((m) => (
              <span
                key={m.id}
                className={[
                  "font-display group inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  m.syncs_to_attio
                    ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                    : "border-blue-200 bg-blue-50 text-blue-700",
                ].join(" ")}
                title={m.syncs_to_attio ? `${m.name} — syncs to Attio` : m.name}
              >
                <span className="max-w-[120px] truncate">{m.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromList?.(m.id);
                  }}
                  title={`Remove from ${m.name}`}
                  className="ml-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:bg-slate-900/10 hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          )}
          <button
            type="button"
            onClick={onAddToList}
            title="Add to list"
            className="font-display inline-flex h-5 items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-1.5 text-[10px] font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-700"
          >
            <Plus className="h-2.5 w-2.5" />
            Add
          </button>
        </div>
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
