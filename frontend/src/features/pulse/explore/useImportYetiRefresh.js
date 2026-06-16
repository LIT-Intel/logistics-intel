// Per-row ImportYeti refresh — invokes the standalone pulse-refresh edge
// fn. 24h cache TTL + per-user daily quota are enforced server-side. The
// fn delegates the actual ImportYeti upstream fetch to importyeti-proxy's
// companyProfile action, so all parsing/snapshot-persist logic is reused.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

async function refresh(companyId, { force = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-refresh`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ company_id: companyId, force }),
  });
  const body = await r.json();
  if (!r.ok || !body.ok) {
    if (body.error === 'quota_exceeded' || body.code === 'PULSE_REFRESH_QUOTA_EXCEEDED') {
      throw new Error(`Daily refresh limit reached (${body.used} of ${body.cap}).`);
    }
    throw new Error(body.error || `refresh ${r.status}`);
  }
  return body;
}

export function useImportYetiRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, force }) => refresh(companyId, { force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pulse-explore'] });
      toast.success('Refreshed from ImportYeti');
    },
    onError: (e) => toast.error(e.message),
  });
}
