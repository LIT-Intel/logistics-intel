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
  addCompanyToCampaign,
  getCrmCampaigns,
  type ApolloContactPreview,
  type ApolloContactRecord,
} from "@/lib/api";
import {
  computeContactScore,
  tierTone,
  type ContactScoreResult,
} from "@/lib/contactScore";

type Contact = {
  id?: string | number;
  full_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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
  apollo_person_id?: string | null;
  enriched_at?: string | null;
  enrichment_status?: string | null;
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

  // Filter state — scoped to the current company. The edge function
  // enforces actual scoping; titles/seniorities are simply hints we
  // pass through. Defaults match the LIT outbound playbook personas.
  const [apolloTitles, setApolloTitles] = useState<string[]>(APOLLO_DEFAULT_TITLES);
  const [apolloSeniorities, setApolloSeniorities] = useState<string[]>(APOLLO_DEFAULT_SENIORITIES);
  const [apolloDepartments, setApolloDepartments] = useState<string[]>([]);
  // Editable company name + domain (locked-by-default, but user can
  // override before re-running). Default to the company props.
  const [searchCompanyName, setSearchCompanyName] = useState<string>(
    companyName ?? "",
  );
  const [searchCompanyDomain, setSearchCompanyDomain] = useState<string>(
    companyDomain ?? "",
  );
  const [searchCity, setSearchCity] = useState<string>("");
  const [searchState, setSearchState] = useState<string>("");
  const [searchCountry, setSearchCountry] = useState<string>("");
  // Default OFF: scope by employer HQ (organization_locations[]).
  // ON: scope by where the contact lives (person_locations[]).
  const [usePersonLocations, setUsePersonLocations] = useState<boolean>(false);

  // Match-mode response from the edge function (which strategy hit).
  const [searchMatchMode, setSearchMatchMode] = useState<
    "organization_id" | "domain" | "name_location_fallback" | "none" | null
  >(null);
  const [searchOrgMatch, setSearchOrgMatch] = useState<{
    id: string | null;
    name: string | null;
    primary_domain: string | null;
  } | null>(null);

  // Re-sync editable copies when the underlying company changes.
  useEffect(() => {
    setSearchCompanyName(companyName ?? "");
  }, [companyName]);
  useEffect(() => {
    setSearchCompanyDomain(companyDomain ?? "");
  }, [companyDomain]);

  // Add-contact modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Detail drawer state — opened by clicking a contact row name.
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

  // Outreach modal state — opened by the row's Send button.
  const [outreachContact, setOutreachContact] = useState<Contact | null>(null);

  // Per-row "More" dropdown state — keyed by row id.
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null);

  // Include-similar-titles search filter (default OFF). When ON the
  // edge function relaxes its title strictness; we forward this hint
  // to Apollo people-search.
  const [includeSimilarTitles, setIncludeSimilarTitles] = useState(false);

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
    setSearchMatchMode(null);
    setSearchOrgMatch(null);

    // We can search if we have EITHER a domain OR a company name. The
    // edge function will resolve via Apollo Organization Search using
    // whichever signal is available, then fall back as needed.
    const effectiveDomain = (searchCompanyDomain || "").trim();
    const effectiveName = (searchCompanyName || "").trim();
    if (!effectiveDomain && !effectiveName) {
      setApolloLoading(false);
      setApolloSearched(true);
      setApolloError(
        "Add either a company domain, name, or location before searching contacts.",
      );
      setApolloSetupRequired(true);
      return;
    }
    try {
      const result = await searchApolloContacts({
        companyId: companyId ?? null,
        companyName: effectiveName || null,
        companyDomain: effectiveDomain || null,
        city: searchCity.trim() || null,
        state: searchState.trim() || null,
        country: searchCountry.trim() || null,
        usePersonLocations,
        includeSimilarTitles,
        titles: apolloTitles.length ? apolloTitles : APOLLO_DEFAULT_TITLES,
        seniorities: apolloSeniorities.length
          ? apolloSeniorities
          : APOLLO_DEFAULT_SENIORITIES,
        departments: apolloDepartments,
        perPage: 50,
      });
      setApolloSearched(true);
      setSearchMatchMode(result.matchMode ?? null);
      setSearchOrgMatch(result.organization ?? null);
      if (!result.ok) {
        setApolloResults([]);
        setApolloError(result.error || "Contact search failed.");
        setApolloSetupRequired(Boolean(result.setupRequired));
      } else {
        setApolloResults(result.contacts);
        if (result.contacts.length === 0 && result.message) {
          // Honest empty state — surface the precise message.
          setApolloError(result.message);
          setApolloSetupRequired(false);
        }
      }
    } catch (err: any) {
      setApolloSearched(true);
      setApolloResults([]);
      setApolloError(err?.message || "Contact search failed.");
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
    // Build a map of apollo_person_id → preview index so we can update
    // the right rows in-place after enrichment returns.
    const pickedKeys = Array.from(apolloSelected);
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
        // Pass every identifier we have so Apollo enrichment has the
        // best chance of matching. The edge function refuses
        // too-weak identifiers before billing a credit.
        contacts: picked.map((p) => ({
          apollo_person_id: p.apollo_person_id ?? null,
          id: p.apollo_person_id ?? null,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          full_name:
            p.full_name ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            null,
          name:
            p.full_name ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            null,
          title: p.title ?? null,
          linkedin_url: p.linkedin_url ?? null,
          domain: companyDomain ?? null,
          organization_name: p.company ?? companyName ?? null,
        })),
      });
      if (!result.ok) {
        setApolloEnrichError(result.error || "Contact enrichment failed.");
        return;
      }

      // Index the enriched results by apollo_person_id for in-place updates.
      // The upstream provider may return a slightly different person count
      // than we requested (no_match), so positional matching is unreliable.
      const enrichedById = new Map<string, ApolloContactRecord>();
      result.enriched.forEach((r) => {
        const key = r.apollo_person_id || "";
        if (key) enrichedById.set(key, r);
      });

      // 1. Update searchResults in place — DO NOT clear apolloResults.
      //    Selected rows that came back enriched flip their status to
      //    "enriched" and merge in email/phone/etc. Unselected rows stay
      //    untouched. Selected rows with no match keep their preview row
      //    so the user can see exactly which selections didn't enrich.
      setApolloResults((prev) =>
        prev.map((p, i) => {
          const k = apolloKey(p, i);
          if (!apolloSelected.has(k)) return p;
          const match =
            (p.apollo_person_id && enrichedById.get(p.apollo_person_id)) || null;
          if (!match) {
            return { ...p, enrichment_status: "failed" as const };
          }
          return {
            ...p,
            ...match,
            // Preserve the preview's full_name / first / last when the
            // enriched payload doesn't echo them back.
            full_name: match.full_name ?? p.full_name ?? null,
            first_name: match.first_name ?? p.first_name ?? null,
            last_name: match.last_name ?? p.last_name ?? null,
            enrichment_status: "enriched" as const,
          };
        }),
      );

      // 2. Upsert enriched contacts into the saved-contacts list
      //    immediately (no clobber, no waiting on the round-trip). Match
      //    by apollo_person_id so re-enrich just merges fields.
      //    Compute display name with the canonical fallback: never
      //    leave a saved contact as "Unnamed contact" if first_name
      //    exists.
      const upsertedRows: Contact[] = result.enriched.map((r) => {
        const fullName =
          r.full_name ||
          [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
          r.first_name ||
          null;
        return {
          id: r.apollo_person_id || `apollo-${Date.now()}-${Math.random()}`,
          full_name: fullName,
          first_name: (r as any).first_name ?? null,
          last_name: (r as any).last_name ?? null,
          name: fullName,
          title: r.title ?? null,
          department: (r as any).department ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
          location: r.location ?? null,
          linkedin_url: r.linkedin_url ?? null,
          source: "lit",
          source_provider: "lit",
          apollo_person_id: r.apollo_person_id ?? null,
          enriched_at: r.enriched_at ?? new Date().toISOString(),
          enrichment_status: "enriched",
          email_verification_status: r.email_verification_status ?? null,
          verified_by_provider: r.verified_by_provider ?? null,
        } as any;
      });
      const upsertedById = new Map(
        upsertedRows.map((row) => [String(row.id), row]),
      );
      setContacts((prev) => {
        const next = prev.map((c) => {
          const k = String(c.id ?? "");
          const fresh = upsertedById.get(k);
          return fresh ? { ...c, ...fresh } : c;
        });
        const existingIds = new Set(next.map((c) => String(c.id ?? "")));
        for (const row of upsertedRows) {
          if (!existingIds.has(String(row.id))) next.unshift(row);
        }
        onContactsChanged?.(next);
        return next;
      });

      // 3. Refetch saved contacts in the background so RLS-persisted
      //    rows take precedence — but never clear searchResults, never
      //    close the panel.
      if (companyId) {
        listContacts(companyId)
          .then((rows: any) => {
            const next = Array.isArray(rows)
              ? rows
              : Array.isArray(rows?.contacts)
                ? rows.contacts
                : Array.isArray(rows?.rows)
                  ? rows.rows
                  : [];
            if (Array.isArray(next) && next.length > 0) {
              setContacts(next as Contact[]);
              onContactsChanged?.(next);
            }
          })
          .catch(() => {
            // persistence helper may be missing; in-memory upsert is enough.
          });
      }

      setEnrichToast(
        `Enriched ${result.enriched.length} contact${result.enriched.length === 1 ? "" : "s"}`,
      );
      // Clear selection (the rows are now Enriched), but keep the panel
      // open and the search results visible.
      setApolloSelected(new Set());
      setTimeout(() => setEnrichToast(null), 3500);
    } catch (err: any) {
      setApolloEnrichError(err?.message || "Contact enrichment failed.");
    } finally {
      setApolloEnriching(false);
    }
  }

  // ── Row-level action handlers ────────────────────────────────────

  /** Re-enrich a single saved contact via /people/match. Skipped if
   *  already enriched to avoid burning a credit. */
  async function handleRowEnrich(c: Contact) {
    if (String(c.enrichment_status || "").toLowerCase() === "enriched") {
      setEnrichToast("Already enriched");
      setTimeout(() => setEnrichToast(null), 2000);
      return;
    }
    if (!c.apollo_person_id && !c.linkedin_url && !c.full_name) {
      setEnrichToast(
        "Need a name + LinkedIn or domain before enriching this contact.",
      );
      setTimeout(() => setEnrichToast(null), 3000);
      return;
    }
    try {
      const result = await enrichApolloContacts({
        companyId: companyId ?? null,
        companyName: companyName ?? null,
        companyDomain: companyDomain ?? null,
        contacts: [
          {
            apollo_person_id: c.apollo_person_id ?? null,
            id: c.apollo_person_id ?? null,
            first_name: c.first_name ?? null,
            last_name: c.last_name ?? null,
            full_name: c.full_name ?? c.name ?? null,
            name: c.full_name ?? c.name ?? null,
            email: c.email ?? null,
            linkedin_url: c.linkedin_url ?? null,
            domain: companyDomain ?? null,
            organization_name: companyName ?? null,
            title: c.title ?? null,
          },
        ],
      });
      if (!result.ok || result.enriched.length === 0) {
        setEnrichToast(result.error || "Enrichment returned no match.");
        setTimeout(() => setEnrichToast(null), 3000);
        return;
      }
      const r = result.enriched[0];
      setContacts((prev) =>
        prev.map((x) =>
          String(x.id) === String(c.id)
            ? ({
                ...x,
                full_name: r.full_name ?? x.full_name ?? null,
                first_name: (r as any).first_name ?? x.first_name ?? null,
                last_name: (r as any).last_name ?? x.last_name ?? null,
                title: r.title ?? x.title ?? null,
                email: r.email ?? x.email ?? null,
                phone: r.phone ?? x.phone ?? null,
                linkedin_url: r.linkedin_url ?? x.linkedin_url ?? null,
                apollo_person_id: r.apollo_person_id ?? x.apollo_person_id ?? null,
                enrichment_status: "enriched",
                enriched_at: r.enriched_at ?? new Date().toISOString(),
                email_verification_status:
                  r.email_verification_status ?? x.email_verification_status ?? null,
                verified_by_provider:
                  r.verified_by_provider ?? x.verified_by_provider ?? null,
              } as Contact)
            : x,
        ),
      );
      setEnrichToast("Contact enriched");
      setTimeout(() => setEnrichToast(null), 2500);
    } catch (err: any) {
      setEnrichToast(err?.message || "Enrichment failed.");
      setTimeout(() => setEnrichToast(null), 3000);
    }
  }

  function handleRowCopyEmail(c: Contact) {
    if (!c.email) {
      setEnrichToast("No email to copy.");
      setTimeout(() => setEnrichToast(null), 1800);
      return;
    }
    navigator.clipboard?.writeText(String(c.email)).catch(() => {});
    setEnrichToast("Email copied");
    setTimeout(() => setEnrichToast(null), 1500);
  }

  function handleRowCopyLinkedin(c: Contact) {
    if (!c.linkedin_url) {
      setEnrichToast("No LinkedIn URL on this contact.");
      setTimeout(() => setEnrichToast(null), 1800);
      return;
    }
    navigator.clipboard?.writeText(String(c.linkedin_url)).catch(() => {});
    setEnrichToast("LinkedIn URL copied");
    setTimeout(() => setEnrichToast(null), 1500);
  }

  function handleRowRemove(c: Contact) {
    setContacts((prev) => {
      const next = prev.filter((x) => String(x.id) !== String(c.id));
      onContactsChanged?.(next);
      return next;
    });
    setEnrichToast("Contact removed from view");
    setTimeout(() => setEnrichToast(null), 2000);
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
          onClick={() => setAddOpen(true)}
          className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <UserPlus className="h-3 w-3" />
          Add contact
        </button>
        <button
          type="button"
          onClick={handleApolloSearch}
          disabled={apolloLoading}
          className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gradient-to-b from-violet-500 to-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-violet-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {apolloLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {contacts.length === 0
            ? "Find contacts with LIT"
            : "Find more with LIT"}
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
          companyName={searchCompanyName}
          companyDomain={searchCompanyDomain}
          companyLocation={companyLocation ?? null}
          city={searchCity}
          stateField={searchState}
          country={searchCountry}
          usePersonLocations={usePersonLocations}
          includeSimilarTitles={includeSimilarTitles}
          matchMode={searchMatchMode}
          orgMatch={searchOrgMatch}
          titles={apolloTitles}
          seniorities={apolloSeniorities}
          departments={apolloDepartments}
          onCompanyNameChange={setSearchCompanyName}
          onCompanyDomainChange={setSearchCompanyDomain}
          onCityChange={setSearchCity}
          onStateChange={setSearchState}
          onCountryChange={setSearchCountry}
          onUsePersonLocationsChange={setUsePersonLocations}
          onIncludeSimilarTitlesChange={setIncludeSimilarTitles}
          onTitlesChange={setApolloTitles}
          onSenioritiesChange={setApolloSeniorities}
          onDepartmentsChange={setApolloDepartments}
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
      {addOpen && (
        <AddContactModal
          companyId={companyId ?? null}
          saving={addSaving}
          error={addError}
          onClose={() => {
            setAddOpen(false);
            setAddError(null);
          }}
          onSave={async (form) => {
            if (!companyId) {
              setAddError("Save a company first before adding contacts.");
              return;
            }
            setAddSaving(true);
            setAddError(null);
            try {
              const { saveContact } = await import("@/lib/api");
              const saved = await saveContact(companyId, form);
              const next = [saved, ...contacts];
              setContacts(next);
              onContactsChanged?.(next);
              setAddOpen(false);
              setEnrichToast("Contact saved");
              setTimeout(() => setEnrichToast(null), 2500);
            } catch (err: any) {
              setAddError(
                err?.message ||
                  "Couldn't save contact — storage helper missing. Check lib/api.saveContact and the lit_contacts table.",
              );
            } finally {
              setAddSaving(false);
            }
          }}
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
            onClick={() => setAddOpen(true)}
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
                  "Fit",
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
                  key={c.id || c.email || c.full_name}
                  contact={c}
                  handlers={{
                    onOpenDetail: setDetailContact,
                    onOutreach: setOutreachContact,
                    onEnrich: handleRowEnrich,
                    onCopyEmail: handleRowCopyEmail,
                    onCopyLinkedin: handleRowCopyLinkedin,
                    onRemove: handleRowRemove,
                    menuOpenId: openMenuId,
                    onMenuToggle: setOpenMenuId,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <ContactCard
              key={c.id || c.email || c.full_name}
              contact={c}
              onOpenDetail={setDetailContact}
              onOutreach={setOutreachContact}
              onEnrich={handleRowEnrich}
            />
          ))}
        </div>
      )}
      {detailContact && (
        <ContactDetailDrawer
          contact={detailContact}
          companyName={companyName ?? null}
          companyDomain={companyDomain ?? null}
          onClose={() => setDetailContact(null)}
          onCopyEmail={handleRowCopyEmail}
          onCopyLinkedin={handleRowCopyLinkedin}
          onOutreach={(c) => {
            setDetailContact(null);
            setOutreachContact(c);
          }}
          onEnrich={(c) => {
            setDetailContact(null);
            handleRowEnrich(c);
          }}
        />
      )}
      {outreachContact && (
        <OutreachContactModal
          contact={outreachContact}
          companyId={companyId ?? null}
          companyName={companyName ?? null}
          onClose={() => setOutreachContact(null)}
        />
      )}
    </div>
  );
}

