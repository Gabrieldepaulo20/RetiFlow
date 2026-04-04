import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { getFinalizedNotesForClosing } from '@/services/domain/monthlyClosing';
import { ClosingPeriodFilters } from '@/services/domain/monthlyClosing';

export function useCustomersQuery() {
  const { customers, dataVersion } = useData();

  return useQuery({
    queryKey: ['operational', 'customers', dataVersion],
    queryFn: async () => customers,
    initialData: customers,
  });
}

export function useNotesQuery() {
  const { notes, dataVersion } = useData();

  return useQuery({
    queryKey: ['operational', 'notes', dataVersion],
    queryFn: async () => notes,
    initialData: notes,
  });
}

export function useMonthlyClosingSourceQuery(filters: ClosingPeriodFilters) {
  const { customers, notes, services, dataVersion } = useData();

  return useQuery({
    queryKey: ['operational', 'monthly-closing', dataVersion, filters],
    queryFn: async () => ({
      customers,
      notes: getFinalizedNotesForClosing(
        {
          customers,
          notes,
          services,
        },
        filters,
      ),
      services,
    }),
    initialData: {
      customers,
      notes: getFinalizedNotesForClosing(
        {
          customers,
          notes,
          services,
        },
        filters,
      ),
      services,
    },
  });
}
