// /app/lists — top-level Lists destination.
//
// Universal Lists, Step 1. Promotes pulse_lists from a Pulse-only
// surface into a first-class app concept used by:
//   - Pulse search ("Save to List")
//   - Company Profile contact rows ("Add to List")
//   - /app/campaigns/new audience picker (Step 2)
//
// Two views:
//   1) Index — every list the user owns, sorted by recent activity,
//      with company / contact / email-ready counts and a quick "Use in
//      campaign" CTA.
//   2) Detail — one list with Companies and Contacts tabs.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import {
  listPulseLists,
  getListCompanies,
  getListContacts,
  deletePulseList,
  removeContactFromList,
} from "@/features/pulse/pulseListsApi";

const fontDisplay = "'Space Grotesk', system-ui, sans-serif";
const fontBody = "'DM Sans', system-ui, sans-serif";

export default function ListsPage() {
  const { listId } = useParams();
  if (listId) return <ListDetail listId={listId} />;
  return <ListsIndex />;
}

function ListsIndex() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tablesPending, setTablesPending] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPulseLists().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "TABLES_PENDING") setTablesPending(true);
        else setError(res.message || "Failed to load lists.");
        setRows([]);
      } else {
        setRows(res.rows);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(q));
  }, [rows, filter]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-[20px] font-bold tracking-tight text-[#0F172A]"
              style={{ fontFamily: fontDisplay }}
            >
              Lists
            </h1>
            <p
              className="mt-0.5 text-[13px] text-slate-500"
              style={{ fontFamily: fontBody }}
            >
              Save companies and enriched contacts. Use them as audiences in campaigns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a list…"
                className="rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2.5 text-[12px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-300"
                style={{ fontFamily: fontBody }}
              />
            </div>
          </div>
        </header>

        {tablesPending ? (
          <EmptyCard
            title="Lists are not set up yet"
            body={`Apply migration 20260502120000_pulse_saved_lists.sql in Supabase to enable named lists.`}
          />
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]" style={{ fontFamily: fontBody }}>Loading lists…</span>
          </div>
        ) : error ? (
          <EmptyCard title="Couldn't load your lists" body={error} />
        ) : filtered.length === 0 ? (
          <EmptyCard
            title={rows.length === 0 ? "No lists yet" : "No matches"}
            body={
              rows.length === 0
                ? "Save companies from Pulse, or open a Company Profile and add a contact, to start a list."
                : "Try a different search."
            }
            cta={
              rows.length === 0 ? (
                <Link
                  to="/app/prospecting"
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                  style={{ fontFamily: fontDisplay }}
                >
                  <Plus className="h-3 w-3" />
                  Open Pulse
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => navigate(`/app/lists/${list.id}`)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[14px] font-semibold text-slate-900 group-hover:text-blue-700"
                      style={{ fontFamily: fontDisplay }}
                    >
                      {list.name}
                    </div>
                    <div
                      className="truncate text-[11px] text-slate-500"
                      style={{ fontFamily: fontBody }}
                    >
                      Updated {fmtRelative(list.updated_at)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="Companies" value={list.company_count ?? 0} icon={Building2} />
                  <Stat label="Created" value={shortDate(list.created_at)} icon={Users} />
                </div>
                {list.query_text ? (
                  <div
                    className="mt-3 truncate rounded-md bg-slate-50 px-2 py-1 text-[10.5px] text-slate-600"
                    style={{ fontFamily: fontBody }}
                  >
                    “{list.query_text.slice(0, 80)}{list.query_text.length > 80 ? "…" : ""}”
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListDetail({ listId }) {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [tab, setTab] = useState("companies");
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listPulseLists(),
      getListCompanies(listId),
      getListContacts(listId),
    ])
      .then(([listsRes, companiesRes, contactsRes]) => {
        if (cancelled) return;
        const found = (listsRes.rows || []).find((l) => l.id === listId);
        setList(found || null);
        setCompanies(companiesRes.rows || []);
        setContacts(contactsRes.rows || []);
        if (!listsRes.ok && listsRes.code !== "TABLES_PENDING") {
          setError(listsRes.message || "Failed to load list.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listId]);

  async function handleDelete() {
    if (!confirm(`Delete list "${list?.name || "this list"}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await deletePulseList(listId);
    setDeleting(false);
    if (!res.ok) {
      alert(res.message || "Failed to delete list.");
      return;
    }
    navigate("/app/lists");
  }

  async function handleRemoveContact(contactId) {
    const res = await removeContactFromList(listId, contactId);
    if (!res.ok) {
      alert(res.message || "Failed to remove contact.");
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  }

  const emailReady = contacts.filter((c) => c.email && c.email_verified).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <button
          type="button"
          onClick={() => navigate("/app/lists")}
          className="mb-3 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          <ArrowLeft className="h-3 w-3" /> All Lists
        </button>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span style={{ fontFamily: fontBody }}>Loading list…</span>
          </div>
        ) : !list ? (
          <EmptyCard title="List not found" body={error || "It may have been deleted."} />
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1
                  className="truncate text-[20px] font-bold tracking-tight text-[#0F172A]"
                  style={{ fontFamily: fontDisplay }}
                >
                  {list.name}
                </h1>
                {list.description ? (
                  <p className="mt-0.5 text-[13px] text-slate-500" style={{ fontFamily: fontBody }}>
                    {list.description}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/app/campaigns/new?audience_list=${list.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                  style={{ fontFamily: fontDisplay }}
                  title="Use this list as the audience in a new campaign"
                >
                  <Send className="h-3 w-3" /> Use in Campaign
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  style={{ fontFamily: fontDisplay }}
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>
              </div>
            </header>

            <div className="mb-4 grid grid-cols-3 gap-3">
              <KpiTile label="Companies" value={companies.length} icon={Building2} />
              <KpiTile label="Contacts" value={contacts.length} icon={Users} />
              <KpiTile label="Email-ready" value={emailReady} icon={Mail} accent />
            </div>

            <nav className="mb-3 inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px]">
              {[
                { k: "companies", label: `Companies (${companies.length})` },
                { k: "contacts", label: `Contacts (${contacts.length})` },
              ].map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTab(t.k)}
                  className={`rounded-[4px] px-3 py-1 font-semibold ${
                    tab === t.k
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  style={{ fontFamily: fontDisplay }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === "companies" ? (
              companies.length === 0 ? (
                <EmptyCard
                  title="No companies in this list"
                  body="Save companies from Pulse to add them here."
                />
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {companies.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-[13px] font-semibold text-slate-900"
                          style={{ fontFamily: fontDisplay }}
                        >
                          {c.name}
                        </div>
                        <div
                          className="truncate text-[11px] text-slate-500"
                          style={{ fontFamily: fontBody }}
                        >
                          {[c.city, c.state, c.country].filter(Boolean).join(" · ") || "—"}
                          {c.domain ? ` · ${c.domain}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : contacts.length === 0 ? (
              <EmptyCard
                title="No contacts in this list yet"
                body="Open a Company Profile, enrich a contact, then add them to this list."
              />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[13px] font-semibold text-slate-900"
                        style={{ fontFamily: fontDisplay }}
                      >
                        {c.full_name || "Unknown"}
                      </div>
                      <div
                        className="truncate text-[11px] text-slate-500"
                        style={{ fontFamily: fontBody }}
                      >
                        {c.title || "—"}
                        {c.email ? ` · ${c.email}` : ""}
                      </div>
                    </div>
                    {c.email_verified ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                        style={{ fontFamily: fontDisplay }}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(c.id)}
                      className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                      style={{ fontFamily: fontDisplay }}
                      title="Remove from this list"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, accent }) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 ${
        accent ? "ring-1 ring-blue-100" : ""
      }`}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500"
        style={{ fontFamily: fontDisplay }}
      >
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div
        className={`mt-0.5 text-[18px] font-bold ${accent ? "text-blue-700" : "text-slate-900"}`}
        style={{ fontFamily: fontDisplay }}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-600" style={{ fontFamily: fontBody }}>
      <Icon className="h-3 w-3 text-slate-400" />
      <span className="font-semibold">{value}</span>
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function EmptyCard({ title, body, cta }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Database className="mx-auto h-6 w-6 text-slate-300" />
      <div
        className="mt-2 text-[14px] font-semibold text-slate-700"
        style={{ fontFamily: fontDisplay }}
      >
        {title}
      </div>
      <div
        className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        {body}
      </div>
      {cta ? <div className="mt-3">{cta}</div> : null}
    </div>
  );
}

function fmtRelative(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const ms = Date.now() - t;
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function shortDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}
