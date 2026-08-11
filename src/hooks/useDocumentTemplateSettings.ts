import { useCallback } from 'react';
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
import {
  assertDocumentCustomizationForUser,
  isDocumentCustomizationForUser,
  type DocumentType,
  type ResolvedDocumentCustomization,
} from '@/services/domain/documentCustomization';
import { useAuth } from '@/contexts/AuthContext';
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
  const { operationalUser, supportSession } = useAuth();
  const supportScope = captureActiveSupportScope();
  const resolvedScope = resolveDocumentSettingsQueryScope(
    idUsuarios ?? operationalUser?.id,
    queryScope ?? supportSession?.id,
    supportScope,
  );
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

  const rawData = query.data ?? fallbackSettings;
  const hasExpectedScope = Boolean(
    resolvedScope.idUsuarios
    && rawData.fkUsuarios === resolvedScope.idUsuarios,
  );
  const data = hasExpectedScope ? rawData : fallbackSettings;
  const isScopeMismatch = Boolean(
    IS_REAL_AUTH
    && query.isFetched
    && !query.isPlaceholderData
    && !query.isError
    && !hasExpectedScope,
  );
  const isReady = !IS_REAL_AUTH || (
    !query.isPlaceholderData
    && !query.isError
    && hasExpectedScope
  );
  const requireData = useCallback(async () => {
    assertActiveSupportScopeUnchanged(supportScope);
    if (!IS_REAL_AUTH || isReady) {
      assertActiveSupportScopeUnchanged(supportScope);
      return data;
    }

    const result = await query.refetch();
    assertActiveSupportScopeUnchanged(supportScope);
    const candidate = result.data;
    if (!resolvedScope.idUsuarios || !candidate || candidate.fkUsuarios !== resolvedScope.idUsuarios) {
      if (result.error instanceof Error) throw result.error;
      throw new Error('As configurações de impressão ainda não foram validadas para esta empresa. Tente novamente.');
    }
    return candidate;
  }, [data, isReady, query, resolvedScope.idUsuarios, supportScope]);

  // Uma falha transitória não pode derrubar os consumidores legados que
  // sempre receberam um objeto. `isError` continua verdadeiro e, em suporte,
  // mantém a criação bloqueada mesmo com este fallback visual.
  return {
    ...query,
    data,
    expectedUserId: resolvedScope.idUsuarios,
    hasExpectedScope,
    isScopeMismatch,
    isReady,
    requireData,
  };
}

export function useDocumentCustomization(
  documentType: DocumentType,
  idUsuarios?: string | null,
  enabled = true,
  queryScope?: string | null,
) {
  const { operationalUser, supportSession } = useAuth();
  const supportScope = captureActiveSupportScope();
  const resolvedScope = resolveDocumentSettingsQueryScope(
    idUsuarios ?? operationalUser?.id,
    queryScope ?? supportSession?.id,
    supportScope,
  );
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

  const rawData = query.data ?? fallbackSettings;
  const hasExpectedScope = isDocumentCustomizationForUser(rawData, resolvedScope.idUsuarios, documentType);
  const data = hasExpectedScope ? rawData : fallbackSettings;
  const isScopeMismatch = Boolean(
    IS_REAL_AUTH
    && query.isFetched
    && !query.isPlaceholderData
    && !query.isError
    && !hasExpectedScope,
  );
  const isReady = !IS_REAL_AUTH || (
    !query.isPlaceholderData
    && !query.isError
    && hasExpectedScope
  );
  const requireData = useCallback(async () => {
    assertActiveSupportScopeUnchanged(supportScope);
    if (!IS_REAL_AUTH || isReady) {
      assertActiveSupportScopeUnchanged(supportScope);
      return data;
    }

    const result = await query.refetch();
    assertActiveSupportScopeUnchanged(supportScope);
    if (result.error instanceof Error) throw result.error;
    assertDocumentCustomizationForUser(result.data, resolvedScope.idUsuarios, documentType);
    return result.data;
  }, [data, documentType, isReady, query, resolvedScope.idUsuarios, supportScope]);

  return {
    ...query,
    data,
    expectedUserId: resolvedScope.idUsuarios,
    hasExpectedScope,
    isScopeMismatch,
    isReady,
    requireData,
  };
}
