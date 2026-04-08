import React, { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Company, Contact } from '@/api/entities';
import {
  Search, Building2, Users, Download, Zap, Settings, ExternalLink,
  ChevronDown, ChevronUp, Sparkles, AlertCircle
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { searchLeads } from '@/api/functions';
import { PulseIcon } from '@/components/shared/AppIcons';

const PULSE_API_CONFIGURED = Boolean(import.meta.env.VITE_VIBE_API_KEY);

const INDUSTRIES = [
  'Freight Forwarding', 'Logistics', '3PL', 'Shipping', 'Transportation',
  'Supply Chain', 'Warehousing', 'Manufacturing', 'Import/Export',
  'Trucking', 'Ocean Freight', 'Air Freight', 'Rail Transport',
];

const COMPANY_SIZES = [
  { label: '1-10 employees', value: '1,10' },
  { label: '11-50 employees', value: '11,50' },
  { label: '51-200 employees', value: '51,200' },
  { label: '201-1000 employees', value: '201,1000' },
  { label: '1000+ employees', value: '1000,10000' },
];

function normalizeContact(contact) {
  return {
    name: contact?.name || contact?.full_name || '',
    full_name: contact?.full_name || contact?.name || '',
    title: contact?.title || '',
    department: contact?.department || contact?.dept || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    linkedin_url: contact?.linkedin_url || contact?.linkedin || '',
    linkedin: contact?.linkedin || contact?.linkedin_url || '',
    email_verified: contact?.email_verified || contact?.verified || false,
  };
}

export default function LeadProspecting() {
  const { user } = useAuth();
  const [searchMode, setSearchMode] = useState('natural');
  const [nlQuery, setNlQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState({
    industry: '',
    employee_count_min: '',
    employee_count_max: '',
    location: '',
    keywords: '',
    job_titles: 'CEO,President,VP Sales,Sales Manager,Logistics Manager,Operations Manager',
    company_size: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [apiStatus, setApiStatus] = useState(PULSE_API_CONFIGURED ? 'unknown' : 'warning');
  const [errorMessage, setErrorMessage] = useState('');

  const statusPill = useMemo(() => {
    if (apiStatus === 'connected') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-ping-dot" />
          Live API
        </span>
      );
    }

    if (apiStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          API Error
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {PULSE_API_CONFIGURED ? 'Not Verified' : 'Setup Required'}
      </span>
    );
  }, [apiStatus]);

  const handleSearch = async () => {
    setIsSearching(true);
    setErrorMessage('');
    setSearchPerformed(false);

    try {
      const criteria = searchMode === 'natural'
        ? { ...searchCriteria, keywords: nlQuery.trim(), query: nlQuery.trim(), mode: 'natural' }
        : { ...searchCriteria, mode: 'structured' };

      const response = await searchLeads(criteria);
      const results = Array.isArray(response?.data?.results) ? response.data.results : [];

      setSearchResults(results);
      setSearchPerformed(true);
      setApiStatus(response?.ok === false ? 'warning' : 'connected');

      if (!results.length && response?.error) {
        setApiStatus('error');
        setErrorMessage(typeof response.error === 'string' ? response.error : 'Search returned no usable records.');
      } else if (!results.length) {
        setErrorMessage('No companies matched the current search. Try broader criteria or verify the searchLeads edge function response.');
      }
    } catch (err) {
      console.error('Pulse search error:', err);
      setApiStatus('error');
      setSearchResults([]);
      setSearchPerformed(true);
      setErrorMessage(err?.message || 'Pulse search failed. Check the searchLeads edge function and payload mapping.');
    }

    setIsSearching(false);
  };

  const handleSelectAll = (checked) => {
    setSelectedCompanies(Boolean(checked) ? searchResults.map((c) => c.id) : []);
  };

  const handleSelectCompany = (companyId, checked) => {
    setSelectedCompanies((prev) =>
      Boolean(checked) ? [...prev, companyId] : prev.filter((id) => id !== companyId)
    );
  };

  const handleImportSelected = async () => {
    if (selectedCompanies.length === 0) return;

    setIsImporting(true);

    try {
      const selected = searchResults.filter((c) => selectedCompanies.includes(c.id));

      for (const result of selected) {
        const company = await Company.create({
          name: result.name,
          domain: result.domain,
          hq_city: result.city,
          hq_country: result.country,
          industry: result.industry,
          employee_count: result.employee_count,
          annual_revenue: result.annual_revenue,
          enrichment_status: 'enriched',
          enrichment_data: {
            source: 'pulse',
            imported_date: new Date().toISOString(),
            imported_by: user?.id ?? null,
            ...result,
          },
        });

        if (result.contacts?.length > 0) {
          for (const rawContact of result.contacts) {
            const contact = normalizeContact(rawContact);
            await Contact.create({
              company_id: company.id,
              full_name: contact.full_name || contact.name,
              title: contact.title,
              dept: contact.department,
              email: contact.email,
              phone: contact.phone,
              linkedin: contact.linkedin_url || contact.linkedin,
              source: 'pulse',
              verified: contact.email_verified || false,
            });
          }
        }
      }

      setSelectedCompanies([]);
    } catch (err) {
      console.error('Import error:', err);
      setErrorMessage('Import failed. Review Company / Contact entity permissions and payload fields.');
    }

    setIsImporting(false);
  };

  const toggleRow = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const estimatedCredits = searchResults.length > 0 ? searchResults.length * 5 : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Lead intelligence</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[40px] font-semibold tracking-[-0.03em] text-slate-950">Pulse</h1>
          {statusPill}
        </div>
        <p className="mt-2 max-w-3xl text-[15px] leading-6 text-slate-500">
          AI-powered lead discovery, contact enrichment, and import workflows for Logistics Intel.
        </p>
      </div>

      {!PULSE_API_CONFIGURED && (
        <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Settings className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Pulse API not configured</p>
            <p className="mt-0.5 text-sm text-amber-700">
              Connect your Explorium API key in Settings › Security & API to activate live results.
            </p>
          </div>
          <a
            href="/app/settings"
            className="flex-shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
          >
            Go to Settings →
          </a>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>{errorMessage}</div>
        </div>
      )}

      <div className="lit-dashboard-card overflow-hidden">
        <div className="lit-dashboard-card-body space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 ring-1 ring-slate-200/10">
                <PulseIcon className="h-7 w-7 text-cyan-300 pulse-orbit" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Pulse Workspace</div>
                <div className="text-sm text-slate-500">Natural language or structured search · Powered by Explorium</div>
              </div>
            </div>

            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
              {[
                { id: 'natural', label: 'Natural Language' },
                { id: 'structured', label: 'Structured Filters' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSearchMode(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    searchMode === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {searchMode === 'natural' ? (
            <div className="space-y-4">
              <textarea
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 resize-none"
                placeholder="Find VP of Sales at logistics companies with 50–500 employees in Georgia that import from Vietnam"
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !nlQuery.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <>
                    <PulseIcon className="h-4 w-4 text-cyan-300 pulse-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Search with Pulse
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Industry</label>
                  <Select value={searchCriteria.industry} onValueChange={(v) => setSearchCriteria({ ...searchCriteria, industry: v })}>
                    <SelectTrigger className="rounded-xl border-slate-200 text-sm">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Company Size</label>
                  <Select value={searchCriteria.company_size} onValueChange={(v) => setSearchCriteria({ ...searchCriteria, company_size: v })}>
                    <SelectTrigger className="rounded-xl border-slate-200 text-sm">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Location</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    placeholder="e.g., United States, New York"
                    value={searchCriteria.location}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, location: e.target.value })}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Keywords</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    placeholder="e.g., freight, logistics, shipping"
                    value={searchCriteria.keywords}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, keywords: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Target Job Titles</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    placeholder="Comma-separated titles"
                    value={searchCriteria.job_titles}
                    onChange={(e) => setSearchCriteria({ ...searchCriteria, job_titles: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Enrichment</p>
                {['Firmographics', 'Contact Info', 'Technographics', 'Intent Signals'].map((opt, i) => (
                  <label key={opt} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <Checkbox defaultChecked={i < 2} />
                    {opt}
                  </label>
                ))}
              </div>

              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <>
                    <PulseIcon className="h-4 w-4 text-cyan-300 pulse-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Search Pulse
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {!searchPerformed ? (
        <div className="lit-dashboard-card">
          <div className="lit-dashboard-card-body">
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <PulseIcon className="h-7 w-7 text-[var(--pulse-brand)] pulse-breathe" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-800">Ready to find your next customers</h3>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Try natural language: “Find logistics companies in Chicago with 50–500 employees”
              </p>
            </div>
          </div>
        </div>
      ) : searchResults.length === 0 ? (
        <div className="lit-dashboard-card">
          <div className="lit-dashboard-card-body">
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Search className="h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-semibold text-slate-700">No results found</h3>
              <p className="mt-1 text-sm text-slate-500">Try adjusting your search criteria or verify the searchLeads response mapping.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {estimatedCredits && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
              <Zap className="h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Estimated cost:</span> ~{estimatedCredits} credits for {searchResults.length} results
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => { setSearchPerformed(false); setSearchResults([]); setErrorMessage(''); }}
                  className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Refine Search
                </button>
              </div>
            </div>
          )}

          <div className="lit-dashboard-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedCompanies.length === searchResults.length && searchResults.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm font-semibold text-slate-700">{searchResults.length} companies found</span>
                {selectedCompanies.length > 0 && (
                  <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
                    {selectedCompanies.length} selected
                  </span>
                )}
              </div>
              <button
                onClick={handleImportSelected}
                disabled={selectedCompanies.length === 0 || isImporting}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <PulseIcon className="h-4 w-4 text-cyan-300 pulse-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Import Selected
                  </>
                )}
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Company</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 md:table-cell">Industry</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 lg:table-cell">Location</th>
                  <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 sm:table-cell">Employees</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Contacts</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {searchResults.map((company) => {
                  const isExpanded = expandedRows.has(company.id);

                  return (
                    <React.Fragment key={company.id}>
                      <tr className="transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-center">
                          <Checkbox
                            checked={selectedCompanies.includes(company.id)}
                            onCheckedChange={(checked) => handleSelectCompany(company.id, checked)}
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-slate-100 to-slate-200">
                              <Building2 className="h-3.5 w-3.5 text-slate-500" />
                            </div>
                            <span className="font-semibold text-slate-900">{company.name}</span>
                          </div>
                        </td>

                        <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{company.industry || '—'}</td>
                        <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                          {[company.city, company.country].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="hidden px-4 py-3 text-center text-slate-500 sm:table-cell">
                          {company.employee_count ? Number(company.employee_count).toLocaleString() : '—'}
                        </td>

                        <td className="px-4 py-3 text-center">
                          {company.contacts?.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
                              <Users className="h-3 w-3" />
                              {company.contacts.length}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {company.domain && (
                              <a
                                href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {company.contacts?.length > 0 && (
                              <button
                                onClick={() => toggleRow(company.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:text-cyan-800"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                Contacts
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && company.contacts?.length > 0 && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/70 px-6 py-3">
                            <div className="flex flex-wrap gap-2">
                              {company.contacts.slice(0, 5).map((rawContact, idx) => {
                                const contact = normalizeContact(rawContact);
                                return (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm"
                                  >
                                    <span className="font-semibold">{contact.name || contact.full_name}</span>
                                    <span className="text-slate-400">·</span>
                                    <span>{contact.title || 'Contact'}</span>
                                  </span>
                                );
                              })}
                              {company.contacts.length > 5 && (
                                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-500">
                                  +{company.contacts.length - 5} more
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
