import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evita refetch redundante a cada mount/troca de tela/foco de janela.
      // Telas com exigência maior de atualização sobrescrevem staleTime localmente.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
