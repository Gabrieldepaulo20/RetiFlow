import {
  DEFAULT_MARKETING_RESUMO_PERIOD_DAYS,
  getMarketingResumo,
  getMarketingResumoQueryKey,
} from '@/api/supabase/marketing';
import { getMarketingResumoCacheKey } from '@/api/supabase/marketingCache';

const { getSession, invoke } = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

function buildResumo(periodDays = 30, targetUserId = 'cliente-1') {
  return {
    periodDays,
    context: {
      accessLevel: 'basic' as const,
      privateToMegaMaster: false,
      targetUserId,
    },
    config: {
      moduloHabilitado: true,
      ga4Status: 'connected',
      hasSiteKey: true,
      allowedOrigins: [],
      updatedAt: '2026-06-23T12:00:00.000Z',
      ga4PropertyId: '123',
    },
    integrations: [],
    site: {
      current: {
        visits: 10,
        pageViews: 20,
        whatsappClicks: 2,
        formSubmits: 1,
        actionEvents: 3,
        leads: 1,
      },
      previous: {
        visits: 4,
        pageViews: 8,
        whatsappClicks: 1,
        formSubmits: 0,
        actionEvents: 1,
        leads: 0,
      },
      pages: [],
      sources: [],
      daily: [],
    },
    campaigns: {
      current: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        cpl: 0,
      },
      items: [],
      daily: [],
      financialAvailable: false,
    },
  };
}

describe('marketing growth API', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    getSession.mockReset();
    invoke.mockReset();
    getSession.mockResolvedValue({
      data: { session: { access_token: 'token-teste' } },
      error: null,
    });
  });

  it('deduplicates simultaneous summary requests for the same target and period', async () => {
    let resolveInvoke!: (value: unknown) => void;
    invoke.mockReturnValue(new Promise((resolve) => {
      resolveInvoke = resolve;
    }));

    const first = getMarketingResumo(30, 'cliente-1', 'usuario-a');
    const second = getMarketingResumo(30, 'cliente-1', 'usuario-a');

    resolveInvoke({ data: { dados: buildResumo(30) }, error: null });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('marketing-dashboard', expect.objectContaining({
      body: expect.objectContaining({
        p_periodo_dias: 30,
        p_target_user_id: 'cliente-1',
      }),
      headers: { Authorization: 'Bearer token-teste' },
    }));
  });

  it('stores a successful summary in the session cache', async () => {
    invoke.mockResolvedValue({ data: { dados: buildResumo(7, 'usuario-a') }, error: null });

    await getMarketingResumo(7, null, 'usuario-a');

    const raw = window.sessionStorage.getItem(getMarketingResumoCacheKey(7, null, 'usuario-a'));
    expect(raw).toContain('"periodDays":7');
    expect(raw).toContain('"visits":10');
  });

  it('builds the same React Query key used by warmup and page reads', () => {
    expect(getMarketingResumoQueryKey(30, ' cliente-1 ', 'usuario-a')).toEqual([
      'marketing-growth',
      'usuario-a',
      30,
      'cliente-1',
    ]);
    expect(getMarketingResumoQueryKey(Number.NaN, '', 'usuario-a')).toEqual([
      'marketing-growth',
      'usuario-a',
      DEFAULT_MARKETING_RESUMO_PERIOD_DAYS,
      'self',
    ]);
  });
});
