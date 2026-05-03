// refreshList — re-run a saved list's source query and add any new
// company hits to the list. The "inbox" affordance: the user opens
// a list, hits Refresh, and Pulse goes back to its saved query, runs
// the cache-first cascade, identifies which results aren't already
// in the list, and bulk-adds them.
//
// All-client orchestration over existing helpers — no new edge fn,
// no schema. Honors the gated save-company edge fn so plan limits
// still apply when adding "discovered" companies.

import { searchPulse } from '@/api/pulse';
import { saveCompany, isLimitExceeded, LimitExceededError } from '@/lib/saveCompany';
import { searchLocalCompanies, mergeResults } from '@/features/pulse/pulseLocalSearch';
import {
  parsePulseQuery,
  buildLocalFilterRecipe,
} from '@/features/pulse/pulseQueryParser';
import {
  addCompanyToList,
  getListCompanies,
  markRefreshedNow,
} from '@/features/pulse/pulseListsApi';

const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/**
 * Re-run the list's source query and add new companies to the list.
 *
 * Returns:
 *   {
 *     ok: true,
 *     newAdded: number,       // companies just added to the list
 *     totalRun: number,       // total result rows the query returned
 *     skippedExisting: number,// already-member rows
 *     limitHit: boolean,      // plan-limit blocked saving any rows
 *     newCompanyIds: string[] // lit_companies.id of the new additions
 *   }
 *
 * On failure:
 *   { ok: false, code, message }
 */
export async function refreshList({ list, onProgress } = {}) {
  if (!list?.id) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List is required.' };
  }
  if (!list.query_text) {
    return {
      ok: false,
      code: 'NO_SOURCE_QUERY',
      message: 'This list has no source query — refresh requires the original prompt.',
    };
  }

  try {
    onProgress?.('Reading list members…');
    const existingResp = await getListCompanies(list.id);
    if (!existingResp.ok) {
      return { ok: false, code: existingResp.code, message: existingResp.message };
    }
    const existingIds = new Set(existingResp.rows.map((r) => r.id));

    onProgress?.('Re-running your search…');
    const parsed = parsePulseQuery(list.query_text);
    const recipe = buildLocalFilterRecipe(parsed);

    const [localOut, remoteOut] = await Promise.allSettled([
      searchLocalCompanies(list.query_text, 30, recipe),
      searchPulse({ query: list.query_text, ui_mode: 'auto' }),
    ]);

    const localRows = localOut.status === 'fulfilled' ? localOut.value.rows : [];
    const remoteRows =
      remoteOut.status === 'fulfilled' && Array.isArray(remoteOut.value?.data?.results)
        ? remoteOut.value.data.results
        : [];
    const merged = mergeResults(localRows, remoteRows);

    onProgress?.('Adding new matches…');
    let newAdded = 0;
    let skippedExisting = 0;
    let limitHit = false;
    const newCompanyIds = [];

    for (const row of merged) {
      // Resolve a lit_companies.id — local rows already have it, remote
      // rows need to be saved first via the gated edge fn.
      let companyId = isUuid(row.id) ? row.id : null;
      if (!companyId) {
        try {
          const sourceKey = row.business_id || row.id || row.domain || row.name;
          const result = await saveCompany({
            source_company_key: sourceKey,
            company_data: {
              source: 'pulse',
              source_company_key: sourceKey,
              name: row.name || 'Unknown Company',
              domain: row.domain || null,
              website: row.website || null,
              phone: row.phone || null,
              city: row.city || null,
              state: row.state || null,
              country_code: row.country || null,
            },
            stage: 'prospect',
          });
          if (!result.ok) {
            if (isLimitExceeded(result)) {
              limitHit = true;
              break; // bail — no point hammering
            }
            continue;
          }
          companyId = result.company?.id;
        } catch (err) {
          if (err instanceof LimitExceededError) {
            limitHit = true;
            break;
          }
          continue;
        }
      }

      if (!companyId) continue;

      if (existingIds.has(companyId)) {
        skippedExisting += 1;
        continue;
      }

      const add = await addCompanyToList(list.id, companyId);
      if (add.ok) {
        newAdded += 1;
        newCompanyIds.push(companyId);
        existingIds.add(companyId);
      }
    }

    markRefreshedNow(list.id);

    return {
      ok: true,
      newAdded,
      totalRun: merged.length,
      skippedExisting,
      limitHit,
      newCompanyIds,
    };
  } catch (err) {
    console.error('[Pulse] refreshList failed:', err);
    return {
      ok: false,
      code: 'NETWORK',
      message: err?.message || 'List refresh failed.',
    };
  }
}
