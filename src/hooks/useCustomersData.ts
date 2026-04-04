import { useData } from '@/contexts/DataContext';

/**
 * Provides only the customers-related slice of the data layer.
 * Prefer this over useData() in components that only interact with customers,
 * so their dependencies are explicit and swappable for an API later.
 */
export function useCustomersData() {
  const { customers, clients, addClient, updateClient, getClient } = useData();
  return { customers, clients, addClient, updateClient, getClient };
}
