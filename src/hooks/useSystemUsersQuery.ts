import { useQuery } from '@tanstack/react-query';
import { listSystemUsers } from '@/services/auth/systemUsers';

export function useSystemUsersQuery(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['auth', 'system-users'],
    queryFn: listSystemUsers,
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}
