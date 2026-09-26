/**
 * Contacts tab — Company Profile v2 (handoff README §9).
 *
 * New UI over the EXISTING enrichment data layer:
 *   - discovery:   searchApolloContacts (apollo-contact-search → lemlist fallback)
 *   - reveal:      saveContact → enrichContact (enrich-contact-orchestrator) →
 *                  updateContactEnrichmentState — the exact CDPContacts path,
 *                  1 credit per contact, enforced/decremented SERVER-side.
 *   - persistence: lit_contacts via listContacts / saveContact.
 *   - credits:     useEntitlements().credits (get-entitlements snapshot);
 *                  optimistic decrement reconciled by invalidateCache().
 *
 * Production rule: real emails/phones are NEVER in the DOM before enrichment.
 * Preview rows render a static placeholder string under a blur(4px).
 */
import React from "react";
import {
  BadgeCheck,
  Check,
  GitBranch,
  Info,
  Loader,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Truck,
  UserPlus,
  Zap,
} from "lucide-react";
import {
  listContacts,
  saveContact,
  searchApolloContacts,
  updateContactEnrichmentState,
  type ApolloContactPreview,
  type ApolloOrganizationMatch,
} from "@/lib/api";
import { enrichContact as enrichKnownContact } from "@/lib/enrichment/contactEnrichment";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Card, EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, useReducedMotion } from "../ui";

/* ── Domain classification ─────────────────────────────────────────────── */

export type Dept = "Logistics" | "Supply Chain" | "Procurement" | "Customs" | "Operations";

const DEPT_OPTIONS: Dept[] = ["Logistics", "Supply Chain", "Procurement", "Customs", "Operations"];
const SENIORITY_OPTIONS = ["Manager", "Director", "VP", "Head", "Owner"] as const;
type Seniority = (typeof SENIORITY_OPTIONS)[number];
const TITLE_OPTIONS = [
  "Logistics Manager",
  "Import Manager",
  "Supply Chain Manager",
  "Procurement Director",
  "Customs Manager",
  "Transportation Manager",
  "VP Supply Chain",
];
const DEFAULT_TITLES = TITLE_OPTIONS.slice(0, 5);

/** Infer a buying-committee department from a job title (README §9.2). */
export function classifyDept(title?: string | null, providerDept?: string | null): Dept | null {
  const t = `${title || ""} ${providerDept || ""}`.toLowerCase();
  if (!t.trim()) return null;
  if (/(customs|compliance|trade)/.test(t)) return "Customs";
  if (/(procure|sourcing|buyer|purchas)/.test(t)) return "Procurement";
  if (/(supply chain|scm)/.test(t)) return "Supply Chain";
  if (/(logistic|transport|freight|shipping|import|export)/.test(t)) return "Logistics";
  if (/(operations|ops)/.test(t)) return "Operations";
  return null;
}

function classifySeniority(title?: string | null, providerSeniority?: string | null): Seniority | null {
  const p = String(providerSeniority || "").toLowerCase();
  if (/owner|founder/.test(p)) return "Owner";
  if (/vp|vice/.test(p)) return "VP";
  if (/director/.test(p)) return "Director";
  if (/head/.test(p)) return "Head";
  if (/manager/.test(p)) return "Manager";
  const t = String(title || "").toLowerCase();
  if (/owner|founder/.test(t)) return "Owner";
  if (/\bvp\b|vice president/.test(t)) return "VP";
  if (/director/.test(t)) return "Director";
  if (/head of|^head\b/.test(t)) return "Head";
  if (/manager/.test(t)) return "Manager";
  return null;
}

