import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/lit';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useSavedCompanies() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['crmSavedCompanies'],
    queryFn: () => apiGet('/crm/savedCompanies?stage=prospect'),
    staleTime: 60_000,
  });

  const setSaved = useMutation({
    mutationFn: async ({ company_id, save }) => {
      if (save) {
        return apiPost('/crm/saveCompany', { company_id, stage: 'prospect' });
      }
      // some gateways use DELETE, others POST to a delete route
      try {
        return await apiPost('/crm/deleteCompany', { company_id });
      } catch {
        return apiPost('/crm/saveCompany', { company_id, delete: true });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crmSavedCompanies'] });
      qc.invalidateQueries({ queryKey: ['search'] });
    }
  });

  const isSaved = (id) => !!list.data?.rows?.some(r => r.company_id === id);

  return { list, isSaved, setSaved };
}

