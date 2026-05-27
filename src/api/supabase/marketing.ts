import { supabase } from '@/lib/supabase';

export type MarketingProvider = 'ga4' | 'clarity' | 'meta_ads' | 'google_ads' | 'internal';
export type MarketingIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'syncing' | 'disabled';

export interface MarketingConfigSummary {
  moduloHabilitado: boolean;
  ga4Status: MarketingIntegrationStatus | 'not_connected';
  hasSiteKey: boolean;
  allowedOrigins: string[];
  updatedAt: string | null;
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
  whatsappClicks: number;
  formSubmits: number;
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
  actions: number;
  leads: number;
}

export interface MarketingResumo {
  periodDays: number;
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
      clicks: number;
      leads: number;
      cpl: number;
    };
    items: unknown[];
    daily: unknown[];
    financialAvailable: boolean;
  };
}

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

export async function getMarketingResumo(periodDays = 30) {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke<{ dados?: MarketingResumo; error?: string; mensagem?: string }>('marketing-dashboard', {
    body: { p_periodo_dias: periodDays },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error || !data?.dados) {
    throw new Error(data?.error ?? data?.mensagem ?? getFunctionErrorMessage(error, 'Não foi possível carregar o módulo Crescimento.'));
  }

  return data.dados;
}
