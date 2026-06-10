import { useQuery } from '@tanstack/react-query';
import {
  buildDocumentFallback,
  resolverConfiguracaoDocumento,
} from '@/api/supabase/documentos';
import {
  DEFAULT_USER_TEMPLATE_SETTINGS,
  getConfiguracaoModeloUsuario,
  type UserTemplateSettings,
} from '@/api/supabase/modelos';
import type { DocumentType, ResolvedDocumentCustomization } from '@/services/domain/documentCustomization';

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

export function useDocumentCustomization(
  documentType: DocumentType,
  idUsuarios?: string | null,
  enabled = true,
) {
  const fallbackSettings: ResolvedDocumentCustomization = buildDocumentFallback(documentType, idUsuarios ?? null);

  return useQuery({
    queryKey: ['settings', 'document-customization', documentType, idUsuarios ?? 'current'],
    queryFn: () => resolverConfiguracaoDocumento({ idUsuarios: idUsuarios ?? null, documentType }),
    enabled: enabled && IS_REAL_AUTH,
    initialData: fallbackSettings,
    staleTime: 60_000,
  });
}
