// Per-row ImportYeti refresh — invokes the importyeti-proxy pulse_refresh
// action. 24h cache + per-user daily quota are enforced server-side.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

async function refresh(companyId, { force = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/importyeti-proxy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'pulse_refresh', company_id: companyId, force }),
  });
  const body = await r.json();
  if (!r.ok || !body.ok) {
    if (body.error === 'quota_exceeded') {
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
