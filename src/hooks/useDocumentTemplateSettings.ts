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
import {
  assertActiveSupportScopeUnchanged,
  captureActiveSupportScope,
  readActiveSupportContext,
  type StoredSupportContext,
} from '@/services/auth/supportContext';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

export function resolveDocumentSettingsQueryScope(
  idUsuarios?: string | null,
  queryScope?: string | null,
  supportContext: StoredSupportContext | null = readActiveSupportContext(),
) {
  return {
    idUsuarios: idUsuarios ?? supportContext?.targetUserId ?? null,
    queryScope: queryScope ?? supportContext?.sessionId ?? null,
  };
}

export function useDocumentTemplateSettings(
  idUsuarios?: string | null,
  enabled = true,
  queryScope?: string | null,
) {
  const supportScope = captureActiveSupportScope();
  const resolvedScope = resolveDocumentSettingsQueryScope(idUsuarios, queryScope, supportScope);
  const fallbackSettings: UserTemplateSettings = {
    fkUsuarios: resolvedScope.idUsuarios ?? 'current',
    ...DEFAULT_USER_TEMPLATE_SETTINGS,
    updatedAt: null,
  };

  const query = useQuery({
    queryKey: [
      'settings',
      'templates',
      resolvedScope.idUsuarios ?? 'current',
      ...(resolvedScope.queryScope ? [resolvedScope.queryScope] : []),
    ],
    queryFn: async () => {
      assertActiveSupportScopeUnchanged(supportScope);
      const settings = await getConfiguracaoModeloUsuario(resolvedScope.idUsuarios);
      assertActiveSupportScopeUnchanged(supportScope);
      return settings;
    },
    enabled: enabled && IS_REAL_AUTH,
    // O fallback mantém a tela renderizável, mas não entra no cache como se
    // tivesse vindo do servidor. Em suporte, a criação só é liberada depois
    // que `isPlaceholderData` fica falso.
    placeholderData: fallbackSettings,
    staleTime: 60_000,
  });

  // Uma falha transitória não pode derrubar os consumidores legados que
  // sempre receberam um objeto. `isError` continua verdadeiro e, em suporte,
  // mantém a criação bloqueada mesmo com este fallback visual.
  return { ...query, data: query.data ?? fallbackSettings };
}

export function useDocumentCustomization(
  documentType: DocumentType,
  idUsuarios?: string | null,
  enabled = true,
  queryScope?: string | null,
) {
  const supportScope = captureActiveSupportScope();
  const resolvedScope = resolveDocumentSettingsQueryScope(idUsuarios, queryScope, supportScope);
  const fallbackSettings: ResolvedDocumentCustomization = buildDocumentFallback(
    documentType,
    resolvedScope.idUsuarios,
  );

  const query = useQuery({
    queryKey: [
      'settings',
      'document-customization',
      documentType,
      resolvedScope.idUsuarios ?? 'current',
      ...(resolvedScope.queryScope ? [resolvedScope.queryScope] : []),
    ],
    queryFn: async () => {
      assertActiveSupportScopeUnchanged(supportScope);
      const settings = await resolverConfiguracaoDocumento({
        idUsuarios: resolvedScope.idUsuarios,
        documentType,
      });
      assertActiveSupportScopeUnchanged(supportScope);
      return settings;
    },
    enabled: enabled && IS_REAL_AUTH,
    placeholderData: fallbackSettings,
    staleTime: 60_000,
  });

  return { ...query, data: query.data ?? fallbackSettings };
}
