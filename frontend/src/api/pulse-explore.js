import { supabase } from '@/lib/supabase';

export async function fetchExploreAccounts({ filters = {}, viewport = null } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters, viewport }),
  });
  if (!r.ok) throw new Error(`pulse-explore ${r.status}`);
  return await r.json();
}
