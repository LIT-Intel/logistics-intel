import { supabase } from '@/lib/supabase';

async function authed(path, init = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

// Thrown when pulse-map-selection-save returns 403 LIMIT_EXCEEDED (free-trial
// saved_map_view = 0). Carries the structured limit payload so the caller can
// render the canonical UpgradeModal instead of a generic error toast.
export class SaveMapViewLimitError extends Error {
  constructor(limit) {
    super(limit?.message || 'Saved map views are included on paid plans.');
    this.name = 'SaveMapViewLimitError';
    this.limit = limit;
  }
}

export async function saveMapSelection(payload) {
  const r = await authed('pulse-map-selection-save', { method: 'POST', body: JSON.stringify(payload) });
  if (r.status === 403) {
    let body = null;
    try { body = await r.json(); } catch { /* ignore */ }
    if (body && body.code === 'LIMIT_EXCEEDED') {
      throw new SaveMapViewLimitError(body);
    }
    throw new Error(`save selection 403`);
  }
  if (!r.ok) throw new Error(`save selection ${r.status}`);
  return await r.json();
}

export async function listMapSelections() {
  const r = await authed('pulse-map-selections-list', { method: 'GET' });
  if (!r.ok) throw new Error(`list selections ${r.status}`);
  return await r.json();
}

// Delete a saved map view. The lit_pulse_map_selections table has an
// owner-scoped RLS delete policy ("for delete to authenticated"), so a direct
// PostgREST delete is safe — a user can only remove their own rows.
export async function deleteMapSelection(id) {
  const { error } = await supabase
    .from('lit_pulse_map_selections')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message || `delete selection failed`);
  return { ok: true };
}
