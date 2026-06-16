import { useQuery } from '@tanstack/react-query';
import { fetchExploreAccounts } from '@/api/pulse-explore';

export function useExploreAccounts(filters, viewport) {
  return useQuery({
    queryKey: ['pulse-explore', filters, viewport],
    queryFn: () => fetchExploreAccounts({ filters, viewport }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
