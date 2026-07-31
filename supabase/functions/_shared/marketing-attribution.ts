export type MarketingAttributionBucket = 'paid' | 'organic' | 'other';

type MarketingAttributionInput = {
  source?: unknown;
  medium?: unknown;
  referrer?: unknown;
  gclid?: unknown;
  gbraid?: unknown;
  wbraid?: unknown;
};

function hasValue(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function getHost(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0];
  }
}

function isKnownOrganicSearchHost(host: string) {
  return host === 'google.com'
    || host.startsWith('google.')
    || host === 'bing.com'
    || host.endsWith('.bing.com')
    || host === 'search.yahoo.com'
    || host === 'duckduckgo.com'
    || host.endsWith('.duckduckgo.com')
    || host === 'ecosia.org'
    || host.endsWith('.ecosia.org')
    || host === 'search.brave.com';
}

export function classifyMarketingAttribution(
  item: MarketingAttributionInput,
): MarketingAttributionBucket {
  const source = String(item.source ?? '').trim().toLowerCase();
  const medium = String(item.medium ?? '').trim().toLowerCase();
  const referrerHost = getHost(item.referrer);
  const hasGoogleClickId = hasValue(item.gclid) || hasValue(item.gbraid) || hasValue(item.wbraid);
  const hasPaidMedium = ['cpc', 'ppc', 'paid', 'paid_search', 'display'].includes(medium);

  if (hasGoogleClickId || (source === 'google' && hasPaidMedium)) {
    return 'paid';
  }

  if (hasPaidMedium) return 'other';

  if (medium === 'organic' || isKnownOrganicSearchHost(referrerHost)) return 'organic';

  return 'other';
}
