// Saved Lists API — thin wrappers around the pulse_lists +
// pulse_list_companies tables. RLS enforces user-scoping server-side;
// these helpers do not pass user_id explicitly so a stolen token can
// never read another user's lists.
//
// Every helper returns { ok: bool, ... } so call sites can branch on
// .ok the same way they do for saveCompany. When the migration hasn't
// been applied yet (fresh deploy), the table-not-found error is
// surfaced as code='TABLES_PENDING' so the UI can render a friendly
// "set up Saved Lists" empty state instead of crashing.

import { supabase } from '@/lib/supabase';

function classifyError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (
    msg.includes('relation') && msg.includes('does not exist') ||
    msg.includes("could not find the table") ||
    msg.includes('schema cache')
  ) {
    return 'TABLES_PENDING';
  }
  if (msg.includes('row level security') || msg.includes('not authorized')) {
    return 'UNAUTHORIZED';
  }
  return 'UNKNOWN';
}

/** List the current user's Saved Lists, newest-updated first. */
export async function listPulseLists() {
  try {
    const { data, error } = await supabase
      .from('pulse_lists')
      .select(`
        id,
        name,
        description,
        query_text,
        filter_recipe,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error) {
      const code = classifyError(error);
      return { ok: false, code, message: error.message, rows: [] };
    }

    // Fetch counts in a second pass so the row payload stays small.
    const ids = (data || []).map((r) => r.id);
    let countMap = {};
    if (ids.length) {
      const { data: counts } = await supabase
        .from('pulse_list_companies')
        .select('list_id', { count: 'exact', head: false })
        .in('list_id', ids);
      if (Array.isArray(counts)) {
        for (const row of counts) {
          countMap[row.list_id] = (countMap[row.list_id] || 0) + 1;
        }
      }
    }

    const rows = (data || []).map((r) => ({
      ...r,
      company_count: countMap[r.id] || 0,
    }));

    return { ok: true, rows };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, rows: [] };
  }
}

/** Create a new list. Returns { ok, list }. */
export async function createPulseList({ name, description, queryText, filterRecipe }) {
  if (!name || !String(name).trim()) {
    return { ok: false, code: 'INVALID_NAME', message: 'List name is required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp?.user) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in to create a list.' };
    }
    const { data, error } = await supabase
      .from('pulse_lists')
      .insert({
        user_id: userResp.user.id,
        name: String(name).trim().slice(0, 120),
        description: description ? String(description).trim().slice(0, 500) : null,
        query_text: queryText ? String(queryText).slice(0, 1000) : null,
        filter_recipe: filterRecipe || null,
      })
      .select()
      .single();
    if (error) {
      return { ok: false, code: classifyError(error), message: error.message };
    }
    return { ok: true, list: data };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Add a single company (by lit_companies.id) to a list. */
export async function addCompanyToList(listId, companyId, note) {
  if (!listId || !companyId) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + company are required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('pulse_list_companies')
      .upsert(
        {
          list_id: listId,
          company_id: companyId,
          added_by: userResp?.user?.id || null,
          note: note ? String(note).slice(0, 500) : null,
        },
        { onConflict: 'list_id,company_id' },
      );
    if (error) {
      return { ok: false, code: classifyError(error), message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Remove a company from a list. */
export async function removeCompanyFromList(listId, companyId) {
  try {
    const { error } = await supabase
      .from('pulse_list_companies')
      .delete()
      .eq('list_id', listId)
      .eq('company_id', companyId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Get the companies in a list, joined to lit_companies for display. */
export async function getListCompanies(listId) {
  if (!listId) return { ok: false, code: 'INVALID_INPUT', rows: [] };
  try {
    const { data, error } = await supabase
      .from('pulse_list_companies')
      .select(`
        added_at,
        note,
        lit_companies!inner (
          id,
          source,
          source_company_key,
          name,
          domain,
          website,
          phone,
          city,
          state,
          country_code,
          shipments_12m,
          teu_12m,
          est_spend_12m,
          most_recent_shipment_date,
          top_route_12m
        )
      `)
      .eq('list_id', listId)
      .order('added_at', { ascending: false })
      .limit(500);

    if (error) {
      return { ok: false, code: classifyError(error), message: error.message, rows: [] };
    }

    const rows = (data || [])
      .map((row) => {
        const c = row.lit_companies;
        if (!c) return null;
        return {
          id: c.id,
          name: c.name || 'Unknown Company',
          domain: c.domain || '',
          website: c.website || '',
          phone: c.phone || '',
          city: c.city || '',
          state: c.state || '',
          country: c.country_code || '',
          source: c.source,
          added_at: row.added_at,
          note: row.note,
          provenance: 'database',
          kpis: {
            shipments_12m: c.shipments_12m ?? null,
            teu_12m: c.teu_12m ?? null,
            est_spend_12m: c.est_spend_12m ?? null,
            most_recent_shipment_date: c.most_recent_shipment_date ?? null,
            top_route_12m: c.top_route_12m ?? null,
          },
        };
      })
      .filter(Boolean);

    return { ok: true, rows };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, rows: [] };
  }
}

/** Rename / re-describe a list. */
export async function updatePulseList(listId, patch) {
  try {
    const { error } = await supabase
      .from('pulse_lists')
      .update({
        ...(patch.name != null ? { name: String(patch.name).trim().slice(0, 120) } : {}),
        ...(patch.description != null
          ? { description: String(patch.description).trim().slice(0, 500) }
          : {}),
      })
      .eq('id', listId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Delete a list (membership rows cascade away). */
export async function deletePulseList(listId) {
  try {
    const { error } = await supabase.from('pulse_lists').delete().eq('id', listId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}
