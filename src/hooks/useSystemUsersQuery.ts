import { useQuery } from '@tanstack/react-query';
import { listSystemUsers } from '@/services/auth/systemUsers';

export function useSystemUsersQuery() {
  return useQuery({
    queryKey: ['auth', 'system-users'],
    queryFn: listSystemUsers,
  });
}
