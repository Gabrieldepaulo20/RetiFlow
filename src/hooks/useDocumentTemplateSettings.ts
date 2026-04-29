import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_USER_TEMPLATE_SETTINGS,
  getConfiguracaoModeloUsuario,
  type UserTemplateSettings,
} from '@/api/supabase/modelos';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export function useDocumentTemplateSettings(idUsuarios?: string | null, enabled = true) {
  const fallbackSettings: UserTemplateSettings = {
    fkUsuarios: idUsuarios ?? 'current',
    ...DEFAULT_USER_TEMPLATE_SETTINGS,
    updatedAt: null,
  };

  return useQuery({
    queryKey: ['settings', 'templates', idUsuarios ?? 'current'],
    queryFn: () => getConfiguracaoModeloUsuario(idUsuarios ?? null),
    enabled: enabled && IS_REAL_AUTH,
    initialData: fallbackSettings,
    staleTime: 60_000,
  });
}
