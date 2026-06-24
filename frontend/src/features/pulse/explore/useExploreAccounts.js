import { useQuery } from '@tanstack/react-query';
import { fetchExploreAccounts } from '@/api/pulse-explore';

// Pulse Explorer is LAZY by default — the page renders an empty-state CTA
// until the user submits a search OR picks a filter. This avoids the
// 78K-row default-load cost that made first paint feel sluggish.
export function useExploreAccounts(filters, viewport, { enabled = true, limit = null } = {}) {
  return useQuery({
    queryKey: ['pulse-explore', filters, viewport, limit],
    queryFn: () => fetchExploreAccounts({ filters, viewport, limit }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
