import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { saveCompanyOrThrow } from '@/lib/saveCompany';
import { supabase } from '@/auth/supabaseAuthClient';

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
        // Canonical gated path. saveCompanyOrThrow throws LimitExceededError
        // on quota; let the caller's onError handle it.
        return saveCompanyOrThrow({
          source_company_key: company_id,
          company_data: { source: 'lit', source_company_key: company_id, name: company_id },
          stage: 'prospect',
        });
      }
      // Delete: direct supabase call into lit_saved_companies (canonical
      // table; no quota implications on delete).
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Resolve lit_companies.id from the source_company_key the UI passed.
      const { data: companyRow } = await supabase
        .from('lit_companies')
        .select('id')
        .eq('source_company_key', company_id)
        .maybeSingle();
      if (!companyRow?.id) return { ok: true };

      const { error } = await supabase
        .from('lit_saved_companies')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyRow.id);
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crmSavedCompanies'] });
      qc.invalidateQueries({ queryKey: ['search'] });
    }
  });

  const isSaved = (id) => !!list.data?.rows?.some(r => r.company_id === id);

  return { list, isSaved, setSaved };
}
