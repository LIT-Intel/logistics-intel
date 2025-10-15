import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSavedCompanies() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['crmSavedCompanies'],
    queryFn: () => api.get('/crm/savedCompanies?stage=prospect'),
    staleTime: 60_000,
  });

  const setSaved = useMutation({
    mutationFn: async ({ company_id, save }) => {
      if (save) {
        return api.post('/crm/saveCompany', { company_id, stage: 'prospect' });
      }
      // some gateways use DELETE, others POST to a delete route
      try {
        return await api.post('/crm/deleteCompany', { company_id });
      } catch {
        return api.post('/crm/saveCompany', { company_id, delete: true });
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

