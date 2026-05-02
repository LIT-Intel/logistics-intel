// Shared result UI for Pulse — extracted from the legacy LeadProspecting page so
// the new Pulse page can render identical tables/drawer/error states without
// re-implementing them. Behavior is unchanged; the wrappers are pure
// presentational and call back into the page for save/enrich/campaign actions.

import {
  AlertCircle,
  Bookmark,
  Building2,
  ExternalLink,
  Eye,
  Mail,
  Phone,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

export function classifyPulseError(message) {
  if (!message) return 'none';
  const lowered = String(message).toLowerCase();
  if (
    lowered.includes('provider permission issue') ||
    lowered.includes('403') ||
    lowered.includes('endpoint forbidden') ||
    lowered.includes('check api key scopes/plan')
  ) {
    return 'permission';
  }
  if (lowered.includes('not configured') || lowered.includes('disabled')) {
    return 'setup';
  }
  return 'generic';
}

export function StatusPill({ status }) {
  const value = (status || '').toLowerCase();
  if (value.includes('high') || value.includes('active')) {
    return (
      <span className='inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700'>
        Active
      </span>
    );
  }
  return (
    <span className='inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600'>
      Prospect
    </span>
  );
}

export function ResultsSkeleton() {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
        Searching live business and contact data
      </div>
      <div className='divide-y divide-slate-100'>
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className='flex items-center gap-4 px-4 py-4'>
            <Skeleton className='h-10 w-10 rounded-lg' />
            <div className='flex-1 space-y-2'>
              <Skeleton className='h-3.5 w-1/3' />
              <Skeleton className='h-3 w-1/2' />
            </div>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-3 w-16' />
            <Skeleton className='h-7 w-7 rounded-full' />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PermissionIssueState({ message }) {
  return (
    <section className='rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm'>
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white'>
          <ShieldAlert className='h-5 w-5 text-orange-600' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-orange-900'>Apollo API permission issue</h3>
          <p className='mt-1 text-sm leading-6 text-orange-800'>
            Your API key exists, but Apollo rejected the endpoint. This usually means the current
            Apollo plan or API scopes do not allow this search endpoint.
          </p>
          <p className='mt-2 text-sm leading-6 text-orange-800'>
            Enable Apollo prospecting API access on the key (or upgrade the plan), or import data
            into your Apollo CRM so the fallback CRM endpoints return results.
          </p>
          {message ? (
            <pre className='mt-3 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] text-orange-900'>
              {message}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function EmptySetupState({ message }) {
  return (
    <section className='rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm'>
      <div className='flex items-start gap-3'>
        <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white'>
          <Settings className='h-5 w-5 text-amber-600' />
        </div>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold text-amber-900'>Pulse provider setup required</h3>
          <p className='mt-1 text-sm leading-6 text-amber-800'>
            The search backend reported a configuration error. Confirm that
            <span className='mx-1 font-mono text-[12px]'>APOLLO_API_KEY</span>,
            <span className='mx-1 font-mono text-[12px]'>TAVILY_API_KEY</span>, and
            <span className='mx-1 font-mono text-[12px]'>HUNTER_API_KEY</span> are set in your
            Supabase project secrets, redeploy the searchLeads function if needed, then retry.
          </p>
          {message ? (
            <pre className='mt-3 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono text-[11px] text-amber-900'>
              {message}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className='flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
      <AlertCircle className='mt-0.5 h-5 w-5 flex-shrink-0' />
      <div>{message}</div>
    </div>
  );
}

export function ContactDetailDrawer({ contact, open, onClose, onEnrich, isEnriching }) {
  if (!open || !contact) return null;
  return (
    <div className='fixed inset-0 z-50 flex justify-end bg-slate-950/30'>
      <button
        type='button'
        className='absolute inset-0 cursor-default'
        onClick={onClose}
        aria-label='Close'
      />
      <div className='relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h3 className='text-xl font-semibold text-[#17233C]'>
              {contact.full_name || 'Unknown Contact'}
            </h3>
            <p className='mt-1 text-sm text-slate-500'>
              {[contact.title, contact.company?.name].filter(Boolean).join(' • ') || 'Contact'}
            </p>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-[#17233C]'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
          <Field label='Company' value={contact.company?.name || '—'} strong />
          <Field
            label='Location'
            value={
              [contact.company?.city, contact.company?.state, contact.company?.country]
                .filter(Boolean)
                .join(', ') || '—'
            }
          />
          <Field label='Email' value={contact.email || 'Not enriched yet'} />
          <Field label='Phone' value={contact.phone || 'Not enriched yet'} />
          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>LinkedIn</div>
            <div className='mt-1 text-sm text-slate-700'>
              {contact.linkedin_url ? (
                <a
                  href={contact.linkedin_url}
                  target='_blank'
                  rel='noreferrer'
                  className='text-[#4C6FFF] hover:underline'
                >
                  {contact.linkedin_url}
                </a>
              ) : 'Not available'}
            </div>
          </div>
        </div>

        <div className='mt-6 flex gap-3'>
          <button
            type='button'
            onClick={() => onEnrich(contact)}
            disabled={isEnriching || !contact.prospect_id}
            title={
              !contact.prospect_id
                ? 'Enrichment requires a prospect_id from a provider search result.'
                : ''
            }
            className='inline-flex items-center gap-2 rounded-full bg-[#17233C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D2C4A] disabled:opacity-50'
          >
            {isEnriching ? <Sparkles className='h-4 w-4 animate-pulse' /> : <Mail className='h-4 w-4' />}
            Enrich Contact
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }) {
  return (
    <div>
      <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-400'>{label}</div>
      <div className={['mt-1 text-sm', strong ? 'font-medium text-[#17233C]' : 'text-slate-700'].join(' ')}>
        {value}
      </div>
    </div>
  );
}

export function CompanyResultsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onOpenSearch,
  onSaveCompany,
  onAddToCampaign,
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1080px]'>
          <thead className='border-b border-slate-200 bg-slate-50'>
            <tr className='text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
              <th className='px-4 py-4'></th>
              <th className='px-4 py-4'>Company</th>
              <th className='px-4 py-4'>Domain</th>
              <th className='px-4 py-4'>Location</th>
              <th className='px-4 py-4'>Industry</th>
              <th className='px-4 py-4'>Employees</th>
              <th className='px-4 py-4'>Revenue</th>
              <th className='px-4 py-4'>Status</th>
              <th className='px-4 py-4'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((company) => (
              <tr key={company.id} className='border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50'>
                <td className='px-4 py-4 align-top'>
                  <Checkbox
                    checked={selectedIds.includes(company.id)}
                    onCheckedChange={(checked) => onToggleSelect(company.id, Boolean(checked))}
                  />
                </td>
                <td className='px-4 py-4 align-top'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-[#EEF3FF]'>
                      <Building2 className='h-4 w-4 text-[#4C6FFF]' />
                    </div>
                    <div>
                      <div className='font-semibold text-[#17233C]'>{company.name}</div>
                      <div className='text-sm text-slate-500'>{company.industry || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {company.domain ? (
                    <a
                      href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`}
                      target='_blank'
                      rel='noreferrer'
                      className='inline-flex items-center gap-1 text-[#4C6FFF] hover:underline'
                    >
                      {company.domain}
                      <ExternalLink className='h-3 w-3' />
                    </a>
                  ) : '—'}
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {[company.city, company.state, company.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>{company.industry || '—'}</td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>{company.employee_count || '—'}</td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>{company.annual_revenue || '—'}</td>
                <td className='px-4 py-4 align-top'><StatusPill status={company.status} /></td>
                <td className='px-4 py-4 align-top'>
                  <div className='flex items-center gap-3 text-slate-500'>
                    <button type='button' onClick={() => onOpenSearch(company)} className='hover:text-[#17233C]' title='Open in Search'>
                      <Eye className='h-4 w-4' />
                    </button>
                    <button type='button' onClick={() => onSaveCompany(company)} className='hover:text-[#4C6FFF]' title='Save to Command Center'>
                      <Bookmark className='h-4 w-4' />
                    </button>
                    <button type='button' onClick={() => onAddToCampaign(company)} className='hover:text-[#4C6FFF]' title='Save and add to Campaign'>
                      <Target className='h-4 w-4' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PeopleResultsTable({
  rows,
  selectedIds,
  onToggleSelect,
  onSaveContact,
  onOpenCompanySearch,
  onViewContact,
  onAddToCampaign,
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[1280px]'>
          <thead className='border-b border-slate-200 bg-slate-50'>
            <tr className='text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'>
              <th className='px-4 py-4'></th>
              <th className='px-4 py-4'>Contact</th>
              <th className='px-4 py-4'>Title</th>
              <th className='px-4 py-4'>Company</th>
              <th className='px-4 py-4'>Location</th>
              <th className='px-4 py-4'>Email</th>
              <th className='px-4 py-4'>Phone</th>
              <th className='px-4 py-4'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => (
              <tr key={person.id} className='border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50'>
                <td className='px-4 py-4 align-top'>
                  <Checkbox
                    checked={selectedIds.includes(person.id)}
                    onCheckedChange={(checked) => onToggleSelect(person.id, Boolean(checked))}
                  />
                </td>
                <td className='px-4 py-4 align-top'>
                  <button type='button' onClick={() => onViewContact(person)} className='flex items-start gap-3 text-left'>
                    <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100'>
                      <UserRound className='h-4 w-4 text-slate-500' />
                    </div>
                    <div>
                      <div className='font-semibold text-[#17233C] hover:text-[#4C6FFF]'>
                        {person.full_name || 'Unknown Contact'}
                      </div>
                      <div className='text-sm text-slate-500'>
                        {person.department || person.seniority || 'Contact'}
                      </div>
                    </div>
                  </button>
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>{person.title || '—'}</td>
                <td className='px-4 py-4 align-top'>
                  <div className='font-medium text-[#17233C]'>{person.company?.name || 'Unknown Company'}</div>
                  <div className='text-sm text-slate-500'>{person.company?.industry || '—'}</div>
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {[person.company?.city, person.company?.state, person.company?.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {person.email ? (
                    <span className='inline-flex items-center gap-1 rounded-full bg-[#EEF3FF] px-2.5 py-1 font-medium text-[#4C6FFF]'>
                      <Mail className='h-3 w-3' />
                      {person.email}
                    </span>
                  ) : (
                    <span className='inline-flex items-center gap-1 rounded-full border border-dashed border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-400'>
                      Not enriched
                    </span>
                  )}
                </td>
                <td className='px-4 py-4 align-top text-sm text-slate-700'>
                  {person.phone ? (
                    <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700'>
                      <Phone className='h-3 w-3' />
                      {person.phone}
                    </span>
                  ) : '—'}
                </td>
                <td className='px-4 py-4 align-top'>
                  <div className='flex items-center gap-3 text-slate-500'>
                    <button type='button' onClick={() => onSaveContact(person)} className='hover:text-[#4C6FFF]' title='Save to Command Center'>
                      <Bookmark className='h-4 w-4' />
                    </button>
                    <button type='button' onClick={() => onOpenCompanySearch(person.company)} className='hover:text-[#17233C]' title='Open Company in Search'>
                      <Eye className='h-4 w-4' />
                    </button>
                    <button type='button' onClick={() => onAddToCampaign(person)} className='hover:text-[#4C6FFF]' title='Save company and add to Campaign'>
                      <Target className='h-4 w-4' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
