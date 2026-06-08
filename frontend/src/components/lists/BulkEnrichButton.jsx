// BulkEnrichButton — client-side bulk contact enrichment for syncable Pulse Lists.
//
// Renders only when list.syncs_to_attio === true.
// Loops over every company in the list that has 0 contacts in pulse_list_contacts,
// calling fetchDecisionMakers + addContactToList for each sequentially.
// State is persisted to sessionStorage so a page refresh resumes where it left off.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchDecisionMakers } from '@/features/pulse/pulseSignals';
import { getListCompanies, addContactToList } from '@/features/pulse/pulseListsApi';

const fontDisplay = "'Space Grotesk', system-ui, sans-serif";
const fontBody = "'DM Sans', system-ui, sans-serif";

function ssKey(listId) {
  return `bulk-enrich:${listId}`;
}

function loadFromSession(listId) {
  try {
    const raw = sessionStorage.getItem(ssKey(listId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToSession(listId, state) {
  try {
    sessionStorage.setItem(ssKey(listId), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function clearSession(listId) {
  try {
    sessionStorage.removeItem(ssKey(listId));
  } catch {
    // ignore
  }
}

const INITIAL_STATE = {
  status: 'idle',            // 'idle' | 'loading' | 'running' | 'paused' | 'done'
  companies: [],
  currentIndex: 0,
  currentCompanyName: '',
  contactsFoundTotal: 0,
  skipped: { no_decision_makers: 0, apollo_error: 0 },
  errors: [],
  pauseRequested: false,
};

/**
 * BulkEnrichButton
 *
 * Props:
 *   list  — pulse_lists row ({ id, name, syncs_to_attio, ... })
 *
 * Renders nothing if list.syncs_to_attio !== true.
 */
export default function BulkEnrichButton({ list }) {
  if (!list?.syncs_to_attio) return null;

  const [st, setSt] = useState(() => {
    const saved = loadFromSession(list.id);
    if (saved && (saved.status === 'running' || saved.status === 'paused')) {
      // Resume from saved state — mark as paused so user can choose to continue
      return { ...INITIAL_STATE, ...saved, status: 'paused', pauseRequested: false };
    }
    if (saved && saved.status === 'done') {
      return { ...INITIAL_STATE, ...saved };
    }
    return { ...INITIAL_STATE };
  });

  // Mutable ref so the running async loop always reads the latest value
  const pauseRef = useRef(false);
  const stRef = useRef(st);
  stRef.current = st;

  // Persist whenever state changes (skip idle to avoid polluting storage)
  useEffect(() => {
    if (st.status !== 'idle') {
      saveToSession(list.id, st);
    }
  }, [st, list.id]);

  // ------------------------------------------------------------------
  // Step 1: Determine which company IDs in this list already have ≥1 contact
  // Returns a Set<companyId>
  // ------------------------------------------------------------------
  async function fetchEnrichedCompanyIds() {
    // pulse_list_contacts doesn't directly store company_id.
    // We join through lit_contacts which has company_id.
    const { data, error } = await supabase
      .from('pulse_list_contacts')
      .select('lit_contacts!inner(company_id)')
      .eq('list_id', list.id);

    if (error || !Array.isArray(data)) return new Set();
    const ids = new Set();
    for (const row of data) {
      const cid = row.lit_contacts?.company_id;
      if (cid) ids.add(cid);
    }
    return ids;
  }

  // ------------------------------------------------------------------
  // Step 2: Main enrichment loop
  // ------------------------------------------------------------------
  async function runEnrichLoop(companies, startIndex) {
    pauseRef.current = false;

    for (let i = startIndex; i < companies.length; i++) {
      // Check pause flag between iterations
      if (pauseRef.current) {
        setSt((s) => {
          const next = { ...s, status: 'paused', currentIndex: i, pauseRequested: false };
          saveToSession(list.id, next);
          return next;
        });
        return;
      }

      const company = companies[i];

      setSt((s) => ({
        ...s,
        currentIndex: i,
        currentCompanyName: company.name || company.domain || '…',
      }));

      try {
        // fetchDecisionMakers expects a company object with at minimum { domain } or { name }
        const result = await fetchDecisionMakers(company, { force: false });

        if (!result.ok || !Array.isArray(result.contacts) || result.contacts.length === 0) {
          setSt((s) => {
            const next = {
              ...s,
              skipped: {
                ...s.skipped,
                no_decision_makers: s.skipped.no_decision_makers + 1,
              },
            };
            saveToSession(list.id, next);
            return next;
          });
          continue;
        }

        // Add each returned contact to the list
        let added = 0;
        for (const contact of result.contacts) {
          if (!contact.id) continue;
          try {
            await addContactToList(list.id, contact.id, { companyId: company.id });
            added++;
          } catch (err) {
            console.warn('[BulkEnrich] addContactToList failed for', contact.id, err);
          }
        }

        setSt((s) => {
          const next = {
            ...s,
            contactsFoundTotal: s.contactsFoundTotal + added,
          };
          saveToSession(list.id, next);
          return next;
        });
      } catch (err) {
        console.error('[BulkEnrich] company failed', company.id, err);
        setSt((s) => {
          const next = {
            ...s,
            skipped: {
              ...s.skipped,
              apollo_error: s.skipped.apollo_error + 1,
            },
            errors: [...s.errors, { companyId: company.id, message: err?.message || String(err) }],
          };
          saveToSession(list.id, next);
          return next;
        });
      }
    }

    // Loop completed
    setSt((s) => {
      const next = { ...s, status: 'done', currentIndex: companies.length };
      saveToSession(list.id, next);
      return next;
    });
  }

  // Called when the loop finishes — show completion toast
  useEffect(() => {
    if (st.status !== 'done') return;
    const { companies, contactsFoundTotal, skipped, currentIndex } = st;
    const total = companies.length;
    const processed = Math.min(currentIndex, total);
    const parts = [
      `Enriched ${processed} / ${total} companies · ${contactsFoundTotal} contact${contactsFoundTotal !== 1 ? 's' : ''} added`,
    ];
    if (skipped.no_decision_makers > 0) {
      parts.push(`${skipped.no_decision_makers} returned no decision-makers`);
    }
    if (skipped.apollo_error > 0) {
      parts.push(`${skipped.apollo_error} failed (see console)`);
    }
    const msg = parts.join(' · ') + '\nSyncing to Attio in the background.';
    toast.success(msg, { duration: 8000 });
  }, [st.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  async function handleStart() {
    setSt((s) => ({ ...s, status: 'loading' }));

    // Fetch companies in the list
    const companiesRes = await getListCompanies(list.id);
    if (!companiesRes.ok || companiesRes.rows.length === 0) {
      setSt({ ...INITIAL_STATE });
      toast.error('No companies found in this list, or failed to load them.');
      return;
    }

    const allCompanies = companiesRes.rows;

    // Find which companies already have contacts (resume-safe skip)
    const enrichedIds = await fetchEnrichedCompanyIds();
    const toProcess = allCompanies.filter((c) => !enrichedIds.has(c.id));

    if (toProcess.length === 0) {
      setSt({ ...INITIAL_STATE, status: 'done', companies: allCompanies, currentIndex: allCompanies.length });
      toast.success('All companies in this list already have contacts — nothing to do.');
      return;
    }

    setSt((s) => ({
      ...s,
      status: 'running',
      companies: toProcess,
      currentIndex: 0,
      currentCompanyName: toProcess[0]?.name || '',
      contactsFoundTotal: 0,
      skipped: { no_decision_makers: 0, apollo_error: 0 },
      errors: [],
      pauseRequested: false,
    }));

    // Kick off loop (async — does not block render)
    runEnrichLoop(toProcess, 0);
  }

  function handleResume() {
    const { companies, currentIndex } = st;
    if (!companies.length) {
      // Stale session with no companies — restart fresh
      handleStart();
      return;
    }
    const resumeAt = Math.min(currentIndex, companies.length - 1);
    setSt((s) => ({
      ...s,
      status: 'running',
      pauseRequested: false,
      currentCompanyName: companies[resumeAt]?.name || '',
    }));
    runEnrichLoop(companies, resumeAt);
  }

  function handlePause() {
    pauseRef.current = true;
    setSt((s) => ({ ...s, pauseRequested: true }));
  }

  function handleReset() {
    clearSession(list.id);
    setSt({ ...INITIAL_STATE });
  }

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------
  const { status, companies, currentIndex, currentCompanyName, contactsFoundTotal, skipped } = st;
  const total = companies.length;
  const pct = total > 0 ? Math.round((currentIndex / total) * 100) : 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (status === 'idle') {
    // We don't know the exact company count until user clicks — show a
    // reasonable estimate from the list's company_count if available,
    // otherwise say "all companies".
    const estimateN = list.company_count ?? '?';
    const estimateMins = typeof estimateN === 'number' ? Math.ceil(estimateN * 2 / 60) : '?';
    const estimateCredits = typeof estimateN === 'number' ? estimateN * 5 : '?';

    return (
      <div
        className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-5"
        style={{ fontFamily: fontBody }}
      >
        <h3
          className="text-[15px] font-semibold text-slate-900"
          style={{ fontFamily: fontDisplay }}
        >
          Enrich contacts for all companies
        </h3>
        <p className="mt-1 text-[12.5px] text-slate-600">
          Estimated ~{estimateMins} minutes · ~{estimateCredits} Apollo credits ·
          Finds decision-makers and syncs them to Attio automatically.
        </p>
        <button
          type="button"
          onClick={handleStart}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors"
          style={{ fontFamily: fontDisplay }}
        >
          Start enrichment
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div
        className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-5"
        style={{ fontFamily: fontBody }}
      >
        <h3
          className="text-[15px] font-semibold text-slate-700"
          style={{ fontFamily: fontDisplay }}
        >
          Preparing enrichment run…
        </h3>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Loading companies and checking existing contacts.
        </p>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div
        className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5"
        style={{ fontFamily: fontBody }}
      >
        <h3
          className="text-[15px] font-semibold text-amber-900"
          style={{ fontFamily: fontDisplay }}
        >
          Enriching contacts…
        </h3>
        <p className="mt-2 text-[13px] text-amber-800">
          Now processing:{' '}
          <span className="font-mono font-semibold">{currentCompanyName || '…'}</span>
        </p>
        <p className="mt-1 text-[12.5px] text-amber-700">
          {currentIndex} / {total} companies · {contactsFoundTotal} contacts found so far
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
          <div
            className="h-full rounded-full bg-amber-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-amber-700">
          Keep this tab open — closing will pause the run
        </p>
        <button
          type="button"
          onClick={handlePause}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-[12.5px] font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
          style={{ fontFamily: fontDisplay }}
        >
          {st.pauseRequested ? 'Pausing…' : 'Pause'}
        </button>
      </div>
    );
  }

  if (status === 'paused') {
    return (
      <div
        className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        style={{ fontFamily: fontBody }}
      >
        <h3
          className="text-[15px] font-semibold text-slate-900"
          style={{ fontFamily: fontDisplay }}
        >
          Enrichment paused
        </h3>
        <p className="mt-1 text-[12.5px] text-slate-600">
          {currentIndex} / {total} companies processed · {contactsFoundTotal} contacts found
          {skipped.no_decision_makers > 0
            ? ` · ${skipped.no_decision_makers} skipped (no decision-makers)`
            : ''}
          {skipped.apollo_error > 0
            ? ` · ${skipped.apollo_error} failed`
            : ''}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleResume}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 transition-colors"
            style={{ fontFamily: fontDisplay }}
          >
            Resume
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ fontFamily: fontDisplay }}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div
        className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
        style={{ fontFamily: fontBody }}
      >
        <h3
          className="text-[15px] font-semibold text-emerald-900"
          style={{ fontFamily: fontDisplay }}
        >
          Enrichment complete
        </h3>
        <p className="mt-1 text-[12.5px] text-emerald-800">
          {Math.min(currentIndex, total)} / {total} companies processed · {contactsFoundTotal} contacts
          added
          {skipped.no_decision_makers > 0
            ? ` · ${skipped.no_decision_makers} returned no decision-makers`
            : ''}
          {skipped.apollo_error > 0
            ? ` · ${skipped.apollo_error} failed (see console)`
            : ''}
        </p>
        <p className="mt-1 text-[11.5px] text-emerald-700">
          Syncing to Attio in the background — check the People tab in your Attio workspace.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="mt-3 inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
          style={{ fontFamily: fontDisplay }}
        >
          Run again (new companies only)
        </button>
      </div>
    );
  }

  return null;
}
