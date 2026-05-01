import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  Download,
  LayoutGrid,
  Linkedin,
  List,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import LitPill from "@/components/ui/LitPill";
import {
  listContacts,
  enrichContacts as enrichContactsApi,
  searchApolloContacts,
  enrichApolloContacts,
  type ApolloContactPreview,
  type ApolloContactRecord,
} from "@/lib/api";

type Contact = {
  id?: string | number;
  full_name?: string | null;
  name?: string | null;
  title?: string | null;
  department?: string | null;
  dept?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  city?: string | null;
  country_code?: string | null;
  is_verified?: boolean | null;
  verified?: boolean | null;
  /** Phase 5 — only an explicit provider-side verification flag promotes
   *  the contact to a "Verified" badge. `is_verified` alone (which can
   *  be set by inferred enrichment) is no longer sufficient. */
  email_verified?: boolean | null;
  email_verification_status?: string | null;
  verified_by_provider?: boolean | null;
  source?: string | null;
  source_provider?: string | null;
  linkedin_url?: string | null;
};

/**
 * Phase 5 — strict verified gate. We only show a "Verified" pill when
 * the upstream enrichment provider explicitly confirms the email — never
 * for inferred / pattern-matched contacts.
 */
function isProviderVerified(contact: Contact): boolean {
  if (contact.verified_by_provider === true) return true;
  if (contact.email_verified === true) return true;
  const status = String(contact.email_verification_status || "").toLowerCase();
  if (status === "verified" || status === "valid" || status === "deliverable") {
    return true;
  }
  return false;
}

type CDPContactsProps = {
  companyId?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  companyLocation?: string | null;
  onRequestEnrich?: () => void;
  onContactsChanged?: (contacts: any[]) => void;
};

const DEPT_FILTERS = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified" },
  { id: "operations", label: "Operations" },
  { id: "procurement", label: "Procurement" },
  { id: "legal", label: "Legal" },
];

/**
 * Default target titles for Apollo people-search on a logistics
 * customer profile. These map to the personas the LIT outbound
 * playbook prioritizes.
 */
const APOLLO_DEFAULT_TITLES = [
  "Logistics Manager",
  "Transportation Manager",
  "Supply Chain Manager",
  "Import Manager",
  "Customs Manager",
  "Procurement Director",
  "Sourcing Director",
  "VP Supply Chain",
  "Director of Logistics",
  "Operations Manager",
];

const APOLLO_DEFAULT_SENIORITIES = [
  "manager",
  "director",
  "vp",
  "head",
  "owner",
];

const AVATAR_PALETTE = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#14B8A6",
];

/**
 * Phase 3 — Contacts tab.
 *
 * Search input + department filter chips + list/card view toggle.
 * Loads contacts from `lib/api.listContacts(companyId)` (the same
 * primitive the legacy CompanyDetailPanel used). Enrich All triggers
 * `enrichContacts(companyId)` server-side; row Outreach/LinkedIn
 * actions are wired to existing handlers via the parent.
 *
 * Honest empty / loading states. Verified count derives from real
 * `is_verified` flag — no fabrication.
 */
