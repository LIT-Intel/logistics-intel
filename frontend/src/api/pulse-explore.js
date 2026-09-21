import { supabase } from '@/lib/supabase';

// Custom error class so callers (PulseExploreTab) can distinguish a
// LIMIT_EXCEEDED 403 from any other failure and surface the upgrade
// modal with the structured payload that check_usage_limit returned.
export class PulseExploreLimitError extends Error {
  constructor(limit) {
    super(limit?.message || 'Plan limit reached');
    this.name = 'PulseExploreLimitError';
    this.limit = limit;
  }
}

// Trial search wall for EXPLICIT market searches. Consumes one unified trial
// search server-side and throws PulseExploreLimitError (→ upgrade modal) once
// the budget is spent. Call ONLY on an explicit Search action, never on
// browsing/filter refetches — the results fetch itself stays ungated/free.
// Fails OPEN on any non-403 error so gate-infra hiccups never block a search.
export async function gateMarketSearch() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: true };
  let r;
  try {
    r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate_only: true }),
    });
  } catch {
    return { ok: true };
  }
  if (r.status === 403) {
    let payload = null;
    try { payload = await r.json(); } catch { /* ignore */ }
    if (payload && payload.code === 'LIMIT_EXCEEDED') throw new PulseExploreLimitError(payload);
    return { ok: true };
  }
  if (!r.ok) return { ok: true };
  return await r.json();
}

export async function fetchExploreAccounts({ filters = {}, viewport = null, limit = null } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters, viewport, limit }),
  });
  if (r.status === 403) {
    // check_usage_limit returns { ok:false, code:'LIMIT_EXCEEDED', ... }.
    // Pipe it through so the UI can render the canonical upgrade modal.
    let payload = null;
    try { payload = await r.json(); } catch { /* ignore */ }
    if (payload && payload.code === 'LIMIT_EXCEEDED') {
      throw new PulseExploreLimitError(payload);
    }
    throw new Error(`pulse-explore 403`);
  }
  if (!r.ok) throw new Error(`pulse-explore ${r.status}`);
  return await r.json();
}
