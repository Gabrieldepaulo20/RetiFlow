import type {
  MarketingAdsClickTypeMetric,
  MarketingAdsLandingPageMetric,
  MarketingPaidVisitor,
} from '@/api/supabase/marketing';

export type UntrackedAdsClickKind =
  | 'site'
  | 'whatsapp_ad'
  | 'whatsapp_landing'
  | 'call_ad'
  | 'other';

export interface UntrackedAdsClickRow {
  id: string;
  kind: UntrackedAdsClickKind;
  destinationLabel: string;
  destinationUrl: string | null;
}

interface BuildUntrackedAdsClicksInput {
  totalClicks: number;
  paidVisitors: MarketingPaidVisitor[];
  landingPages: MarketingAdsLandingPageMetric[];
  clickTypes: MarketingAdsClickTypeMetric[];
}

const SITE_CLICK_TYPES = new Set(['URL_CLICKS', 'SITELINKS']);
const WHATSAPP_AD_CLICK_TYPE = 'CLICK_TO_MESSAGE_THIRD_PARTY_CLICK';
const WHATSAPP_LANDING_CLICK_TYPE = 'CLICK_TO_MESSAGE_LANDING_PAGE_CLICK';
const CALL_CLICK_TYPE = 'CALLS';

function wholeClicks(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function destinationFromUrl(rawUrl: string) {
  try {
    const normalizedUrl = rawUrl.replace(/\{ignore\}|%7Bignore%7D/gi, '');
    const parsed = new URL(normalizedUrl, 'https://www.premiumretifica.com.br');
    const path = parsed.pathname || '/';
    const isPremiumDomain = ['premiumretifica.com.br', 'www.premiumretifica.com.br']
      .includes(parsed.hostname.toLowerCase());
    return {
      path,
      label: path,
      url: isPremiumDomain ? `https://www.premiumretifica.com.br${path}` : null,
    };
  } catch {
    const path = rawUrl.startsWith('/') ? rawUrl.split(/[?#]/, 1)[0] || '/' : '/';
    return {
      path,
      label: path,
      url: `https://www.premiumretifica.com.br${path}`,
    };
  }
}

function clickCount(clickTypes: MarketingAdsClickTypeMetric[], acceptedTypes: Set<string>) {
  return clickTypes.reduce(
    (total, item) => total + (acceptedTypes.has(item.type) ? wholeClicks(item.clicks) : 0),
    0,
  );
}

function appendRows(
  rows: UntrackedAdsClickRow[],
  kind: UntrackedAdsClickKind,
  count: number,
  destinationLabel: string,
  destinationUrl: string | null = null,
) {
  for (let index = 0; index < count; index += 1) {
    rows.push({
      id: `${kind}-${rows.length + 1}`,
      kind,
      destinationLabel,
      destinationUrl,
    });
  }
}

/**
 * Expande apenas a diferença agregada que o Google Ads conhece, mas que o site
 * não conseguiu transformar em sessão. Essas linhas nunca recebem horário,
 * pessoa ou duração inventados.
 */
export function buildUntrackedAdsClickRows({
  totalClicks,
  paidVisitors,
  landingPages,
  clickTypes,
}: BuildUntrackedAdsClicksInput) {
  const rows: UntrackedAdsClickRow[] = [];
  const siteClicks = clickCount(clickTypes, SITE_CLICK_TYPES);
  const unmatchedSiteClicks = Math.max(0, siteClicks - paidVisitors.length);
  const measuredSessionsByPath = new Map<string, number>();

  paidVisitors.forEach((visitor) => {
    const path = destinationFromUrl(visitor.landingUrl ?? visitor.landingPage).path;
    measuredSessionsByPath.set(path, (measuredSessionsByPath.get(path) ?? 0) + 1);
  });

  const siteCandidates: Array<{ label: string; url: string | null }> = [];
  landingPages.forEach((landingPage) => {
    const destination = destinationFromUrl(landingPage.url);
    const measured = measuredSessionsByPath.get(destination.path) ?? 0;
    const remaining = Math.max(0, wholeClicks(landingPage.clicks) - measured);
    measuredSessionsByPath.delete(destination.path);
    for (let index = 0; index < remaining; index += 1) {
      siteCandidates.push({ label: destination.label, url: destination.url });
    }
  });

  siteCandidates.slice(0, unmatchedSiteClicks).forEach((destination) => {
    appendRows(rows, 'site', 1, destination.label, destination.url);
  });
  appendRows(
    rows,
    'site',
    Math.max(0, unmatchedSiteClicks - siteCandidates.length),
    'Página não individualizada pelo Google',
  );

  const whatsappAdClicks = clickCount(clickTypes, new Set([WHATSAPP_AD_CLICK_TYPE]));
  const whatsappLandingClicks = clickCount(clickTypes, new Set([WHATSAPP_LANDING_CLICK_TYPE]));
  const callClicks = clickCount(clickTypes, new Set([CALL_CLICK_TYPE]));
  appendRows(rows, 'whatsapp_ad', whatsappAdClicks, 'WhatsApp aberto pelo anúncio');
  appendRows(rows, 'whatsapp_landing', whatsappLandingClicks, 'Página intermediária do WhatsApp');
  appendRows(rows, 'call_ad', callClicks, 'Discador aberto pelo anúncio');

  const classifiedClicks = siteClicks + whatsappAdClicks + whatsappLandingClicks + callClicks;
  appendRows(
    rows,
    'other',
    Math.max(0, wholeClicks(totalClicks) - classifiedClicks),
    'Outro recurso do anúncio',
  );

  return rows;
}