function normDomain(d?: string | null): string {
  return String(d || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/* ── Row model ─────────────────────────────────────────────────────────── */

type RowStatus = "preview" | "enriching" | "enriched";

type ContactRow = {
  key: string;
  savedId: string | null;
  apolloPersonId: string | null;
  sourceContactKey: string | null;
  firstName: string;
  lastName: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedinUrl: string | null;
  dept: Dept | null;
  seniority: Seniority | null;
  /** Real values — present ONLY when the row is enriched (saved row or
   *  session enrichment). Never populated from preview payloads. */
  email: string | null;
  phone: string | null;
  status: RowStatus;
};

const AVATAR_PALETTE = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#00c8d4", "#64748b"];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

/* ── Data hook — wraps the existing api layer ──────────────────────────── */

type SessionReveal = { email: string | null; phone: string | null; savedId: string | null };

function useContactSearch(args: {
  companyName: string;
  companyDomain?: string | null;
  companyKey?: string | null;
  companyUuid?: string | null;
  selectedTitles: string[];
}) {
  const { companyName, companyDomain, companyKey, companyUuid, selectedTitles } = args;
  /** Id accepted by saveContact/listContacts (uuid preferred, slug fallback). */
  const persistId = companyUuid || companyKey || null;

  const { credits, invalidateCache } = useEntitlements();

  const [saved, setSaved] = React.useState<any[]>([]);
  const [previews, setPreviews] = React.useState<ApolloContactPreview[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [orgMatch, setOrgMatch] = React.useState<ApolloOrganizationMatch>(null);
  const [enrichingKeys, setEnrichingKeys] = React.useState<Set<string>>(new Set());
  const [reveals, setReveals] = React.useState<Map<string, SessionReveal>>(new Map());
  /** Optimistic credit spend, reconciled when the entitlements snapshot refetches. */
  const [optimisticSpend, setOptimisticSpend] = React.useState(0);

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reconcile: whenever the server snapshot changes, drop the local decrement.
  React.useEffect(() => {
    setOptimisticSpend(0);
  }, [credits]);

  const refreshSaved = React.useCallback(async () => {
    if (!persistId) return [] as any[];
    try {
      const { contacts } = await listContacts(persistId);
      if (mountedRef.current) setSaved(contacts ?? []);
      return contacts ?? [];
    } catch {
      return [] as any[];
    }
  }, [persistId]);

  React.useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const runSearch = React.useCallback(
    async (opts?: { domainOverride?: string | null }) => {
      if (searching) return;
      setSearching(true);
      setError(null);
      try {
        const result = await searchApolloContacts({
          companyId: companyUuid ?? companyKey ?? null,
          companyName: companyName || null,
          companyDomain: (opts?.domainOverride ?? companyDomain) || null,
          titles: selectedTitles,
          perPage: 50,
        });
        if (!mountedRef.current) return;
        setSearched(true);
        setOrgMatch(result.organization ?? null);
        if (!result.ok) {
          setPreviews([]);
          setError(result.error || "Contact search failed.");
        } else {
          setPreviews(result.contacts);
        }
      } catch (err: any) {
        if (!mountedRef.current) return;
        setSearched(true);
        setPreviews([]);
        setError(err?.message || "Contact search failed.");
      } finally {
        if (mountedRef.current) setSearching(false);
      }
    },
    [searching, companyUuid, companyKey, companyName, companyDomain, selectedTitles],
  );

  const markEnriching = (key: string, on: boolean) =>
    setEnrichingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const markRevealed = React.useCallback((key: string, r: SessionReveal) => {
    setReveals((prev) => {
      const next = new Map(prev);
      next.set(key, r);
      return next;
    });
  }, []);

  /** Poll lit_contacts while an async provider job completes (webhook path). */
  const pollReveal = React.useCallback(
    async (savedId: string, key: string): Promise<boolean> => {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!mountedRef.current) return false;
        const rows = await refreshSaved();
        const row = rows.find((c: any) => String(c.id) === savedId);
        if (row?.email) {
          markRevealed(key, { email: row.email, phone: row.phone ?? null, savedId });
          return true;
        }
        if (String(row?.enrichment_status || "").toLowerCase() === "failed") return false;
      }
      return false;
    },
    [refreshSaved, markRevealed],
  );

  /**
   * Reveal one contact through the REAL path (saveContact → orchestrator →
   * updateContactEnrichmentState) — identical sequence to CDPContacts'
   * enrichOnePreview. Returns an error string or null.
   */
  const enrichOne = React.useCallback(
    async (row: ContactRow): Promise<string | null> => {
      if (row.status !== "preview") return null;
      if (!persistId) return "Save this company before enriching contacts.";
      markEnriching(row.key, true);
      try {
        let savedId = row.savedId;
        if (!savedId) {
          const savedRow = await saveContact(persistId, {
            first_name: row.firstName,
            last_name: row.lastName,
            title: row.title,
            email: "",
            phone: "",
            linkedin_url: row.linkedinUrl || "",
            department: row.dept || "",
            source_contact_key: row.sourceContactKey || row.apolloPersonId || null,
            source: "lit",
            source_provider: "lit",
            enrichment_status: "pending",
          });
          savedId = savedRow?.id ? String(savedRow.id) : null;
        }
        const result = await enrichKnownContact({
          contactId: savedId || undefined,
          apolloPersonId: row.apolloPersonId || undefined,
          sourceContactKey: row.sourceContactKey || undefined,
          fullName: row.name || undefined,
          companyName: companyName || row.company || undefined,
          companyDomain: companyDomain || undefined,
          linkedinUrl: row.linkedinUrl || undefined,
          title: row.title || undefined,
          revealPhoneNumber: false,
        });
        if (!result.success) {
          if (savedId) {
            await updateContactEnrichmentState(savedId, {
              enrichment_status: "failed",
              enrichment_result: { error: result.error || "LIT enrichment failed", jobs: result.jobs || [] },
            }).catch(() => undefined);
          }
          return result.error || "LIT enrichment failed";
        }
        // Credits are decremented server-side — optimistically mirror, then
        // reconcile from the refetched entitlements snapshot.
        setOptimisticSpend((n) => n + 1);
        invalidateCache();

        const contact: any = result.contact || null;
        if (contact?.email) {
          markRevealed(row.key, { email: contact.email, phone: contact.phone ?? null, savedId });
          void refreshSaved();
          return null;
        }
        const jobId = result.jobs?.find((j) => j?.id)?.id || null;
        if (result.pending && savedId) {
          if (jobId) {
            await updateContactEnrichmentState(savedId, {
              enrichment_status: "pending",
              enrichment_job_id: jobId,
              enrichment_result: { jobs: result.jobs },
            }).catch(() => undefined);
          }
          const revealed = await pollReveal(savedId, row.key);
          return revealed ? null : "Enrichment is still processing — it will appear in saved contacts shortly.";
        }
        return contact ? `No email available for ${row.name || "this contact"}.` : "No enrichment result was returned.";
      } catch (err: any) {
        return err?.message || "Enrichment failed.";
      } finally {
        markEnriching(row.key, false);
      }
    },
    [persistId, companyName, companyDomain, invalidateCache, markRevealed, pollReveal, refreshSaved],
  );

  const remaining = credits?.remaining ?? null;
  const creditsLeft = remaining == null ? null : Math.max(0, remaining - optimisticSpend);

  return {
    saved,
    previews,
    searching,
    searched,
    error,
    setError,
    orgMatch,
    enrichingKeys,
    reveals,
    creditsLeft,
    runSearch,
    enrichOne,
  };
}

/* ── Small styled pieces (design tokens per handoff §12) ───────────────── */

const BTN_SECONDARY =
  "flex h-[38px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E5E7EB] bg-white px-[14px] text-[13px] font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC] active:scale-[0.97]";
const BTN_PRIMARY =
  "flex h-[38px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] bg-[#3b82f6] px-4 text-[13px] font-semibold text-white transition hover:bg-[#2563eb] active:scale-[0.97]";

const GRID_COLS =
  "grid grid-cols-[36px_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)_130px_120px] gap-3";

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  const IconCmp = on ? Check : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-[5px] rounded-full border px-[10px] py-[5px] text-[12px] font-semibold transition-colors active:scale-[0.96]"
      style={{
        fontFamily: FONT_BODY,
        borderColor: on ? "rgba(59,130,246,0.35)" : "#E5E7EB",
        background: on ? "rgba(59,130,246,0.1)" : "#FFFFFF",
        color: on ? "#1d4ed8" : "#64748b",
      }}
    >
      <IconCmp size={12} />
      {label}
    </button>
  );
}

function ChipGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: readonly T[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div>
      <div
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]"
        style={{ fontFamily: FONT_DISPLAY }}
      >
        {title}
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {options.map((o) => (
          <Chip key={o} label={o} on={selected.includes(o)} onClick={() => onToggle(o)} />
        ))}
      </div>
    </div>
  );
}

function AmberNotice({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-[10px] px-[14px] py-3 text-[13px]"
      style={{
        background: "rgba(245,158,11,0.10)",
        border: "1px solid rgba(245,158,11,0.35)",
        color: "#92400e",
        fontFamily: FONT_BODY,
      }}
    >
      {icon ?? <TriangleAlert size={16} className="shrink-0" />}
      {children}
    </div>
  );
}

const ROLE_DEFS: { dept: Dept; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { dept: "Logistics", label: "Logistics & transportation", icon: Truck },
  { dept: "Procurement", label: "Procurement & sourcing", icon: ShoppingCart },
  { dept: "Customs", label: "Customs & compliance", icon: ShieldCheck },
  { dept: "Supply Chain", label: "Supply chain leadership", icon: GitBranch },
];

/* ── Main component ────────────────────────────────────────────────────── */

export function ContactsTab(props: {
  companyName: string;
  companyDomain?: string | null;
  companyKey?: string | null;
  companyUuid?: string | null;
  onStartOutreach?: () => void;
}) {
  const { companyName, companyDomain, companyKey, companyUuid } = props;
  const reducedMotion = useReducedMotion();

  const [selectedTitles, setSelectedTitles] = React.useState<string[]>(DEFAULT_TITLES);
  const [selectedSeniorities, setSelectedSeniorities] = React.useState<Seniority[]>([...SENIORITY_OPTIONS]);
  const [selectedDepts, setSelectedDepts] = React.useState<Dept[]>([...DEPT_OPTIONS]);
  const [showCriteria, setShowCriteria] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"All" | "Preview" | "Enriched">("All");
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [enrichError, setEnrichError] = React.useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = React.useState(false);

  const {
    saved,
    previews,
    searching,
    searched,
    error,
    orgMatch,
    enrichingKeys,
    reveals,
    creditsLeft,
    runSearch,
    enrichOne,
  } = useContactSearch({ companyName, companyDomain, companyKey, companyUuid, selectedTitles });

  const domainGuess = normDomain(companyDomain) || "company.com";

  /* Merge saved lit_contacts rows + provider previews into one row list. */
  const rows = React.useMemo<ContactRow[]>(() => {
    const out: ContactRow[] = [];
    const savedKeys = new Set<string>();
    for (const c of saved) {
      const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unknown";
      const sourceKey = c.source_contact_key ? String(c.source_contact_key) : null;
      if (sourceKey) savedKeys.add(sourceKey);
      savedKeys.add(`${name.toLowerCase()}|${String(c.title || "").toLowerCase()}`);
      const key = `saved-${c.id}`;
      const reveal = reveals.get(key);
      const email = c.email || reveal?.email || null;
      const phone = c.phone || reveal?.phone || null;
      out.push({
        key,
        savedId: String(c.id),
        apolloPersonId: c.apollo_person_id ? String(c.apollo_person_id) : null,
        sourceContactKey: sourceKey,
        firstName: c.first_name || name.split(/\s+/)[0] || "",
        lastName: c.last_name || name.split(/\s+/).slice(1).join(" ") || "",
        name,
        title: c.title || "",
        company: companyName,
        location: c.location || [c.city, c.country_code].filter(Boolean).join(", ") || "—",
        linkedinUrl: c.linkedin_url || null,
        dept: classifyDept(c.title, c.department),
        seniority: classifySeniority(c.title, null),
        email,
        phone,
        status: enrichingKeys.has(key) ? "enriching" : email ? "enriched" : "preview",
      });
    }
    previews.forEach((p, i) => {
      const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Unknown";
      const sourceKey = p.source_contact_key || p.apollo_person_id || null;
      if (
        (sourceKey && savedKeys.has(String(sourceKey))) ||
        savedKeys.has(`${name.toLowerCase()}|${String(p.title || "").toLowerCase()}`)
      ) {
        return; // already persisted — the saved row wins
      }
      const key = sourceKey ? `p-${sourceKey}` : `p-${name}|${p.title || ""}|${i}`;
      const reveal = reveals.get(key);
      out.push({
        key,
        savedId: reveal?.savedId ?? null,
        apolloPersonId: p.apollo_person_id ? String(p.apollo_person_id) : null,
        sourceContactKey: sourceKey ? String(sourceKey) : null,
        firstName: p.first_name || name.split(/\s+/)[0] || "",
        lastName: p.last_name || name.split(/\s+/).slice(1).join(" ") || "",
        name,
        title: p.title || "",
        company: p.company || companyName,
        location: p.location || [p.city, p.state, p.country].filter(Boolean).join(", ") || "—",
        linkedinUrl: p.linkedin_url || null,
        dept: classifyDept(p.title, p.department),
        seniority: classifySeniority(p.title, p.seniority),
        // NEVER surface provider preview email/phone pre-enrichment.
        email: reveal?.email ?? null,
        phone: reveal?.phone ?? null,
        status: enrichingKeys.has(key) ? "enriching" : reveal ? "enriched" : "preview",
      });
    });
    return out;
  }, [saved, previews, reveals, enrichingKeys, companyName]);

  /* Live client-side criteria filters (dept + seniority), then query + status. */
  const deptFilterActive = selectedDepts.length > 0 && selectedDepts.length < DEPT_OPTIONS.length;
  const senFilterActive = selectedSeniorities.length > 0 && selectedSeniorities.length < SENIORITY_OPTIONS.length;
  const criteriaRows = React.useMemo(
    () =>
      rows.filter((r) => {
        if (deptFilterActive && (!r.dept || !selectedDepts.includes(r.dept))) return false;
        if (senFilterActive && (!r.seniority || !selectedSeniorities.includes(r.seniority))) return false;
        return true;
      }),
    [rows, deptFilterActive, senFilterActive, selectedDepts, selectedSeniorities],
  );
  const counts = React.useMemo(
    () => ({
      All: criteriaRows.length,
      Preview: criteriaRows.filter((r) => r.status !== "enriched").length,
      Enriched: criteriaRows.filter((r) => r.status === "enriched").length,
    }),
    [criteriaRows],
  );
  const shownRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return criteriaRows.filter((r) => {
      if (statusFilter === "Enriched" && r.status !== "enriched") return false;
      if (statusFilter === "Preview" && r.status === "enriched") return false;
      if (q && !`${r.name} ${r.title} ${r.location} ${r.company}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [criteriaRows, statusFilter, query]);

  /* Role coverage (README §9.2). */
  const roleStats = React.useMemo(
    () =>
      ROLE_DEFS.map((role) => {
        const savedInDept = rows.filter(
          (r) => r.dept === role.dept && (r.savedId != null || r.status === "enriched"),
        ).length;
        const foundInDept = rows.filter((r) => r.dept === role.dept).length;
        return { ...role, saved: savedInDept, found: foundInDept, covered: savedInDept >= 1 };
      }),
    [rows],
  );
  const coveredCount = roleStats.filter((r) => r.covered).length;

  /* Entity mismatch — only when the provider-matched domain ≠ ours. */
  const matchedDomain = normDomain(orgMatch?.primary_domain);
  const ourDomain = normDomain(companyDomain);
  const entityMismatch = Boolean(matchedDomain && ourDomain && matchedDomain !== ourDomain);

  const selectedCount = selectedKeys.size;

  const toggleSelected = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleEnrichOne = async (row: ContactRow) => {
    setEnrichError(null);
    const err = await enrichOne(row);
    if (err) setEnrichError(err);
    setSelectedKeys((prev) => {
      if (!prev.has(row.key)) return prev;
      const next = new Set(prev);
      next.delete(row.key);
      return next;
    });
  };

  const handleBulkEnrich = async () => {
    if (bulkRunning || selectedCount === 0) return;
    setBulkRunning(true);
    setEnrichError(null);
    const targets = rows.filter((r) => selectedKeys.has(r.key) && r.status === "preview");
    let firstError: string | null = null;
    for (const t of targets) {
      // Sequential — same real path per contact, 1 server-side credit each.
      const err = await enrichOne(t);
      if (err && !firstError) firstError = err;
    }
    setSelectedKeys(new Set());
    if (firstError) setEnrichError(firstError);
    setBulkRunning(false);
  };

  const savedCount = saved.length;
  const pulse = reducedMotion ? undefined : "litpulse 1.2s ease-in-out infinite";

  return (
    <div className="flex flex-col gap-5">
      {/* keyframes for the skeleton pulse */}
      <style>{"@keyframes litpulse{0%,100%{opacity:1}50%{opacity:.45}}"}</style>

      {/* 1 — Title row */}
      <div className="flex flex-wrap items-end justify-between gap-5 pb-1 pt-2">
        <div>
          <h2
            className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-[#0F172A]"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            Contacts
          </h2>
          <p
            className="mt-[10px] max-w-[820px] text-[17px] leading-[1.55] text-[#475569]"
            style={{ fontFamily: FONT_BODY, textWrap: "pretty" as any }}
          >
            Buying committee for {companyName}.{" "}
            <span className="font-semibold text-[#0F172A]">{coveredCount} of 4 roles covered</span>, {savedCount}{" "}
            saved contacts
            {creditsLeft != null ? `, ${creditsLeft} enrichment credits left` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={BTN_SECONDARY} style={{ fontFamily: FONT_BODY }} title="Add a contact manually">
            <UserPlus size={15} />
            Add contact
          </button>
          <button
            type="button"
            onClick={() => void runSearch()}
            className={BTN_PRIMARY}
            style={{ fontFamily: FONT_BODY, boxShadow: "0 6px 18px rgba(59,130,246,0.35)" }}
          >
            <Sparkles size={15} />
            Find Contacts
          </button>
        </div>
      </div>

      {/* 2 — Role coverage cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        {roleStats.map((r) => {
          const active = selectedDepts.length === 1 && selectedDepts[0] === r.dept;
          const RoleIcon = r.icon;
          return (
            <Card
              key={r.dept}
              onClick={() =>
                setSelectedDepts((prev) => (prev.length === 1 && prev[0] === r.dept ? [...DEPT_OPTIONS] : [r.dept]))
              }
              className="cursor-pointer px-[18px] py-4 transition-[border-color,transform] active:scale-[0.98]"
              style={{
                borderColor: active ? "rgba(59,130,246,0.45)" : undefined,
                transitionDuration: "200ms,160ms",
                transitionTimingFunction: `ease,${EASE_OUT}`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[rgba(59,130,246,0.1)] text-[#2563eb]">
                  <RoleIcon size={15} />
                </span>
                <span
                  className="rounded-full px-[9px] py-[3px] text-[11px] font-semibold"
                  style={{
                    fontFamily: FONT_BODY,
                    color: r.covered ? "#047857" : "#b45309",
                    background: r.covered ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                    border: `1px solid ${r.covered ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)"}`,
                  }}
                >
                  {r.covered ? "Covered" : "Gap"}
                </span>
              </div>
              <div className="mt-3 text-[15px] font-semibold" style={{ fontFamily: FONT_DISPLAY }}>
                {r.label}
              </div>
              <div className="mt-[3px] text-[12px] text-[#64748b]" style={{ fontFamily: FONT_BODY }}>
                {r.saved > 0 ? `${r.saved} saved · ${r.found} found` : `${r.found} found in LIT`}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 3 — LIT contact search card */}
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEF2F6] px-6 py-[18px]">
          <div className="flex items-center gap-[10px]">
            <span
              className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#0F172A] text-[#00F0FF]"
              style={{ boxShadow: "0 0 12px rgba(0,240,255,0.25)" }}
            >
              <Sparkles size={15} />
            </span>
            <div>
              <div className="text-[16px] font-semibold" style={{ fontFamily: FONT_DISPLAY }}>
                LIT contact search
              </div>
              <div className="mt-[2px] text-[11px] font-medium text-[#64748b]" style={{ fontFamily: FONT_MONO }}>
                Scoped to {normDomain(companyDomain) || companyName} · {shownRows.length} matches
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCriteria((v) => !v)}
              className={BTN_SECONDARY}
              style={{ fontFamily: FONT_BODY }}
            >
              <SlidersHorizontal size={15} />
              {showCriteria ? "Hide criteria" : "Criteria"}
            </button>
            <button
              type="button"
              onClick={() => void runSearch()}
              className={BTN_SECONDARY}
              style={{ fontFamily: FONT_BODY }}
            >
              <RefreshCw size={15} className={searching && !reducedMotion ? "animate-spin" : undefined} />
              Re-run
            </button>
          </div>
        </div>

        {/* Entity-mismatch warning — real provider match only */}
        {entityMismatch && (
          <AmberNotice>
            <span className="min-w-[240px] flex-1">
              Domain matched <b>{orgMatch?.name || matchedDomain}</b> ({matchedDomain}), a different entity. Confirm{" "}
              {ourDomain} before enriching so credits land on the right company.
            </span>
            <button
              type="button"
              onClick={() => void runSearch({ domainOverride: companyDomain ?? null })}
              className="flex h-[30px] cursor-pointer items-center gap-[6px] rounded-lg bg-white px-[10px] text-[12px] font-semibold text-[#92400e] active:scale-[0.97]"
              style={{ border: "1px solid rgba(245,158,11,0.45)", fontFamily: FONT_BODY }}
            >
              <Check size={13} />
              Confirm {ourDomain}
            </button>
          </AmberNotice>
        )}

        {/* Inline error notices — never crash */}
        {error && (
          <AmberNotice>
            <span className="min-w-[240px] flex-1">{error}</span>
          </AmberNotice>
        )}
        {enrichError && (
          <AmberNotice>
            <span className="min-w-[240px] flex-1">{enrichError}</span>
          </AmberNotice>
        )}

        {/* Criteria */}
        {showCriteria && (
          <div
            className="grid gap-5 border-b border-[#EEF2F6] px-6 py-[18px]"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))" }}
          >
            <ChipGroup
              title="Titles"
              options={TITLE_OPTIONS}
              selected={selectedTitles}
              onToggle={(t) =>
                setSelectedTitles((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
              }
            />
            <ChipGroup
              title="Seniority"
              options={SENIORITY_OPTIONS}
              selected={selectedSeniorities}
              onToggle={(s) =>
                setSelectedSeniorities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
              }
            />
            <ChipGroup
              title="Department"
              options={DEPT_OPTIONS}
              selected={selectedDepts}
              onToggle={(d) =>
                setSelectedDepts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
              }
            />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-[10px] px-6 py-[14px]">
          <div className="flex h-[38px] min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3">
            <Search size={15} className="text-[#94a3b8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, title or location"
              className="flex-1 border-0 bg-transparent text-[13px] font-medium text-[#0F172A] outline-none"
              style={{ fontFamily: FONT_BODY }}
            />
          </div>
          <div className="flex gap-[2px] rounded-[10px] bg-[#F1F5F9] p-[3px]">
            {(["All", "Preview", "Enriched"] as const).map((t) => {
              const active = statusFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStatusFilter(t)}
                  className="cursor-pointer whitespace-nowrap rounded-[7px] px-3 py-[6px] text-[12px] font-semibold"
                  style={{
                    fontFamily: FONT_BODY,
                    background: active ? "#FFFFFF" : "transparent",
                    color: active ? "#0F172A" : "#64748b",
                    boxShadow: active ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                  }}
                >
                  {t}{" "}
                  <span className="opacity-60" style={{ fontFamily: FONT_MONO }}>
                    {counts[t]}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleBulkEnrich()}
            className={BTN_PRIMARY}
            style={{
              fontFamily: FONT_BODY,
              boxShadow: "0 6px 18px rgba(59,130,246,0.35)",
              opacity: selectedCount === 0 ? 0.4 : 1,
              pointerEvents: selectedCount === 0 ? "none" : "auto",
            }}
          >
            <Zap size={15} />
            Enrich {selectedCount} selected
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className={`${GRID_COLS} bg-[#F8FAFC] px-6 py-[10px] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]`}
              style={{ fontFamily: FONT_DISPLAY }}
            >
              <span />
              <span>Contact</span>
              <span>Title</span>
              <span>Location</span>
              <span>Email</span>
              <span>Phone</span>
              <span className="text-right">Status</span>
            </div>

            {searching &&
              [0, 1, 2].map((k) => (
                <div key={k} className={`${GRID_COLS} items-center border-t border-[#F1F5F9] px-6 py-4`}>
                  <span className="h-4 w-4 rounded-[4px] bg-[#EEF2F6]" />
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="h-3 rounded-[6px] bg-[#EEF2F6]" style={{ animation: pulse }} />
                  ))}
                  <span className="h-6 rounded-full bg-[#EEF2F6]" style={{ animation: pulse }} />
                </div>
              ))}

            {!searching &&
              shownRows.map((r) => {
                const enriched = r.status === "enriched";
                const enrichingRow = r.status === "enriching";
                const checked = selectedKeys.has(r.key);
                // Placeholder strings — real values are never in the DOM pre-enrichment.
                const emailText = enriched
                  ? r.email || "—"
                  : `${(r.firstName[0] || "•").toLowerCase()}•••••@${domainGuess}`;
                const phoneText = enriched ? r.phone || "—" : "+1 ••• ••• ••••";
                return (
                  <div
                    key={r.key}
                    className={`${GRID_COLS} items-center border-t border-[#F1F5F9] px-6 py-3 text-[13px] transition-colors duration-200`}
                    style={{ background: checked ? "rgba(59,130,246,0.05)" : "transparent", fontFamily: FONT_BODY }}
                  >
                    <button
                      type="button"
                      onClick={() => !enriched && toggleSelected(r.key)}
                      aria-label={checked ? `Deselect ${r.name}` : `Select ${r.name}`}
                      className="grid h-4 w-4 cursor-pointer place-items-center rounded-[4px] text-[11px] text-white"
                      style={{
                        border: `1.5px solid ${checked ? "#3b82f6" : "#CBD5E1"}`,
                        background: checked ? "#3b82f6" : "#FFFFFF",
                        opacity: enriched ? 0.3 : 1,
                        pointerEvents: enriched ? "none" : "auto",
                      }}
                    >
                      {checked && <Check size={11} />}
                    </button>
                    <span className="flex min-w-0 items-center gap-[10px]">
                      <span
                        className="grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-semibold text-white"
                        style={{ background: avatarColor(r.name), fontFamily: FONT_DISPLAY }}
                      >
                        {initialsOf(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.name}</span>
                        <span className="block truncate text-[11px] text-[#94a3b8]">{r.company}</span>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{r.title || "—"}</span>
                      <span className="block truncate text-[11px] text-[#94a3b8]">
                        {[r.dept, r.seniority].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="truncate text-[#475569]">{r.location}</span>
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{
                        fontFamily: FONT_MONO,
                        color: enriched ? "#0F172A" : "#94a3b8",
                        filter: enriched ? "blur(0px)" : "blur(4px)",
                        transition: `filter 400ms ${EASE_OUT}, color 300ms`,
                      }}
                    >
                      {emailText}
                    </span>
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{
                        fontFamily: FONT_MONO,
                        color: enriched ? "#0F172A" : "#94a3b8",
                        filter: enriched ? "blur(0px)" : "blur(4px)",
                        transition: `filter 400ms ${EASE_OUT}`,
                      }}
                    >
                      {phoneText}
                    </span>
                    <span className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => r.status === "preview" && void handleEnrichOne(r)}
                        className="flex h-[30px] items-center gap-[6px] rounded-full px-3 text-[12px] font-semibold transition-colors duration-200 active:scale-[0.96]"
                        style={{
                          fontFamily: FONT_BODY,
                          cursor: r.status === "preview" ? "pointer" : "default",
                          background: enriched ? "rgba(16,185,129,0.12)" : enrichingRow ? "#F1F5F9" : "#0F172A",
                          color: enriched ? "#047857" : enrichingRow ? "#64748b" : "#FFFFFF",
                        }}
                      >
                        {enriched ? (
                          <BadgeCheck size={13} />
                        ) : enrichingRow ? (
                          <Loader size={13} className={reducedMotion ? undefined : "animate-spin"} />
                        ) : (
                          <Zap size={13} />
                        )}
                        {enriched ? "Enriched" : enrichingRow ? "Enriching" : "Enrich"}
                      </button>
                    </span>
                  </div>
                );
              })}

            {!searching && shownRows.length === 0 && (
              <div
                className="border-t border-[#F1F5F9] px-6 py-8 text-center text-[13px] text-[#64748b]"
                style={{ fontFamily: FONT_BODY }}
              >
                {searched || rows.length > 0
                  ? "No contacts match these criteria. Broaden titles or departments and re-run."
                  : "No contacts yet. Run Find Contacts to pull the buying committee from the LIT network."}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-[6px] border-t border-[#EEF2F6] px-6 py-3 text-[12px] text-[#64748b]"
          style={{ fontFamily: FONT_BODY }}
        >
          <Info size={13} />
          Email and phone reveal after enrichment. Each enrichment uses 1 credit.
        </div>
      </Card>
    </div>
  );
}

export default ContactsTab;
