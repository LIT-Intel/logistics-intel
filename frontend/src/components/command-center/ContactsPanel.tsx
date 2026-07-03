import { useEffect, useMemo, useState } from "react";
import { Search, Download, Sparkles, RefreshCw, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { hasFeature, isAdmin } from "@/lib/access";
import ContactCard from "@/components/contacts/ContactCard";
import ContactProfileModal from "@/components/contacts/ContactProfileModal";
import { enrichContact } from "@/lib/enrichment/lusha";
import EnrichmentCreditsBadge from "@/components/enrichment/EnrichmentCreditsBadge";
import type { ContactCore } from "@/types/contacts";

function qstr(params: Record<string, string | number | null | undefined>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) u.set(k, String(v));
  });
  return u.toString();
}

const DEPARTMENTS = ['All Departments', 'Sales', 'Marketing', 'Operations', 'Supply Chain', 'Logistics', 'C-Suite', 'Finance', 'IT', 'HR'];
const SENIORITY_LEVELS = ['All Levels', 'Entry', 'Mid', 'Senior', 'Director', 'VP', 'C-Level'];

function contactName(contact: ContactCore) {
  return contact.name || contact.fullName || contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown Contact';
}

export default function ContactsPanel() {
  const [rows, setRows] = useState<ContactCore[] | null>(null);
  const [filteredRows, setFilteredRows] = useState<ContactCore[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [selectedSeniority, setSelectedSeniority] = useState('All Levels');
  const [selectedContact, setSelectedContact] = useState<ContactCore | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [selectedRefresh, setSelectedRefresh] = useState(0);

  const selected = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; }
  }, [selectedRefresh]);

  useEffect(() => {
    const handler = () => setSelectedRefresh((prev) => prev + 1);
    window.addEventListener('storage', handler);
    const interval = setInterval(handler, 1000);
    return () => { window.removeEventListener('storage', handler); clearInterval(interval); };
  }, []);

  const gated = !isAdmin() && !hasFeature("contacts");

  useEffect(() => {
    const company_id = selected?.company_id ?? null;
    const name = selected?.name ?? null;
    if (!company_id && !name) { setRows([]); return; }

    (async () => {
      setLoading(true); setErr(null);
      try {
        const qs = qstr({ company_id: company_id || undefined, q: company_id ? undefined : name, limit: 100, offset: 0 });
        const r = await fetch(`/api/lit/public/contacts?${qs}`);
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        setRows(data?.rows || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load contacts");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selected?.company_id, selected?.name]);

  useEffect(() => {
    if (!rows) { setFilteredRows([]); return; }
    let filtered = [...rows];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((contact) =>
        contactName(contact).toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.title?.toLowerCase().includes(query)
      );
    }
    if (selectedDepartment !== 'All Departments') filtered = filtered.filter((contact) => contact.department === selectedDepartment);
    if (selectedSeniority !== 'All Levels') filtered = filtered.filter((contact) => contact.seniority === selectedSeniority);
    setFilteredRows(filtered);
  }, [rows, searchQuery, selectedDepartment, selectedSeniority]);

  const handleViewProfile = (contact: ContactCore) => {
    setSelectedContact(contact);
    setIsProfileOpen(true);
  };

  const handleEnrichContact = async (contact: ContactCore) => {
    setEnrichingId(contact.id);
    try {
      const result = await enrichContact({
        contactId: contact.id,
        email: contact.email,
        fullName: contactName(contact),
        companyName: selected?.name || contact.company_name,
        companyDomain: selected?.domain,
        linkedinUrl: contact.linkedin_url || contact.linkedin,
        title: contact.title,
      });

      if (result.success && result.pending) {
        const patch = { enrichment_status: 'pending', enrichment_provider: result.provider || 'lemlist' } as Partial<ContactCore>;
        setRows((prev) => (prev || []).map((c) => (c.id === contact.id ? { ...c, ...patch } : c)));
        if (selectedContact?.id === contact.id) setSelectedContact({ ...contact, ...patch });
        toast.success('Enrichment submitted', { description: 'LIT is enriching this profile. Results will appear after the enrichment job completes.' });
        return;
      }

      if (result.success && result.contact) {
        const patch = { ...result.contact, enrichment_status: 'complete', enrichment_provider: result.provider || result.contact.enrichment_provider } as Partial<ContactCore>;
        setRows((prev) => (prev || []).map((c) => (c.id === contact.id ? { ...c, ...patch } : c)));
        if (selectedContact?.id === contact.id) setSelectedContact({ ...contact, ...patch });
        toast.success('Contact enriched', { description: `Added ${result.fieldsAdded?.length || 0} available profile fields.` });
      } else {
        toast.error('Enrichment unavailable', { description: result.error || 'No enrichment data was returned for this contact.' });
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      toast.error('Enrichment failed', { description: 'An error occurred while enriching the contact.' });
    } finally {
      setEnrichingId(null);
    }
  };

  const handleExportCsv = () => {
    if (!filteredRows.length) return;
    const header = ["name","title","department","seniority","email","phone","linkedin","location"];
    const csv = [header.join(",")].concat(
      filteredRows.map((r) => [
        contactName(r), r.title ?? "", r.department ?? "", r.seniority ?? "", r.email ?? "",
        r.direct_dial || r.mobile_phone || r.phone || "", r.linkedin_url || r.linkedin || "", r.location ?? "",
      ].map(escapeCsv).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (gated) {
    return <LockedContacts />;
  }

  const enrichedCount = (rows || []).filter((r) => r.enrichment_status === 'complete' || r.enrichment_provider || r.source_provider).length;
  const pendingCount = (rows || []).filter((r) => r.enrichment_status === 'pending' || r.enrichment_status === 'submitted').length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-900 p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-cyan-200"><UsersRound className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Contact Intelligence</span></div>
              <h3 className="mt-1 text-xl font-bold">Decision-makers at {selected?.name || 'this company'}</h3>
              <p className="mt-1 text-sm text-slate-300">Find verified decision-makers, enrich selected profiles, and keep contacts ready for outreach.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EnrichmentCreditsBadge />
              <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/15" onClick={handleExportCsv} disabled={!filteredRows.length}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <MiniStat label="Contacts" value={rows?.length || 0} />
            <MiniStat label="Enriched" value={enrichedCount} />
            <MiniStat label="Pending" value={pendingCount} />
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, email, title..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <FilterSelect value={selectedDepartment} onChange={setSelectedDepartment} options={DEPARTMENTS} />
            <FilterSelect value={selectedSeniority} onChange={setSelectedSeniority} options={SENIORITY_LEVELS} />
          </div>
        </div>

        {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading contacts...</div>}
        {err && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">Error: {err}</div>}
        {!loading && !err && filteredRows.length === 0 && <EmptyContacts hasRows={Boolean(rows?.length)} />}
        {!loading && !err && filteredRows.length > 0 && (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((contact, index) => (
              <div key={contact.id || index} className={enrichingId === contact.id ? 'pointer-events-none opacity-70' : ''}>
                <ContactCard contact={contact} onViewProfile={handleViewProfile} onEnrich={handleEnrichContact} index={index} />
              </div>
            ))}
          </div>
        )}
      </div>

      <ContactProfileModal
        isOpen={isProfileOpen}
        contact={selectedContact}
        onClose={() => { setIsProfileOpen(false); setSelectedContact(null); }}
        onEnrich={handleEnrichContact}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2"><div className="text-lg font-bold tabular-nums">{value.toLocaleString()}</div><div className="text-[11px] uppercase tracking-wide text-slate-300">{label}</div></div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function EmptyContacts({ hasRows }: { hasRows: boolean }) {
  return <div className="py-12 text-center"><Sparkles className="mx-auto mb-3 h-12 w-12 text-slate-300" /><p className="text-sm font-semibold text-slate-700">{hasRows ? 'No contacts match your filters' : 'No contacts found for this company'}</p><p className="mt-1 text-xs text-slate-500">Use enrichment to add verified profile details when contacts are available.</p></div>;
}

function LockedContacts() {
  return <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100"><Sparkles className="h-6 w-6 text-blue-600" /></div><h3 className="mb-2 text-lg font-semibold text-slate-900">Unlock Premium Contacts</h3><p className="mb-4 text-sm text-slate-600">Upgrade to <span className="font-semibold">Pro</span> to access verified decision-makers with direct contact information.</p><a href="/app/billing" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">Upgrade to Pro</a></div>;
}

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}
