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

/** List the user's own + org-shared Saved Lists, newest-updated first.
 *  RLS handles the visibility filter; we also pull owner info so the
 *  UI can show "Shared by Jane Doe" on lists that aren't yours. */
export async function listPulseLists() {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const currentUserId = userResp?.user?.id || null;

    const { data, error } = await supabase
      .from('pulse_lists')
      .select(`
        id,
        user_id,
        name,
        description,
        query_text,
        filter_recipe,
        org_id,
        is_shared,
        shared_at,
        syncs_to_attio,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })
      .limit(80);

    if (error) {
      const code = classifyError(error);
      return { ok: false, code, message: error.message, rows: [] };
    }

    // Membership counts (second pass keeps the row payload small)
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

    // Owner display lookup — only fetch profiles for non-self lists.
    const ownerIds = Array.from(
      new Set(
        (data || [])
          .filter((r) => r.user_id && r.user_id !== currentUserId)
          .map((r) => r.user_id),
      ),
    );
    const ownerMap = await fetchOwnerDisplay(ownerIds);

    const rows = (data || []).map((r) => ({
      ...r,
      company_count: countMap[r.id] || 0,
      is_owner: r.user_id === currentUserId,
      owner: r.user_id === currentUserId ? null : ownerMap[r.user_id] || null,
    }));

    return { ok: true, rows };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, rows: [] };
  }
}

// Best-effort user display for owner/assignee names. Primary source is
// org_members (email + full_name, most complete); falls back to profiles, then
// a user_id slug. Failures degrade silently.
async function fetchOwnerDisplay(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return {};
  const map = {};
  const slug = (id) => `User ${String(id).slice(0, 6)}`;

  try {
    const { data } = await supabase
      .from('org_members').select('user_id, full_name, email').in('user_id', ids);
    for (const r of data || []) {
      if (!r.user_id || map[r.user_id]) continue;
      map[r.user_id] = {
        name: (r.full_name && r.full_name.trim()) || (r.email ? r.email.split('@')[0] : slug(r.user_id)),
        email: r.email || null,
        avatar_url: null,
      };
    }
  } catch { /* ignore */ }

  const missing = ids.filter((id) => !map[id]);
  if (missing.length) {
    try {
      const { data } = await supabase
        .from('profiles').select('id, full_name, email').in('id', missing);
      for (const p of data || []) {
        map[p.id] = {
          name: (p.full_name && p.full_name.trim()) || (p.email ? p.email.split('@')[0] : slug(p.id)),
          email: p.email || null,
          avatar_url: null,
        };
      }
    } catch { /* ignore */ }
  }
  return map;
}

/**
 * Batch-fetch list memberships for a set of search-result items.
 *
 * Pulse search returns Apollo discoveries with synthetic IDs (e.g.
 * "apollo:abc123") that never exist in pulse_list_companies until the
 * company is explicitly saved. Querying by ID alone always returns
 * empty results for unsaved Apollo rows, so the Saved badge never shows.
 *
 * Fix: look up by domain instead. Joins pulse_list_companies →
 * lit_companies and filters by lit_companies.domain IN (unique domains).
 * This correctly matches already-saved companies regardless of whether
 * the search-result ID is synthetic or a real UUID.
 *
 * The return Map is still keyed by the original search-result item.id
 * so ResultCard rendering (savedMemberships.get(c.id)) is unchanged.
 *
 * @param {Array<{ id: string, domain: string | null }>} items
 * @returns {Promise<Map<string, string[]>>}  Map<item.id, listName[]>
 */
export async function fetchListMembershipsForCompanies(items) {
  if (!items || items.length === 0) return new Map();

  // Normalise: accept legacy string[] callers (UUID-only path) for safety,
  // converting them to the new { id, domain: null } shape.
  const normalised = items.map((x) =>
    typeof x === 'string' ? { id: x, domain: null } : x,
  );

  // Collect unique non-empty domains
  const domains = Array.from(
    new Set(normalised.map((x) => x.domain).filter(Boolean)),
  );

  if (domains.length === 0) return new Map();

  try {
    // Single query: join pulse_list_companies → lit_companies, filter by domain.
    // The join key is pulse_list_companies.company_id = lit_companies.id.
    const { data, error } = await supabase
      .from('pulse_list_companies')
      .select('company_id, pulse_lists(name), lit_companies!inner(domain)')
      .in('lit_companies.domain', domains);

    if (error || !Array.isArray(data)) return new Map();

    // Build domain → list names map
    const domainToListNames = new Map();
    for (const row of data) {
      const domain = row.lit_companies?.domain;
      const listName = row.pulse_lists?.name;
      if (!domain || !listName) continue;
      if (!domainToListNames.has(domain)) domainToListNames.set(domain, []);
      domainToListNames.get(domain).push(listName);
    }

    // Map each original item.id → list names via its domain
    const result = new Map();
    for (const item of normalised) {
      if (!item.domain) continue;
      const listNames = domainToListNames.get(item.domain);
      if (listNames && listNames.length > 0) {
        result.set(item.id, listNames);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/** Toggle a list's org-share state. The list owner's org_id is
 *  required when sharing; we accept it as an arg so the caller (with
 *  AuthProvider context) can pass it cleanly. Unshare clears
 *  is_shared but keeps org_id stamped for audit. */
export async function shareList(listId, share, orgId) {
  if (!listId) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List id is required.' };
  }
  if (share && !orgId) {
    return {
      ok: false,
      code: 'NO_ORG',
      message: 'You need to be a member of an organization to share a list.',
    };
  }
  try {
    const patch = share
      ? { is_shared: true, org_id: orgId, shared_at: new Date().toISOString() }
      : { is_shared: false };
    const { error } = await supabase.from('pulse_lists').update(patch).eq('id', listId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/* ─── Per-member assignment (Pulse Lists v3) ─── */

/** The caller's fellow org members — powers the "assign to teammate" picker.
 *  Resolves the caller's first org (matches the workspace-KPI convention),
 *  then returns the OTHER members with display names. Excludes the caller. */
export async function listOrgMembers() {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const uid = userResp?.user?.id || null;
    if (!uid) return { ok: false, code: 'UNAUTHORIZED', orgId: null, members: [] };

    const { data: mine } = await supabase
      .from('org_members').select('org_id').eq('user_id', uid).limit(1);
    const orgId = mine?.[0]?.org_id || null;
    if (!orgId) return { ok: true, orgId: null, members: [] };

    // org_members carries email + full_name directly (more complete than the
    // profiles mirror — 119 vs 76 rows), so read display straight from it.
    const { data: rows, error } = await supabase
      .from('org_members').select('user_id, role, email, full_name').eq('org_id', orgId);
    if (error) return { ok: false, code: classifyError(error), message: error.message, orgId, members: [] };

    const members = (rows || [])
      .filter((r) => r.user_id && r.user_id !== uid)
      .map((r) => {
        const email = r.email || null;
        const name = (r.full_name && r.full_name.trim())
          || (email ? email.split('@')[0] : null)
          || `User ${String(r.user_id).slice(0, 6)}`;
        return { user_id: r.user_id, role: r.role || 'member', name, email, avatar_url: null };
      })
      // Prefer named/emailed members first so the picker reads cleanly.
      .sort((a, b) => Number(Boolean(b.email)) - Number(Boolean(a.email)) || a.name.localeCompare(b.name));
    return { ok: true, orgId, members };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, orgId: null, members: [] };
  }
}

/** Assign a saved list to one or more teammates. Owner-only (RLS enforced).
 *  The assignee sees it in their Library on next load. */
export async function assignList(listId, userIds) {
  if (!listId || !userIds?.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Pick at least one teammate.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const assignedBy = userResp?.user?.id || null;
    const rows = Array.from(new Set(userIds.filter(Boolean))).map((uid) => ({
      list_id: listId,
      assignee_user_id: uid,
      assigned_by: assignedBy,
    }));
    const { error } = await supabase
      .from('pulse_list_assignments')
      .upsert(rows, { onConflict: 'list_id,assignee_user_id' });
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true, assigned: rows.length };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Remove a teammate's assignment (owner) or leave a list (assignee). */
export async function unassignList(listId, userId) {
  if (!listId || !userId) return { ok: false, code: 'INVALID_INPUT' };
  try {
    const { error } = await supabase
      .from('pulse_list_assignments')
      .delete()
      .eq('list_id', listId)
      .eq('assignee_user_id', userId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Who a list is currently assigned to (owner-visible), with display names. */
export async function getListAssignees(listId) {
  if (!listId) return { ok: false, rows: [] };
  try {
    const { data, error } = await supabase
      .from('pulse_list_assignments')
      .select('assignee_user_id, assigned_at')
      .eq('list_id', listId);
    if (error) return { ok: false, code: classifyError(error), message: error.message, rows: [] };
    const ids = (data || []).map((r) => r.assignee_user_id).filter(Boolean);
    const display = await fetchOwnerDisplay(ids);
    const rows = (data || []).map((r) => ({
      user_id: r.assignee_user_id,
      assigned_at: r.assigned_at,
      name: display[r.assignee_user_id]?.name || `User ${String(r.assignee_user_id).slice(0, 6)}`,
      email: display[r.assignee_user_id]?.email || null,
      avatar_url: display[r.assignee_user_id]?.avatar_url || null,
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

/** Bulk-add multiple companies (array of lit_companies.id) to a list.
 *  Uses a single upsert call for atomicity. Returns { ok, added } where
 *  added is the count of rows that were inserted or already existed.
 *  Duplicates are silently ignored (onConflict = do nothing). */
export async function bulkAddCompaniesToList(listId, companyIds) {
  if (!listId || !companyIds?.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + companies are required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const addedBy = userResp?.user?.id || null;

    const rows = companyIds.map((cid) => ({
      list_id: listId,
      company_id: cid,
      added_by: addedBy,
    }));

    const { error } = await supabase
      .from('pulse_list_companies')
      .upsert(rows, { onConflict: 'list_id,company_id' });

    if (error) {
      return { ok: false, code: classifyError(error), message: error.message };
    }
    return { ok: true, added: companyIds.length };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Bulk-add multiple contacts (array of lit_contacts.id) to a list.
 *  Uses a single upsert call for atomicity. */
export async function bulkAddContactsToList(listId, contactIds) {
  if (!listId || !contactIds?.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + contacts are required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const addedBy = userResp?.user?.id || null;

    const rows = contactIds.map((cid) => ({
      list_id: listId,
      contact_id: cid,
      added_by: addedBy,
    }));

    const { error } = await supabase
      .from('pulse_list_contacts')
      .upsert(rows, { onConflict: 'list_id,contact_id' });

    if (error) {
      return { ok: false, code: classifyError(error), message: error.message };
    }
    return { ok: true, added: contactIds.length };
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

/** Add a single enriched contact (lit_contacts.id) to a list.
 *  Optionally adds the parent company to pulse_list_companies in the
 *  same call so the list view always shows the company card. */
export async function addContactToList(listId, contactId, { companyId, note } = {}) {
  if (!listId || !contactId) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + contact are required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const addedBy = userResp?.user?.id || null;

    if (companyId) {
      // Best-effort — if the company is already in the list, the upsert
      // is a no-op. We don't fail the contact add on company-add errors.
      await supabase
        .from('pulse_list_companies')
        .upsert(
          { list_id: listId, company_id: companyId, added_by: addedBy },
          { onConflict: 'list_id,company_id' },
        );
    }

    const { error } = await supabase
      .from('pulse_list_contacts')
      .upsert(
        {
          list_id: listId,
          contact_id: contactId,
          added_by: addedBy,
          note: note ? String(note).slice(0, 500) : null,
        },
        { onConflict: 'list_id,contact_id' },
      );
    if (error) {
      return { ok: false, code: classifyError(error), message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Remove a contact from a list. */
export async function removeContactFromList(listId, contactId) {
  try {
    const { error } = await supabase
      .from('pulse_list_contacts')
      .delete()
      .eq('list_id', listId)
      .eq('contact_id', contactId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Get the explicit contacts in a list, joined to lit_contacts +
 *  parent company name. Used by the campaign audience picker so it
 *  can show "12 explicit contacts + 47 from company membership" and
 *  by the Lists page when surfacing per-contact rows. */
export async function getListContacts(listId) {
  if (!listId) return { ok: false, code: 'INVALID_INPUT', rows: [] };
  try {
    const { data, error } = await supabase
      .from('pulse_list_contacts')
      .select(`
        added_at,
        note,
        lit_contacts!inner (
          id,
          company_id,
          full_name,
          first_name,
          last_name,
          title,
          email,
          email_verified,
          email_verification_status,
          linkedin_url,
          city,
          state,
          country_code
        )
      `)
      .eq('list_id', listId)
      .order('added_at', { ascending: false })
      .limit(1000);
    if (error) {
      return { ok: false, code: classifyError(error), message: error.message, rows: [] };
    }
    const rows = (data || [])
      .map((row) => {
        const c = row.lit_contacts;
        if (!c) return null;
        return {
          id: c.id,
          company_id: c.company_id,
          full_name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' '),
          first_name: c.first_name || null,
          last_name: c.last_name || null,
          title: c.title || null,
          email: c.email || null,
          email_verified: !!c.email_verified,
          email_verification_status: c.email_verification_status || null,
          linkedin_url: c.linkedin_url || null,
          city: c.city || null,
          state: c.state || null,
          country: c.country_code || null,
          added_at: row.added_at,
          note: row.note,
        };
      })
      .filter(Boolean);
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, rows: [] };
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

/* ─── Auto-refresh + inbox ─── */

/** Update a list's auto-refresh cadence ('off' | 'daily' | 'weekly'). */
export async function setAutoRefresh(listId, cadence) {
  if (!['off', 'daily', 'weekly'].includes(cadence)) {
    return { ok: false, code: 'INVALID_CADENCE', message: 'Invalid cadence.' };
  }
  try {
    const { error } = await supabase
      .from('pulse_lists')
      .update({ auto_refresh_cadence: cadence })
      .eq('id', listId);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Read the inbox (pending matches) for a list, joined to lit_companies. */
export async function getListInbox(listId) {
  if (!listId) return { ok: false, code: 'INVALID_INPUT', rows: [] };
  try {
    const { data, error } = await supabase
      .from('pulse_list_inbox')
      .select(`
        company_id,
        found_at,
        match_reason,
        status,
        lit_companies!inner (
          id,
          name,
          domain,
          website,
          phone,
          city,
          state,
          country_code,
          shipments_12m,
          teu_12m,
          most_recent_shipment_date,
          top_route_12m
        )
      `)
      .eq('list_id', listId)
      .eq('status', 'pending')
      .order('found_at', { ascending: false })
      .limit(50);
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
          found_at: row.found_at,
          match_reason: row.match_reason || '',
          provenance: 'database',
          kpis: {
            shipments_12m: c.shipments_12m ?? null,
            teu_12m: c.teu_12m ?? null,
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

/** Accept inbox items: move them from inbox → list_companies in bulk. */
export async function acceptInboxItems(listId, companyIds) {
  if (!listId || !companyIds?.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + companies required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const addedBy = userResp?.user?.id || null;

    // Insert membership rows (upsert to no-op if already member)
    const memberRows = companyIds.map((cid) => ({
      list_id: listId,
      company_id: cid,
      added_by: addedBy,
    }));
    const { error: memberErr } = await supabase
      .from('pulse_list_companies')
      .upsert(memberRows, { onConflict: 'list_id,company_id' });
    if (memberErr) return { ok: false, code: classifyError(memberErr), message: memberErr.message };

    // Stamp the inbox rows as accepted (kept for audit, hidden by status filter)
    const { error: updErr } = await supabase
      .from('pulse_list_inbox')
      .update({
        status: 'accepted',
        resolved_at: new Date().toISOString(),
        resolved_by: addedBy,
      })
      .eq('list_id', listId)
      .in('company_id', companyIds);
    if (updErr) return { ok: false, code: classifyError(updErr), message: updErr.message };

    return { ok: true, accepted: companyIds.length };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Dismiss inbox items so they stop appearing as pending. */
export async function dismissInboxItems(listId, companyIds) {
  if (!listId || !companyIds?.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'List + companies required.' };
  }
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const resolvedBy = userResp?.user?.id || null;
    const { error } = await supabase
      .from('pulse_list_inbox')
      .update({
        status: 'dismissed',
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
      })
      .eq('list_id', listId)
      .in('company_id', companyIds);
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true, dismissed: companyIds.length };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Manually trigger the auto-refresh worker for the calling user's
 *  enabled lists (or one specific list). Returns the worker's
 *  per-list summary. */
export async function triggerAutoRefresh({ listId } = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('pulse-refresh-lists', {
      body: { user_only: true, ...(listId ? { list_id: listId } : {}) },
    });
    if (error) {
      let parsed = null;
      try {
        const cloned = error?.context?.clone?.();
        parsed = await cloned?.json?.();
      } catch { parsed = null; }
      return {
        ok: false,
        code: parsed?.code || 'NETWORK',
        message: parsed?.message || error.message || 'Auto-refresh failed.',
      };
    }
    if (!data?.ok) {
      return { ok: false, code: data?.code || 'WORKER_ERROR', message: data?.message };
    }
    return {
      ok: true,
      total_added: data.total_added || 0,
      lists_run: data.lists_run || 0,
      results: data.results || [],
    };
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: err?.message };
  }
}

/* ─── Digest preferences ─── */

/** Read this user's digest pref row (or a default if none exists). */
export async function getDigestPrefs() {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp?.user) {
      return { ok: false, code: 'UNAUTHORIZED', prefs: null };
    }
    const { data, error } = await supabase
      .from('pulse_digest_prefs')
      .select('*')
      .eq('user_id', userResp.user.id)
      .maybeSingle();
    if (error) {
      return { ok: false, code: classifyError(error), message: error.message, prefs: null };
    }
    // No row yet — return a sane default so the UI can render the "Off" state
    if (!data) {
      return {
        ok: true,
        prefs: {
          user_id: userResp.user.id,
          enabled: false,
          cadence: 'daily',
          last_digest_at: null,
          last_status: null,
          last_lists_count: 0,
          last_matches_count: 0,
        },
      };
    }
    return { ok: true, prefs: data };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message, prefs: null };
  }
}

/** Toggle digest on/off and pick cadence ('daily' | 'weekly'). */
export async function setDigestPrefs({ enabled, cadence }) {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp?.user) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Sign in required.' };
    }
    const patch = {
      user_id: userResp.user.id,
      ...(enabled != null ? { enabled: Boolean(enabled) } : {}),
      ...(cadence ? { cadence } : {}),
    };
    const { error } = await supabase
      .from('pulse_digest_prefs')
      .upsert(patch, { onConflict: 'user_id' });
    if (error) return { ok: false, code: classifyError(error), message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, code: classifyError(err), message: err?.message };
  }
}

/** Manually trigger a digest send for the calling user (force=true so
 *  it doesn't wait for the cadence window). Useful for "Send test"
 *  buttons in the UI. */
export async function sendDigestNow() {
  try {
    const { data, error } = await supabase.functions.invoke('pulse-list-digest-email', {
      body: { force: true },
    });
    if (error) {
      let parsed = null;
      try {
        const cloned = error?.context?.clone?.();
        parsed = await cloned?.json?.();
      } catch { parsed = null; }
      return {
        ok: false,
        code: parsed?.code || 'NETWORK',
        message: parsed?.message || error.message || 'Digest send failed.',
      };
    }
    if (!data?.ok) {
      return { ok: false, code: data?.code || 'WORKER_ERROR', message: data?.message };
    }
    const result = data.results?.[0] || null;
    return {
      ok: true,
      sent: data.sent || 0,
      skipped: data.skipped || 0,
      status: result?.status || (data.sent > 0 ? 'sent' : 'no_matches'),
    };
  } catch (err) {
    return { ok: false, code: 'NETWORK', message: err?.message };
  }
}

/* ─── Refresh / inbox state (localStorage) ─── */

const REFRESH_KEY_PREFIX = 'lit.pulse.list_refresh.v1.';

/** Last-refresh timestamp this client has seen for the given list. */
export function getLastRefreshAt(listId) {
  try {
    const raw = window.localStorage.getItem(REFRESH_KEY_PREFIX + listId);
    if (!raw) return null;
    const t = Number(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/** Stamp the current time as the last-refresh moment for this list. */
export function markRefreshedNow(listId) {
  try {
    window.localStorage.setItem(REFRESH_KEY_PREFIX + listId, String(Date.now()));
  } catch {
    // ignore
  }
}