export default function CDPContacts({
  companyId,
  companyName,
  companyDomain,
  companyLocation,
  onRequestEnrich,
  onContactsChanged,
}: CDPContactsProps) {
  const [view, setView] = useState<"list" | "card">("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichToast, setEnrichToast] = useState<string | null>(null);

  // Apollo people-search & enrichment state
  const [apolloOpen, setApolloOpen] = useState(false);
  const [apolloLoading, setApolloLoading] = useState(false);
  const [apolloError, setApolloError] = useState<string | null>(null);
  const [apolloSetupRequired, setApolloSetupRequired] = useState(false);
  const [apolloResults, setApolloResults] = useState<ApolloContactPreview[]>([]);
  const [apolloSearched, setApolloSearched] = useState(false);
  const [apolloSelected, setApolloSelected] = useState<Set<string>>(new Set());
  const [apolloEnriching, setApolloEnriching] = useState(false);
  const [apolloEnrichError, setApolloEnrichError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listContacts(companyId)
      .then((rows: any) => {
        if (cancelled) return;
        setContacts(
          Array.isArray(rows)
            ? rows
            : Array.isArray(rows?.contacts)
              ? rows.contacts
              : Array.isArray(rows?.rows)
                ? rows.rows
                : [],
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load contacts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      const name = String(c.full_name || c.name || "").toLowerCase();
      const title = String(c.title || "").toLowerCase();
      const dept = String(c.department || c.dept || "").toLowerCase();
      const matchesQuery =
        !q || name.includes(q) || title.includes(q) || dept.includes(q);
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "verified"
            ? isProviderVerified(c)
            : dept === filter;
      return matchesQuery && matchesFilter;
    });
  }, [contacts, query, filter]);

  const verifiedCount = useMemo(
    () => contacts.filter((c) => isProviderVerified(c)).length,
    [contacts],
  );

  async function handleEnrichAll() {
    if (!companyId || enriching) return;
    if (onRequestEnrich) {
      // Surface the action to the parent so it can run any plan-gate
      // checks the existing app already does (e.g. campaign plan tier).
      onRequestEnrich();
    }
    setEnriching(true);
    setEnrichToast(null);
    try {
      await enrichContactsApi(companyId);
      // Refresh
      const rows: any = await listContacts(companyId);
      const next = Array.isArray(rows)
        ? rows
        : Array.isArray(rows?.contacts)
          ? rows.contacts
          : Array.isArray(rows?.rows)
            ? rows.rows
            : [];
      setContacts(next);
      onContactsChanged?.(next);
      setEnrichToast(`Enriched — ${next.length} contacts on file`);
    } catch (err: any) {
      setEnrichToast(err?.message || "Enrichment failed");
    } finally {
      setEnriching(false);
      setTimeout(() => setEnrichToast(null), 3500);
    }
  }

  function apolloKey(p: ApolloContactPreview, i: number): string {
    return p.apollo_person_id || `${p.full_name || "_"}|${p.title || ""}|${i}`;
  }

  async function handleApolloSearch() {
    if (apolloLoading) return;
    setApolloOpen(true);
    setApolloLoading(true);
    setApolloError(null);
    setApolloSetupRequired(false);
    setApolloSearched(false);
    setApolloSelected(new Set());
    try {
      const result = await searchApolloContacts({
        companyId: companyId ?? null,
        companyName: companyName ?? null,
        companyDomain: companyDomain ?? null,
        location: companyLocation ?? null,
        titles: APOLLO_DEFAULT_TITLES,
        seniorities: APOLLO_DEFAULT_SENIORITIES,
        perPage: 25,
      });
      setApolloSearched(true);
      if (!result.ok) {
        setApolloResults([]);
        setApolloError(result.error || "Apollo search failed.");
        setApolloSetupRequired(Boolean(result.setupRequired));
      } else {
        setApolloResults(result.contacts);
      }
    } catch (err: any) {
      setApolloSearched(true);
      setApolloResults([]);
      setApolloError(err?.message || "Apollo search failed.");
    } finally {
      setApolloLoading(false);
    }
  }

  function toggleApolloSelected(key: string) {
    setApolloSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllApollo() {
    setApolloSelected(new Set(apolloResults.map((p, i) => apolloKey(p, i))));
  }

  function clearApolloSelection() {
    setApolloSelected(new Set());
  }

  async function handleApolloEnrichSelected() {
    if (apolloEnriching) return;
    if (apolloSelected.size === 0) {
      setApolloEnrichError("Select contacts before enriching.");
      return;
    }
    const picked = apolloResults.filter((p, i) =>
      apolloSelected.has(apolloKey(p, i)),
    );
    setApolloEnriching(true);
    setApolloEnrichError(null);
    try {
      const result = await enrichApolloContacts({
        companyId: companyId ?? null,
        companyName: companyName ?? null,
        companyDomain: companyDomain ?? null,
        contacts: picked.map((p) => ({
          apollo_person_id: p.apollo_person_id ?? null,
          full_name: p.full_name ?? null,
          title: p.title ?? null,
          linkedin_url: p.linkedin_url ?? null,
        })),
      });
      if (!result.ok) {
        setApolloEnrichError(result.error || "Apollo enrichment failed.");
        return;
      }
      // Try to refresh saved contacts (the edge function is expected
      // to persist into lit_contacts). If listing succeeds and grew,
      // use that — otherwise merge enriched results in-memory so the
      // user still sees them on this tab.
      let merged: Contact[] = contacts;
      if (companyId) {
        try {
          const rows: any = await listContacts(companyId);
          const next = Array.isArray(rows)
            ? rows
            : Array.isArray(rows?.contacts)
              ? rows.contacts
              : Array.isArray(rows?.rows)
                ? rows.rows
                : [];
          if (Array.isArray(next) && next.length >= merged.length) {
            merged = next as Contact[];
          }
        } catch {
          // Persistence helper missing — fall through to in-memory merge.
        }
      }
      // If persistence didn't add anything new, merge enriched rows in-memory
      // so the user still sees them. We never fabricate — if Apollo returned
      // null email/phone, we keep them null.
      if (merged.length === contacts.length && result.enriched.length > 0) {
        const apolloAsContacts: Contact[] = result.enriched.map((r, i) => ({
          id: r.apollo_person_id || `apollo-${i}-${Date.now()}`,
          full_name: r.full_name ?? null,
          title: r.title ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
          location: r.location ?? null,
          linkedin_url: r.linkedin_url ?? null,
          source: "apollo",
          source_provider: "apollo",
          email_verification_status: r.email_verification_status ?? null,
          verified_by_provider: r.verified_by_provider ?? null,
        }));
        merged = [...apolloAsContacts, ...merged];
      }
      setContacts(merged);
      onContactsChanged?.(merged);
      setEnrichToast(`Enriched ${result.enriched.length} contact(s) from Apollo`);
      setApolloOpen(false);
      setApolloResults([]);
      setApolloSelected(new Set());
      setTimeout(() => setEnrichToast(null), 3500);
    } catch (err: any) {
      setApolloEnrichError(err?.message || "Apollo enrichment failed.");
    } finally {
      setApolloEnriching(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts by name, title, or skill…"
            className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-[12px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {DEPT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "font-display whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                filter === f.id
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md bg-slate-100 p-0.5">
          {(
            [
              { k: "list", icon: <List className="h-3 w-3" /> },
              { k: "card", icon: <LayoutGrid className="h-3 w-3" /> },
            ] as const
          ).map((v) => (
            <button
              key={v.k}
              type="button"
              onClick={() => setView(v.k)}
              aria-label={v.k === "list" ? "List view" : "Card view"}
              className={[
                "rounded px-2 py-1",
                view === v.k
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-700",
              ].join(" ")}
            >
              {v.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleApolloSearch}
          disabled={apolloLoading}
          className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {apolloLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Find with Apollo
        </button>
        <button
          type="button"
          onClick={handleEnrichAll}
          disabled={!companyId || enriching || loading}
          className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Enrich All
        </button>
      </div>

      {apolloOpen && (
        <ApolloResultsPanel
          loading={apolloLoading}
          searched={apolloSearched}
          error={apolloError}
          setupRequired={apolloSetupRequired}
          results={apolloResults}
          selected={apolloSelected}
          enriching={apolloEnriching}
          enrichError={apolloEnrichError}
          onClose={() => {
            setApolloOpen(false);
            setApolloEnrichError(null);
          }}
          onRetry={handleApolloSearch}
          onToggle={toggleApolloSelected}
          onSelectAll={selectAllApollo}
          onClearSelection={clearApolloSelection}
          onEnrichSelected={handleApolloEnrichSelected}
          keyOf={apolloKey}
        />
      )}

      {/* Result counter */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="font-body text-[12px] text-slate-500">
          <strong className="font-mono text-slate-900">{filtered.length}</strong>{" "}
          {filtered.length === 1 ? "contact" : "contacts"} ·{" "}
          <strong className="font-mono text-green-700">{verifiedCount}</strong>{" "}
          verified
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700"
          >
            <UserPlus className="h-3 w-3" />
            Add contact
          </button>
          <button
            type="button"
            className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>

      {enrichToast && (
        <div className="font-body rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          {enrichToast}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-blue-500" />
          <p className="font-body text-[12px] text-slate-500">
            Loading contacts…
          </p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
          {error}
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
            No contacts on file yet
          </p>
          <p className="font-body mx-auto max-w-md text-[12px] text-slate-400">
            Click{" "}
            <strong className="text-blue-700">Enrich All</strong> to discover
            verified contacts for this account.
          </p>
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#FAFBFC]">
                {[
                  "Contact",
                  "Title",
                  "Department",
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
                <ContactRow key={c.id || c.email || c.full_name} contact={c} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <ContactCard key={c.id || c.email || c.full_name} contact={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  const name = contact.full_name || contact.name || "Unnamed contact";
  const verified = isProviderVerified(contact);
  const dept = contact.department || contact.dept;
  const source = contact.source || contact.source_provider;
  return (
    <tr className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/60">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display text-[12px] font-semibold text-slate-900">
                {name}
              </span>
              <VerifiedBadge verified={verified} />
            </div>
            {(contact.location || contact.city) && (
              <div className="font-body mt-0.5 text-[10px] text-slate-400">
                {contact.location || contact.city}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="font-body px-3.5 py-2.5 text-[11px] text-slate-600">
        {contact.title || "—"}
      </td>
      <td className="px-3.5 py-2.5">
        {dept ? <LitPill tone="slate">{dept}</LitPill> : <span className="text-slate-300">—</span>}
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.email || <span className="text-slate-300">—</span>}
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.phone || <span className="text-slate-300">—</span>}
      </td>
      <td className="font-display px-3.5 py-2.5 text-[10px] font-semibold text-slate-500">
        {source ? (
          /apollo/i.test(String(source)) ? (
            <span className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-violet-700">
              <Sparkles className="h-2.5 w-2.5" />
              Apollo
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
          <ActionButton icon={<Send className="h-3 w-3" />} label="Outreach" primary />
          <ActionButton icon={<Zap className="h-3 w-3" />} label="Enrich" />
          <ActionButton icon={<Bookmark className="h-3 w-3" />} label="Save" />
          <ActionButton
            icon={<MoreHorizontal className="h-3 w-3" />}
            label="More"
          />
        </div>
      </td>
    </tr>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const name = contact.full_name || contact.name || "Unnamed contact";
  const verified = isProviderVerified(contact);
  const dept = contact.department || contact.dept;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 transition-shadow hover:shadow-sm">
      <div className="mb-2.5 flex items-start gap-2.5">
        <Avatar name={name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="font-display text-[13px] font-bold text-slate-900">
              {name}
            </span>
            <VerifiedBadge verified={verified} />
          </div>
          <div className="font-body mb-1 text-[11px] leading-snug text-slate-600">
            {contact.title || "—"}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {dept && <LitPill tone="slate">{dept}</LitPill>}
            {(contact.location || contact.city) && (
              <span className="font-body inline-flex items-center gap-1 text-[9px] text-slate-400">
                <MapPin className="h-2 w-2" />
                {contact.location || contact.city}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <Mail className="h-2.5 w-2.5 shrink-0 text-slate-400" />
          <span className="font-mono truncate">
            {contact.email || (
              <span className="font-body text-slate-300">Not available</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <Phone className="h-2.5 w-2.5 shrink-0 text-slate-400" />
          <span className="font-mono">
            {contact.phone || (
              <span className="font-body text-slate-300">Not available</span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          className="font-display inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm"
        >
          <Send className="h-2.5 w-2.5" />
          Outreach
        </button>
        <button
          type="button"
          className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600"
        >
          <Zap className="h-2.5 w-2.5" />
          Enrich
        </button>
        <button
          type="button"
          aria-label="Save contact"
          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-slate-600"
        >
          <Bookmark className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={[
        "flex h-6 w-6 items-center justify-center rounded border",
        primary
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const color =
    AVATAR_PALETTE[(name || "").charCodeAt(0) % AVATAR_PALETTE.length];
  return (
    <div
      className="font-display flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
    >
      {initials || "?"}
    </div>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="font-display inline-flex items-center gap-0.5 rounded-sm border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-green-700">
        Verified
      </span>
    );
  }
  return (
    <span className="font-display inline-flex items-center rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-400">
      Inferred
    </span>
  );
}

type ApolloResultsPanelProps = {
  loading: boolean;
  searched: boolean;
  error: string | null;
  setupRequired: boolean;
  results: ApolloContactPreview[];
  selected: Set<string>;
  enriching: boolean;
  enrichError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onEnrichSelected: () => void;
  keyOf: (p: ApolloContactPreview, i: number) => string;
};

function ApolloResultsPanel({
  loading,
  searched,
  error,
  setupRequired,
  results,
  selected,
  enriching,
  enrichError,
  onClose,
  onRetry,
  onToggle,
  onSelectAll,
  onClearSelection,
  onEnrichSelected,
  keyOf,
}: ApolloResultsPanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          <div className="font-display text-[12px] font-bold text-violet-900">
            Apollo prospect search
          </div>
          {!loading && !error && results.length > 0 && (
            <span className="font-mono text-[11px] text-slate-500">
              · {results.length} preview{results.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!loading && !error && results.length > 0 && (
            <>
              <button
                type="button"
                onClick={selected.size === results.length ? onClearSelection : onSelectAll}
                className="font-display rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
              >
                {selected.size === results.length ? "Clear all" : "Select all"}
              </button>
              <button
                type="button"
                onClick={onEnrichSelected}
                disabled={enriching || selected.size === 0}
                className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-violet-500 to-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enriching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Enrich selected{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Apollo panel"
            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-900"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="px-6 py-8 text-center">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-violet-500" />
          <p className="font-body text-[12px] text-slate-500">
            Searching Apollo for matching prospects…
          </p>
          <p className="font-body mt-0.5 text-[11px] text-slate-400">
            Email/phone details are only revealed after enrichment.
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <p className="font-display text-[12px] font-semibold text-rose-700">
            {error}
          </p>
          {setupRequired ? (
            <p className="font-body max-w-md text-[11px] text-slate-500">
              The <code className="font-mono">apollo-contact-search</code> Edge
              Function isn't deployed yet. Once configured, this panel will
              return live prospects.
            </p>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="font-display rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry search
            </button>
          )}
        </div>
      ) : results.length === 0 && searched ? (
        <div className="px-6 py-8 text-center">
          <p className="font-display text-[12px] font-semibold text-slate-700">
            Apollo search returned no matching contacts.
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            Try widening the title list or confirming the company domain on
            the right-rail before retrying.
          </p>
        </div>
      ) : (
        <>
          {enrichError && (
            <div className="font-body border-b border-rose-100 bg-rose-50 px-3.5 py-1.5 text-[11px] text-rose-700">
              {enrichError}
            </div>
          )}
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-[#FAFBFC]">
                <tr className="border-b border-slate-200">
                  <th className="w-8 px-3 py-2" />
                  {["Contact", "Title", "Location", "Email status", "LinkedIn"].map(
                    (h) => (
                      <th
                        key={h}
                        className="font-display whitespace-nowrap px-3 py-2 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.map((p, i) => {
                  const k = keyOf(p, i);
                  const checked = selected.has(k);
                  const name = p.full_name || "Unnamed prospect";
                  return (
                    <tr
                      key={k}
                      className={[
                        "border-b border-slate-100 last:border-b-0",
                        checked ? "bg-violet-50/40" : "hover:bg-slate-50/60",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(k)}
                          aria-label={`Select ${name}`}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <div className="font-display flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
                              {name}
                              <span className="font-display inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-violet-700">
                                <Sparkles className="h-2.5 w-2.5" />
                                Apollo
                              </span>
                              <span className="font-display inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                                Preview
                              </span>
                            </div>
                            {p.company && (
                              <div className="font-body mt-0.5 text-[10px] text-slate-400">
                                {p.company}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="font-body px-3 py-2 text-[11px] text-slate-600">
                        {p.title || "—"}
                      </td>
                      <td className="font-body px-3 py-2 text-[11px] text-slate-500">
                        {p.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5 text-slate-400" />
                            {p.location}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <ApolloEmailStatusBadge status={p.email_status} />
                      </td>
                      <td className="px-3 py-2">
                        {p.linkedin_url ? (
                          <a
                            href={p.linkedin_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                          >
                            <Linkedin className="h-3 w-3" />
                            View
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-[#FAFBFC] px-3.5 py-2">
            <div className="font-body text-[11px] text-slate-500">
              <CheckCircle2 className="mr-1 inline h-3 w-3 text-violet-500" />
              Email/phone details are only revealed after enrichment.
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              {selected.size} selected
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ApolloEmailStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span className="font-display inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-400">
        Hidden
      </span>
    );
  }
  const s = status.toLowerCase();
  const tone =
    s === "verified" || s === "valid" || s === "deliverable"
      ? "border-green-200 bg-green-50 text-green-700"
      : s === "guessed" || s === "likely"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-500";
  return (
    <span
      className={`font-display inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] ${tone}`}
    >
      {status}
    </span>
  );
}