type RowHandlers = {
  onOpenDetail: (c: Contact) => void;
  onOutreach: (c: Contact) => void;
  onEnrich: (c: Contact) => void;
  onCopyEmail: (c: Contact) => void;
  onCopyLinkedin: (c: Contact) => void;
  onRemove: (c: Contact) => void;
  menuOpenId: string | number | null;
  onMenuToggle: (id: string | number | null) => void;
};

function ContactRow({
  contact,
  handlers,
}: {
  contact: Contact;
  handlers: RowHandlers;
}) {
  const name =
    contact.full_name ||
    contact.name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    (contact as any).firstName ||
    contact.first_name ||
    "Unnamed contact";
  const verified = isProviderVerified(contact);
  const dept = contact.department || contact.dept;
  const source = contact.source || contact.source_provider;
  const enriched =
    String(contact.enrichment_status || "").toLowerCase() === "enriched";
  const fit = computeContactScore({
    title: contact.title,
    seniority: (contact as any).seniority,
    department: dept,
    email: contact.email,
    email_status: contact.email_verification_status,
    email_verification_status: contact.email_verification_status,
    verified_by_provider: contact.verified_by_provider,
    linkedin_url: contact.linkedin_url,
    enrichment_status: contact.enrichment_status,
  });
  const rowId = String(contact.id ?? contact.email ?? name);
  const menuOpen = handlers.menuOpenId === contact.id;
  return (
    <tr className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/60">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlers.onOpenDetail(contact)}
                className="font-display truncate text-left text-[12px] font-semibold text-slate-900 hover:text-blue-700"
              >
                {name}
              </button>
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
        {dept ? (
          <LitPill tone="slate">{dept}</LitPill>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.email || <span className="text-slate-300">—</span>}
      </td>
      <td className="font-mono px-3.5 py-2.5 text-[10px] text-slate-600">
        {contact.phone || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3.5 py-2.5">
        <FitBadge fit={fit} />
      </td>
      <td className="font-display px-3.5 py-2.5 text-[10px] font-semibold text-slate-500">
        {source ? (
          /apollo|lit/i.test(String(source)) ? (
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
        <div className="relative flex gap-1">
          <ActionButton
            icon={<Send className="h-3 w-3" />}
            label="Outreach"
            primary
            onClick={() => handlers.onOutreach(contact)}
          />
          <ActionButton
            icon={<Zap className="h-3 w-3" />}
            label={enriched ? "Already enriched" : "Enrich"}
            disabled={enriched}
            onClick={() => handlers.onEnrich(contact)}
          />
          <ActionButton
            icon={<Bookmark className="h-3 w-3" />}
            label="Save"
            onClick={() => handlers.onOpenDetail(contact)}
          />
          <ActionButton
            icon={<MoreHorizontal className="h-3 w-3" />}
            label="More"
            onClick={() =>
              handlers.onMenuToggle(menuOpen ? null : (contact.id ?? rowId))
            }
          />
          {menuOpen && (
            <RowMoreMenu
              contact={contact}
              onClose={() => handlers.onMenuToggle(null)}
              onOpenDetail={handlers.onOpenDetail}
              onOutreach={handlers.onOutreach}
              onCopyEmail={handlers.onCopyEmail}
              onCopyLinkedin={handlers.onCopyLinkedin}
              onRemove={handlers.onRemove}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function FitBadge({ fit }: { fit: ContactScoreResult }) {
  return (
    <span
      title={`LIT fit ${fit.score}/100`}
      className={[
        "font-display inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
        tierTone(fit.tier),
      ].join(" ")}
    >
      <span className="font-mono">{fit.score}</span>
      {fit.label}
    </span>
  );
}

function RowMoreMenu({
  contact,
  onClose,
  onOpenDetail,
  onOutreach,
  onCopyEmail,
  onCopyLinkedin,
  onRemove,
}: {
  contact: Contact;
  onClose: () => void;
  onOpenDetail: (c: Contact) => void;
  onOutreach: (c: Contact) => void;
  onCopyEmail: (c: Contact) => void;
  onCopyLinkedin: (c: Contact) => void;
  onRemove: (c: Contact) => void;
}) {
  return (
    <div
      role="menu"
      onMouseLeave={onClose}
      className="font-display absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 shadow-lg"
    >
      <MenuItem onClick={() => { onOpenDetail(contact); onClose(); }}>
        View details
      </MenuItem>
      <MenuItem onClick={() => { onOutreach(contact); onClose(); }}>
        Add to campaign
      </MenuItem>
      <MenuItem onClick={() => { onCopyEmail(contact); onClose(); }}>
        Copy email
      </MenuItem>
      <MenuItem onClick={() => { onCopyLinkedin(contact); onClose(); }}>
        Copy LinkedIn URL
      </MenuItem>
      <MenuItem
        tone="danger"
        onClick={() => { onRemove(contact); onClose(); }}
      >
        Remove from view
      </MenuItem>
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center px-3 py-1.5 text-left",
        tone === "danger"
          ? "text-rose-700 hover:bg-rose-50"
          : "hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ContactCard({
  contact,
  onOpenDetail,
  onOutreach,
  onEnrich,
}: {
  contact: Contact;
  onOpenDetail: (c: Contact) => void;
  onOutreach: (c: Contact) => void;
  onEnrich: (c: Contact) => void;
}) {
  const name =
    contact.full_name ||
    contact.name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    (contact as any).firstName ||
    contact.first_name ||
    "Unnamed contact";
  const verified = isProviderVerified(contact);
  const dept = contact.department || contact.dept;
  const enriched =
    String(contact.enrichment_status || "").toLowerCase() === "enriched";
  const fit = computeContactScore({
    title: contact.title,
    seniority: (contact as any).seniority,
    department: dept,
    email: contact.email,
    email_status: contact.email_verification_status,
    email_verification_status: contact.email_verification_status,
    verified_by_provider: contact.verified_by_provider,
    linkedin_url: contact.linkedin_url,
    enrichment_status: contact.enrichment_status,
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 transition-shadow hover:shadow-sm">
      <div className="mb-2.5 flex items-start gap-2.5">
        <Avatar name={name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenDetail(contact)}
              className="font-display truncate text-left text-[13px] font-bold text-slate-900 hover:text-blue-700"
            >
              {name}
            </button>
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
            <FitBadge fit={fit} />
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
          onClick={() => onOutreach(contact)}
          className="font-display inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
        >
          <Send className="h-2.5 w-2.5" />
          Outreach
        </button>
        <button
          type="button"
          onClick={() => onEnrich(contact)}
          disabled={enriched}
          className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
        >
          <Zap className="h-2.5 w-2.5" />
          {enriched ? "Enriched" : "Enrich"}
        </button>
        <button
          type="button"
          aria-label="View details"
          onClick={() => onOpenDetail(contact)}
          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-slate-600 hover:text-slate-900"
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
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-6 w-6 items-center justify-center rounded border",
        disabled
          ? "border-slate-200 bg-slate-100 text-slate-300"
          : primary
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
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
  companyName: string;
  companyDomain: string;
  companyLocation: string | null;
  city: string;
  stateField: string;
  country: string;
  usePersonLocations: boolean;
  includeSimilarTitles: boolean;
  matchMode: "organization_id" | "domain" | "name_location_fallback" | "none" | null;
  orgMatch: { id: string | null; name: string | null; primary_domain: string | null } | null;
  titles: string[];
  seniorities: string[];
  departments: string[];
  onCompanyNameChange: (next: string) => void;
  onCompanyDomainChange: (next: string) => void;
  onCityChange: (next: string) => void;
  onStateChange: (next: string) => void;
  onCountryChange: (next: string) => void;
  onUsePersonLocationsChange: (next: boolean) => void;
  onIncludeSimilarTitlesChange: (next: boolean) => void;
  onTitlesChange: (next: string[]) => void;
  onSenioritiesChange: (next: string[]) => void;
  onDepartmentsChange: (next: string[]) => void;
  onClose: () => void;
  onRetry: () => void;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onEnrichSelected: () => void;
  keyOf: (p: ApolloContactPreview, i: number) => string;
};

const APOLLO_DEPARTMENT_OPTIONS = [
  "Operations",
  "Procurement",
  "Supply Chain",
  "Logistics",
  "Customs",
  "Legal",
];

function ApolloResultsPanel({
  loading,
  searched,
  error,
  setupRequired,
  results,
  selected,
  enriching,
  enrichError,
  companyName,
  companyDomain,
  companyLocation,
  city,
  stateField,
  country,
  usePersonLocations,
  includeSimilarTitles,
  matchMode,
  orgMatch,
  titles,
  seniorities,
  departments,
  onCompanyNameChange,
  onCompanyDomainChange,
  onCityChange,
  onStateChange,
  onCountryChange,
  onUsePersonLocationsChange,
  onIncludeSimilarTitlesChange,
  onTitlesChange,
  onSenioritiesChange,
  onDepartmentsChange,
  onClose,
  onRetry,
  onToggle,
  onSelectAll,
  onClearSelection,
  onEnrichSelected,
  keyOf,
}: ApolloResultsPanelProps) {
  function toggle(list: string[], value: string, setter: (n: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }
  const scopeLabel = companyDomain
    ? companyDomain
    : companyName || "current company";
  return (
    <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          <div className="font-display text-[12px] font-bold text-violet-900">
            LIT contact search
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
            aria-label="Close contact search panel"
            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-900"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Filters — scoped to current company */}
      <div className="border-b border-violet-100 bg-white px-3.5 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <Sparkles className="inline h-2.5 w-2.5 text-violet-500" />
          <span className="font-body text-slate-500">Scoped to</span>
          <strong className="font-mono text-slate-900">{scopeLabel}</strong>
          {orgMatch?.name && (
            <span className="font-mono text-slate-500">
              · matched <strong>{orgMatch.name}</strong>
            </span>
          )}
          {searched && matchMode && <SearchModeBadge mode={matchMode} />}
          {companyLocation ? (
            <span className="font-body text-slate-400"> · HQ {companyLocation}</span>
          ) : null}
        </div>
        {/* Editable company name + domain (locked-by-default look) */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5">
            <span className="font-display text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Company name
            </span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder="Company name"
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="font-display text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Company domain
            </span>
            <input
              type="text"
              value={companyDomain}
              onChange={(e) => onCompanyDomainChange(e.target.value)}
              placeholder="example.com"
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div>
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Titles
            </div>
            <div className="flex max-h-[120px] flex-wrap gap-1 overflow-y-auto">
              {APOLLO_DEFAULT_TITLES.map((t) => {
                const on = titles.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggle(titles, t, onTitlesChange)}
                    className={[
                      "font-display rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                      on
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Seniority
            </div>
            <div className="flex flex-wrap gap-1">
              {APOLLO_DEFAULT_SENIORITIES.map((s) => {
                const on = seniorities.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggle(seniorities, s, onSenioritiesChange)}
                    className={[
                      "font-display rounded-md border px-2 py-0.5 text-[10px] font-semibold capitalize",
                      on
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="font-display mb-1 mt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Department
            </div>
            <div className="flex flex-wrap gap-1">
              {APOLLO_DEPARTMENT_OPTIONS.map((d) => {
                const on = departments.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggle(departments, d, onDepartmentsChange)}
                    className={[
                      "font-display rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                      on
                        ? "border-violet-300 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Location
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="text"
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                placeholder="City"
                className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
              />
              <input
                type="text"
                value={stateField}
                onChange={(e) => onStateChange(e.target.value)}
                placeholder="State"
                className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
              />
              <input
                type="text"
                value={country}
                onChange={(e) => onCountryChange(e.target.value)}
                placeholder="Country"
                className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10"
              />
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-600">
              <input
                type="checkbox"
                checked={usePersonLocations}
                onChange={(e) => onUsePersonLocationsChange(e.target.checked)}
                className="h-3 w-3 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
              />
              <span>
                Filter by where the contact lives, not the company HQ
              </span>
            </label>
            <label className="mt-1 flex items-center gap-1.5 text-[10.5px] text-slate-600">
              <input
                type="checkbox"
                checked={includeSimilarTitles}
                onChange={(e) => onIncludeSimilarTitlesChange(e.target.checked)}
                className="h-3 w-3 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
              />
              <span>
                Include similar titles (broader match)
              </span>
            </label>
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              className="font-display mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}
              {searched ? "Re-run search" : "Run search"}
            </button>
          </div>
        </div>
        {!loading && !error && results.length > 0 && (
          <div className="font-body mt-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-700">
            <Zap className="mr-1 inline h-2.5 w-2.5" />
            {selected.size > 0 ? (
              <>
                Enriching <strong>{selected.size}</strong> contact
                {selected.size === 1 ? "" : "s"} will use up to{" "}
                <strong>{selected.size}</strong> contact enrichment credit
                {selected.size === 1 ? "" : "s"} from your plan allowance.
              </>
            ) : (
              <>
                Select contacts to enrich. Each enrichment uses 1 credit from
                your plan allowance.
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="px-6 py-8 text-center">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-violet-500" />
          <p className="font-body text-[12px] text-slate-500">
            Searching for matching contacts…
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
              Contact search isn't fully configured yet. Once set up, this
              panel will return live contacts for the current company.
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
            No matching contacts found for this company and filter set.
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            Try editing the company name, website, city, or state before retrying.
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
                  // Always render the full name. The api.ts normalizer
                  // computes full_name = name ?? first+last, so this
                  // already accounts for first-name-only payloads.
                  const name =
                    p.full_name ||
                    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                    "Unnamed contact";
                  const isEnriched = p.enrichment_status === "enriched";
                  const isFailed = p.enrichment_status === "failed";
                  return (
                    <tr
                      key={k}
                      className={[
                        "border-b border-slate-100 last:border-b-0",
                        isEnriched
                          ? "bg-emerald-50/40"
                          : checked
                            ? "bg-violet-50/40"
                            : "hover:bg-slate-50/60",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(k)}
                          aria-label={`Select ${name}`}
                          disabled={isEnriched}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-400 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <div className="font-display flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
                              {name}
                              {isEnriched ? (
                                <span className="font-display inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-700">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  LIT Enriched
                                </span>
                              ) : isFailed ? (
                                <span className="font-display inline-flex items-center rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-rose-700">
                                  No match
                                </span>
                              ) : (
                                <span className="font-display inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                                  Preview
                                </span>
                              )}
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
                        {isEnriched && (p as any).email ? (
                          <span className="font-mono text-[10px] text-slate-700">
                            {(p as any).email}
                          </span>
                        ) : isEnriched ? (
                          <span className="font-body text-[10px] text-slate-400">
                            Not available
                          </span>
                        ) : (
                          <ApolloEmailStatusBadge status={p.email_status} />
                        )}
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

function SearchModeBadge({
  mode,
}: {
  mode: "organization_id" | "domain" | "name_location_fallback" | "none";
}) {
  const map: Record<typeof mode, { label: string; tone: string }> = {
    organization_id: {
      label: "LIT company match",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    domain: {
      label: "Domain match",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
    },
    name_location_fallback: {
      label: "Name + location fallback",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    },
    none: {
      label: "No verified company match",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    },
  };
  const m = map[mode];
  return (
    <span
      className={[
        "font-display inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
        m.tone,
      ].join(" ")}
    >
      {m.label}
    </span>
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

/* ── Add Contact modal ────────────────────────────────────────────────── */

type AddContactForm = {
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  department: string;
  notes: string;
};

function AddContactModal({
  companyId,
  saving,
  error,
  onClose,
  onSave,
}: {
  companyId: string | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: AddContactForm) => void;
}) {
  const [form, setForm] = useState<AddContactForm>({
    first_name: "",
    last_name: "",
    title: "",
    email: "",
    phone: "",
    linkedin_url: "",
    department: "",
    notes: "",
  });
  const set = (k: keyof AddContactForm) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const valid = form.first_name.trim() && form.last_name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-600" />
            <span className="font-display text-[14px] font-bold text-slate-900">
              Add contact
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!companyId && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-[11px] text-amber-700">
            Save a company first before adding contacts.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-2">
          <ContactField label="First name" required>
            <input
              value={form.first_name}
              onChange={set("first_name")}
              className="contact-input"
            />
          </ContactField>
          <ContactField label="Last name" required>
            <input
              value={form.last_name}
              onChange={set("last_name")}
              className="contact-input"
            />
          </ContactField>
          <ContactField label="Title">
            <input value={form.title} onChange={set("title")} className="contact-input" />
          </ContactField>
          <ContactField label="Department">
            <input
              value={form.department}
              onChange={set("department")}
              className="contact-input"
            />
          </ContactField>
          <ContactField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              className="contact-input"
            />
          </ContactField>
          <ContactField label="Phone">
            <input value={form.phone} onChange={set("phone")} className="contact-input" />
          </ContactField>
          <ContactField label="LinkedIn URL" className="lg:col-span-2">
            <input
              value={form.linkedin_url}
              onChange={set("linkedin_url")}
              placeholder="https://www.linkedin.com/in/…"
              className="contact-input"
            />
          </ContactField>
          <ContactField label="Notes" className="lg:col-span-2">
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={3}
              className="contact-input resize-none"
            />
          </ContactField>
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="font-display rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => valid && onSave(form)}
            disabled={!valid || saving || !companyId}
            className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserPlus className="h-3 w-3" />
            )}
            Save contact
          </button>
        </div>
      </div>
      <style>{`
        .contact-input {
          width: 100%;
          border-radius: 6px;
          border: 1.5px solid #e2e8f0;
          background: #fff;
          padding: 6px 10px;
          font-size: 12px;
          color: #0f172a;
          outline: none;
        }
        .contact-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,.1);
        }
      `}</style>
    </div>
  );
}

function ContactField({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={["flex flex-col gap-1", className || ""].join(" ")}>
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

/* ── Contact Detail Drawer ─────────────────────────────────────────── */

function ContactDetailDrawer({
  contact,
  companyName,
  companyDomain,
  onClose,
  onCopyEmail,
  onCopyLinkedin,
  onOutreach,
  onEnrich,
}: {
  contact: Contact;
  companyName: string | null;
  companyDomain: string | null;
  onClose: () => void;
  onCopyEmail: (c: Contact) => void;
  onCopyLinkedin: (c: Contact) => void;
  onOutreach: (c: Contact) => void;
  onEnrich: (c: Contact) => void;
}) {
  const name =
    contact.full_name ||
    contact.name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    contact.first_name ||
    "Unnamed contact";
  const dept = contact.department || contact.dept || null;
  const enriched =
    String(contact.enrichment_status || "").toLowerCase() === "enriched";
  const fit = computeContactScore({
    title: contact.title,
    seniority: (contact as any).seniority,
    department: dept,
    email: contact.email,
    email_verification_status: contact.email_verification_status,
    verified_by_provider: contact.verified_by_provider,
    linkedin_url: contact.linkedin_url,
    enrichment_status: contact.enrichment_status,
  });
  const persona = derivePersonaSuggestion(contact);
  const angle = deriveOutreachAngle(contact, companyName);
  const emailOpener = deriveEmailOpener(contact, companyName);
  const linkedinOpener = deriveLinkedinOpener(contact);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <Avatar name={name} size={36} />
            <div className="min-w-0">
              <div className="font-display flex items-center gap-1.5 text-[14px] font-bold text-slate-900">
                {name}
                {enriched && (
                  <span className="font-display inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-700">
                    <Sparkles className="h-2.5 w-2.5" />
                    LIT Enriched
                  </span>
                )}
              </div>
              <div className="font-body mt-0.5 text-[11px] text-slate-500">
                {contact.title || "Title not available"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail drawer"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Score */}
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            LIT Contact Fit
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className={[
                "font-mono flex h-12 w-12 shrink-0 items-center justify-center rounded-md border text-[18px] font-bold",
                tierTone(fit.tier),
              ].join(" ")}
            >
              {fit.score}
            </div>
            <div className="min-w-0">
              <div className="font-display text-[12px] font-bold text-slate-900">
                {fit.label}
              </div>
              <div className="font-body mt-0.5 text-[10px] leading-tight text-slate-500">
                Title fit · Seniority · Department · Email verified · LinkedIn
                signal
              </div>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 px-5 py-3.5">
          <DetailField label="Department" value={dept} />
          <DetailField
            label="Seniority"
            value={(contact as any).seniority || null}
          />
          <DetailField label="Company" value={companyName} />
          <DetailField label="Domain" value={companyDomain} />
          <DetailField
            label="Location"
            value={contact.location || contact.city || null}
          />
          <DetailField
            label="Source"
            value={contact.source || contact.source_provider ? "LIT" : null}
          />
          <DetailField
            label="Last enriched"
            value={
              contact.enriched_at
                ? new Date(contact.enriched_at).toLocaleString()
                : null
            }
          />
          <DetailField
            label="Email verified"
            value={
              contact.verified_by_provider === true
                ? "Yes"
                : contact.email_verification_status || null
            }
          />
        </div>

        {/* Contact methods */}
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Contact methods
          </div>
          <div className="flex flex-col gap-2">
            <ContactMethodRow
              icon={<Mail className="h-3 w-3 text-slate-400" />}
              label="Email"
              value={contact.email || null}
              actionLabel="Copy"
              onAction={contact.email ? () => onCopyEmail(contact) : null}
            />
            <ContactMethodRow
              icon={<Phone className="h-3 w-3 text-slate-400" />}
              label="Phone"
              value={contact.phone || null}
              actionLabel={null}
              onAction={null}
            />
            <ContactMethodRow
              icon={<Linkedin className="h-3 w-3 text-slate-400" />}
              label="LinkedIn"
              value={contact.linkedin_url || null}
              actionLabel="Copy"
              onAction={
                contact.linkedin_url ? () => onCopyLinkedin(contact) : null
              }
              externalHref={contact.linkedin_url || null}
            />
          </div>
        </div>

        {/* Recommendations */}
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="font-display mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Recommendations
          </div>
          <div className="flex flex-col gap-2">
            <RecommendationRow label="Persona" value={persona} />
            <RecommendationRow label="Outreach angle" value={angle} />
            <RecommendationRow label="Email opener" value={emailOpener} />
            <RecommendationRow
              label="LinkedIn opener"
              value={linkedinOpener}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => onOutreach(contact)}
            className="font-display inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
          >
            <Send className="h-3 w-3" />
            Add to campaign
          </button>
          <button
            type="button"
            onClick={() => onEnrich(contact)}
            disabled={enriched}
            className="font-display inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Zap className="h-3 w-3" />
            {enriched ? "Enriched" : "Enrich"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </div>
      <div className="font-body mt-0.5 truncate text-[11px] text-slate-700">
        {value || (
          <span className="text-slate-300">Not available</span>
        )}
      </div>
    </div>
  );
}

function ContactMethodRow({
  icon,
  label,
  value,
  actionLabel,
  onAction,
  externalHref,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  actionLabel: string | null;
  onAction: (() => void) | null;
  externalHref?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        {icon}
        <span className="font-display font-semibold text-slate-500">
          {label}
        </span>
        <span className="font-mono truncate text-slate-700">
          {value ? (
            externalHref ? (
              <a
                href={externalHref}
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 hover:text-blue-800"
              >
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="font-body text-slate-300">Not available</span>
          )}
        </span>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="font-display rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function RecommendationRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </div>
      <div className="font-body mt-0.5 text-[11px] leading-snug text-slate-700">
        {value || (
          <span className="text-slate-300">Not available</span>
        )}
      </div>
    </div>
  );
}

function derivePersonaSuggestion(c: Contact): string | null {
  const t = String(c.title || "").toLowerCase();
  if (!t) return null;
  if (/(logistics|transportation|freight)/.test(t)) return "Logistics decision maker";
  if (/(supply chain|operations)/.test(t)) return "Supply chain operator";
  if (/(procurement|sourcing|buyer|purchasing)/.test(t)) return "Procurement / sourcing buyer";
  if (/(import|customs|trade)/.test(t)) return "Trade / customs operator";
  if (/(vp|director|head|chief)/.test(t)) return "Senior decision maker";
  return c.title;
}

function deriveOutreachAngle(c: Contact, companyName: string | null): string | null {
  if (!c.title) return null;
  const co = companyName ? ` at ${companyName}` : "";
  const lower = c.title.toLowerCase();
  if (/(logistics|transportation|freight)/.test(lower)) {
    return `Lead with carrier mix benchmark${co} — ask about lane coverage and FCL/LCL split.`;
  }
  if (/(supply chain|operations)/.test(lower)) {
    return `Lead with supply chain visibility / forwarder concentration risk${co}.`;
  }
  if (/(procurement|sourcing)/.test(lower)) {
    return `Lead with supplier diversification + landed cost angle${co}.`;
  }
  return `Anchor on ${companyName || "this account"}'s active trade lanes and shipment cadence.`;
}

function deriveEmailOpener(c: Contact, companyName: string | null): string | null {
  if (!c.title) return null;
  const first = c.first_name || (c.full_name || "").split(" ")[0] || "there";
  return `${first} — quick read on ${companyName || "your"} trade lanes from the LIT side; one question on carrier mix when you have a moment.`;
}

function deriveLinkedinOpener(c: Contact): string | null {
  if (!c.title) return null;
  return `Saw you lead ${c.title}. Working with logistics leaders on inbound carrier benchmarks — open to comparing notes?`;
}

/* ── Outreach Contact Modal ────────────────────────────────────────── */

type OutreachCampaignOption = { id: number | string; name: string };

function OutreachContactModal({
  contact,
  companyId,
  companyName,
  onClose,
}: {
  contact: Contact;
  companyId: string | null;
  companyName: string | null;
  onClose: () => void;
}) {
  const [campaigns, setCampaigns] = useState<OutreachCampaignOption[] | null>(
    null,
  );
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState<
    string | number | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  const name =
    contact.full_name ||
    contact.name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    "Unnamed contact";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await getCrmCampaigns();
        if (cancelled) return;
        const rows = Array.isArray(res?.rows)
          ? res.rows
          : Array.isArray(res)
            ? res
            : [];
        const opts: OutreachCampaignOption[] = rows
          .filter((r: any) => r && (r.id || r.name))
          .map((r: any) => ({ id: r.id, name: r.name || "Untitled campaign" }));
        setCampaigns(opts);
        if (opts.length > 0) setSelectedCampaignId(opts[0].id);
      } catch (err: any) {
        if (cancelled) return;
        setCampaigns([]);
        setError(err?.message || "Couldn't load campaigns.");
      } finally {
        if (!cancelled) setLoadingCampaigns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!companyId) {
        setError(
          "Company hasn't been saved to CRM yet. Save the company first, then add this contact.",
        );
        setSetupRequired(true);
        return;
      }
      if (selectedCampaignId == null) {
        setError("Pick a campaign.");
        return;
      }
      const contactId = String(contact.id ?? "");
      if (!contactId) {
        setError("Contact has no id yet — enrich or save it first.");
        setSetupRequired(true);
        return;
      }
      const res = await addCompanyToCampaign({
        campaign_id: String(selectedCampaignId),
        company_id: String(companyId),
        contact_ids: [contactId],
      });
      if (res.contacts_added > 0) {
        setDone(true);
        setTimeout(() => onClose(), 1300);
      } else if (res.errors.length > 0) {
        setError(res.errors.join(" · "));
        // contact_id might be a temporary in-memory id (e.g.
        // "apollo-...") rather than a saved lit_contacts UUID. Tell
        // the user clearly.
        if (res.errors.some((e) => /uuid|invalid input syntax/i.test(e))) {
          setSetupRequired(true);
          setError(
            "This contact hasn't been saved yet — re-enrich it so it gets a real id, then retry.",
          );
        }
      } else {
        // Company added but no contacts — likely missing contact id.
        setError(
          "Couldn't link the contact. Re-enrich the contact, then retry.",
        );
      }
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      // The CRM gateway may not yet support contact-level membership;
      // surface it as setup-required rather than failing silently.
      if (/404|not\s+found|contact_ids/i.test(msg)) {
        setSetupRequired(true);
        setError("Contact-level campaign audience setup required.");
      } else {
        setError(msg || "Couldn't add contact to campaign.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-600" />
            <span className="font-display text-[14px] font-bold text-slate-900">
              Add to campaign
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-2 text-[11px] text-slate-600">
          <strong className="font-display text-slate-900">{name}</strong>
          {contact.title && (
            <span className="font-body"> · {contact.title}</span>
          )}
          {companyName && (
            <span className="font-body"> · {companyName}</span>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Campaign
          </div>
          {loadingCampaigns ? (
            <div className="font-body text-[12px] text-slate-500">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Loading campaigns…
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <select
              value={String(selectedCampaignId ?? "")}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="font-body w-full rounded-md border-[1.5px] border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-900"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="font-body rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              No campaigns yet —{" "}
              <a href="/app/campaigns" className="underline">
                create one in Campaigns
              </a>
              .
            </div>
          )}
        </div>

        {(error || done) && (
          <div
            className={[
              "mx-5 mb-3 rounded-md border px-3 py-2 text-[11px]",
              done
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : setupRequired
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700",
            ].join(" ")}
          >
            {done ? "Contact added to campaign." : error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="font-display rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              done ||
              loadingCampaigns ||
              !campaigns ||
              campaigns.length === 0 ||
              !companyId
            }
            className="font-display inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {done ? "Added" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

