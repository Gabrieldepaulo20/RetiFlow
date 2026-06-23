import { supabase } from '@/lib/supabase';
import {
  getMarketingResumoCacheKey,
  writeCachedMarketingResumo,
} from './marketingCache';

export type MarketingProvider = 'ga4' | 'clarity' | 'meta_ads' | 'google_ads' | 'internal';
export type MarketingIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'syncing' | 'disabled';

export interface MarketingConfigSummary {
  moduloHabilitado: boolean;
  ga4Status: MarketingIntegrationStatus | 'not_connected';
  hasSiteKey: boolean;
  allowedOrigins: string[];
  updatedAt: string | null;
  ga4PropertyId?: string | null;
}

export interface MarketingIntegrationSummary {
  provider: MarketingProvider;
  status: MarketingIntegrationStatus;
  accountName?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface MarketingSiteTotals {
  visits: number;
  sessions?: number;
  pageViews?: number;
  whatsappClicks: number;
  formSubmits: number;
  totalEvents?: number;
  actionEvents?: number;
  engagementRate?: number;
  leads: number;
  conversionRate?: number;
}

export interface MarketingPageMetric {
  path: string;
  title?: string | null;
  views: number;
  conversions: number;
}

export interface MarketingSourceMetric {
  source: string;
  medium: string;
  visits: number;
  leads: number;
}

export interface MarketingDailyMetric {
  date: string;
  visits: number;
  pageViews?: number;
  actions: number;
  leads: number;
}

export interface MarketingResumo {
  periodDays: number;
  context?: {
    targetUserId?: string;
    targetName?: string;
    targetEmail?: string;
  };
  config: MarketingConfigSummary;
  integrations: MarketingIntegrationSummary[];
  site: {
    current: MarketingSiteTotals;
    previous: Omit<MarketingSiteTotals, 'conversionRate'>;
    pages: MarketingPageMetric[];
    sources: MarketingSourceMetric[];
    daily: MarketingDailyMetric[];
  };
  campaigns: {
    current: {
      spend: number;
      impressions?: number;
      clicks: number;
      leads: number;
      cpl: number;
    };
    items: unknown[];
    daily: unknown[];
    financialAvailable: boolean;
  };
}

const inFlightResumoRequests = new Map<string, Promise<MarketingResumo>>();

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sessão Supabase não encontrada. Faça login novamente.');
  }
  return data.session.access_token;
}

function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getErrorResponse(error: unknown) {
  return typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : null;
}

async function getMarketingFunctionErrorMessage(error: unknown, fallback: string) {
  const context = getErrorResponse(error);
  if (context instanceof Response) {
    try {
      const parsed = await context.clone().json() as { error?: string; mensagem?: string };
      return parsed.error ?? parsed.mensagem ?? fallback;
    } catch {
      return fallback;
    }
  }

  return getFunctionErrorMessage(error, fallback);
}

async function fetchMarketingResumo(periodDays = 30, targetUserId?: string | null) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{ dados?: MarketingResumo; error?: string; mensagem?: string }>('marketing-dashboard', {
    body: {
      p_periodo_dias: periodDays,
      ...(targetUserId ? { p_target_user_id: targetUserId } : {}),
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.dados) {
    throw new Error(data?.error ?? data?.mensagem ?? await getMarketingFunctionErrorMessage(error, 'Não foi possível carregar o módulo Crescimento.'));
  }

  writeCachedMarketingResumo(periodDays, targetUserId, data.dados);
  return data.dados;
}

export async function getMarketingResumo(periodDays = 30, targetUserId?: string | null) {
  const cacheKey = getMarketingResumoCacheKey(periodDays, targetUserId);
  const existingRequest = inFlightResumoRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchMarketingResumo(periodDays, targetUserId)
    .finally(() => {
      inFlightResumoRequests.delete(cacheKey);
    });

  inFlightResumoRequests.set(cacheKey, request);
  return request;
}
