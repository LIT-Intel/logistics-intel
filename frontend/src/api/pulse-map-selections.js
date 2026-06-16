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

export async function saveMapSelection(payload) {
  const r = await authed('pulse-map-selection-save', { method: 'POST', body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`save selection ${r.status}`);
  return await r.json();
}

export async function listMapSelections() {
  const r = await authed('pulse-map-selections-list', { method: 'GET' });
  if (!r.ok) throw new Error(`list selections ${r.status}`);
  return await r.json();
}
