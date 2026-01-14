import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { hasFeature, isAdmin } from "@/lib/access";
import ContactCard from "@/components/contacts/ContactCard";
import ContactProfileModal from "@/components/contacts/ContactProfileModal";
import { enrichContact } from "@/lib/enrichment/lusha";
import type { ContactCore } from "@/types/contacts";

function qstr(params: Record<string, string | number | null | undefined>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) u.set(k, String(v));
  });
  return u.toString();
}

const DEPARTMENTS = [
  'All Departments',
  'Sales',
  'Marketing',
  'Operations',
  'Supply Chain',
  'Logistics',
  'C-Suite',
  'Finance',
  'IT',
  'HR',
];

const SENIORITY_LEVELS = [
  'All Levels',
  'Entry',
  'Mid',
  'Senior',
  'Director',
  'VP',
  'C-Level',
];

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
  const [enriching, setEnriching] = useState(false);

  const selected = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; }
  }, []);

  const gated = !isAdmin() && !hasFeature("contacts");

  useEffect(() => {
    const company_id = selected?.company_id ?? null;
    const name = selected?.name ?? null;
    if (!company_id && !name) { setRows([]); return; }

    (async () => {
      setLoading(true); setErr(null);
      try {
        const qs = qstr({
          company_id: company_id || undefined,
          q: company_id ? undefined : name,
          limit: 100,
          offset: 0,
        });
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
  }, []);

  useEffect(() => {
    if (!rows) {
      setFilteredRows([]);
      return;
    }

    let filtered = [...rows];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (contact) =>
          contact.name?.toLowerCase().includes(query) ||
          contact.email?.toLowerCase().includes(query) ||
          contact.title?.toLowerCase().includes(query)
      );
    }

    if (selectedDepartment !== 'All Departments') {
      filtered = filtered.filter(
        (contact) => contact.department === selectedDepartment
      );
    }

    if (selectedSeniority !== 'All Levels') {
      filtered = filtered.filter(
        (contact) => contact.seniority === selectedSeniority
      );
    }

    setFilteredRows(filtered);
  }, [rows, searchQuery, selectedDepartment, selectedSeniority]);

  const handleViewProfile = (contact: ContactCore) => {
    setSelectedContact(contact);
    setIsProfileOpen(true);
  };

  const handleEnrichContact = async (contact: ContactCore) => {
    setEnriching(true);
    try {
      const result = await enrichContact({
        contactId: contact.id,
        email: contact.email,
        fullName: contact.name,
        companyName: selected?.name,
      });

      if (result.success && result.contact) {
        setRows((prev) =>
          (prev || []).map((c) =>
            c.id === contact.id ? { ...c, ...result.contact } : c
          )
        );
        toast.success('Contact enriched successfully', {
          description: `Added ${result.fieldsAdded?.length || 0} new fields • Cost: ${result.cost || 1} credit${(result.cost || 1) > 1 ? 's' : ''}`,
        });
        if (selectedContact?.id === contact.id) {
          setSelectedContact({ ...contact, ...result.contact });
        }
      } else {
        toast.error('Enrichment failed', {
          description: result.error || 'Unable to enrich this contact',
        });
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      toast.error('Enrichment failed', {
        description: 'An error occurred while enriching the contact',
      });
    } finally {
      setEnriching(false);
    }
  };

  const handleExportCsv = () => {
    if (!filteredRows.length) return;
    const header = ["name","title","department","seniority","email","phone","location"];
    const csv = [header.join(",")].concat(
      filteredRows.map(r => [
        r.name ?? "", r.title ?? "", r.department ?? "", r.seniority ?? "",
        r.email ?? "", r.phone ?? "", r.location ?? ""
      ].map(escapeCsv).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (gated) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Unlock Premium Contacts</h3>
          <p className="text-sm text-slate-600 mb-4">
            Upgrade to <span className="font-semibold">Pro</span> to access verified decision-makers with direct contact information.
          </p>
          <a
            href="/app/billing"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              Contacts
              {filteredRows.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  {filteredRows.length}
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Decision-makers and key contacts at this company
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleExportCsv}
            disabled={!filteredRows.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or title..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <select
            value={selectedSeniority}
            onChange={(e) => setSelectedSeniority(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-1 focus:ring-blue-500"
          >
            {SENIORITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            Error: {err}
          </div>
        )}

        {!loading && !err && filteredRows.length === 0 && (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">
              {rows && rows.length > 0
                ? 'No contacts match your filters'
                : 'No contacts found for this company'}
            </p>
          </div>
        )}

        {!loading && !err && filteredRows.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((contact, index) => (
              <ContactCard
                key={contact.id || index}
                contact={contact}
                onViewProfile={handleViewProfile}
                onEnrich={handleEnrichContact}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      <ContactProfileModal
        isOpen={isProfileOpen}
        contact={selectedContact}
        onClose={() => {
          setIsProfileOpen(false);
          setSelectedContact(null);
        }}
        onEnrich={handleEnrichContact}
      />
    </div>
  );
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
