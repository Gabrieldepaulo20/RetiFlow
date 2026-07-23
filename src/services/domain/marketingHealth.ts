import type { MarketingResumo } from '@/api/supabase/marketing';

export type MarketingHealthStatus = 'critical' | 'attention' | 'healthy' | 'insufficient';
export type MarketingSignalSeverity = 'critical' | 'warning' | 'positive' | 'info';

export interface MarketingHealthSignal {
  id: string;
  severity: MarketingSignalSeverity;
  title: string;
  description: string;
}

export interface MarketingHealth {
  status: MarketingHealthStatus;
  label: string;
  summary: string;
  signals: MarketingHealthSignal[];
}

function relativeDrop(current: number, previous: number) {
  return previous > 0 ? (previous - current) / previous : 0;
}

function relativeGrowth(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : 0;
}

function signal(
  id: string,
  severity: MarketingSignalSeverity,
  title: string,
  description: string,
): MarketingHealthSignal {
  return { id, severity, title, description };
}

export function evaluateMarketingHealth(resumo: MarketingResumo): MarketingHealth {
  const signals: MarketingHealthSignal[] = [];
  const current = resumo.site.current;
  const previous = resumo.site.previous;
  const search = resumo.searchConsole;

  resumo.integrations
    .filter((integration) => integration.status === 'needs_attention')
    .forEach((integration) => {
      signals.push(signal(
        `integration-${integration.provider}`,
        integration.provider === 'internal' ? 'critical' : 'warning',
        `Fonte ${integration.provider} requer atenção`,
        integration.lastError ?? 'A sincronização não concluiu como esperado.',
      ));
    });

  if ((resumo.quality?.alertFailures ?? 0) > 0) {
    signals.push(signal(
      'alert-failures',
      'critical',
      'Falha no encaminhamento de alertas',
      `${resumo.quality?.alertFailures} evento(s) falharam no período.`,
    ));
  }

  if ((current.formSubmitErrors ?? 0) > 0) {
    signals.push(signal(
      'form-submit-errors',
      'critical',
      'Formulário registrou falhas de envio',
      `${current.formSubmitErrors} tentativa(s) não foram concluídas. Verifique o fluxo antes de investir mais tráfego.`,
    ));
  }

  if (previous.visits >= 20 && relativeDrop(current.visits, previous.visits) >= 0.25) {
    signals.push(signal(
      'visits-drop',
      'warning',
      'Pessoas no site caíram',
      'Queda de pelo menos 25% contra o período anterior, com base mínima suficiente.',
    ));
  }

  if (previous.whatsappClicks >= 5 && relativeDrop(current.whatsappClicks, previous.whatsappClicks) >= 0.30) {
    signals.push(signal(
      'whatsapp-drop',
      'warning',
      'Cliques no WhatsApp caíram',
      'Queda de pelo menos 30% contra o período anterior.',
    ));
  }

  if (previous.formSubmits >= 5 && relativeDrop(current.formSubmits, previous.formSubmits) >= 0.30) {
    signals.push(signal(
      'forms-drop',
      'warning',
      'Formulários enviados caíram',
      'Queda de pelo menos 30% contra o período anterior.',
    ));
  }

  const currentConversion = current.conversionRate
    ?? (current.visits ? (current.leads / current.visits) * 100 : 0);
  const previousConversion = previous.visits
    ? (previous.leads / previous.visits) * 100
    : 0;
  if (
    previous.visits >= 20
    && previousConversion > 0
    && relativeDrop(currentConversion, previousConversion) >= 0.25
  ) {
    signals.push(signal(
      'conversion-drop',
      'warning',
      'Conversão em contato perdeu força',
      'A taxa caiu pelo menos 25% em relação ao período anterior.',
    ));
  }

  if (
    (previous.sessions ?? 0) >= 20
    && (previous.engagementRate ?? 0) - (current.engagementRate ?? 0) >= 10
  ) {
    signals.push(signal(
      'engagement-drop',
      'warning',
      'Engajamento recuou',
      'A taxa caiu pelo menos 10 pontos percentuais.',
    ));
  }

  if (search && search.previous.impressions >= 100) {
    if (relativeDrop(search.current.impressions, search.previous.impressions) >= 0.25) {
      signals.push(signal(
        'search-impressions-drop',
        'warning',
        'Visibilidade orgânica caiu',
        'As impressões no Google recuaram pelo menos 25%.',
      ));
    }
    if (search.previous.ctr > 0 && relativeDrop(search.current.ctr, search.previous.ctr) >= 0.20) {
      signals.push(signal(
        'search-ctr-drop',
        'warning',
        'CTR orgânico caiu',
        'A proporção de cliques recuou pelo menos 20%.',
      ));
    }
    if (search.current.position - search.previous.position >= 2) {
      signals.push(signal(
        'search-position-drop',
        'warning',
        'Posição média piorou',
        'A posição média perdeu dois ou mais lugares. Valores maiores são piores.',
      ));
    }
  }

  if (previous.leads >= 4 && relativeGrowth(current.leads, previous.leads) >= 0.25) {
    signals.push(signal(
      'leads-growth',
      'positive',
      'Contatos cresceram',
      'Alta de pelo menos 25% contra o período anterior.',
    ));
  }

  const hasTrackedContact = current.leads > 0
    || current.whatsappClicks > 0
    || (current.phoneClicks ?? 0) > 0
    || current.formSubmits > 0;
  if (current.visits >= 50 && !hasTrackedContact) {
    signals.push(signal(
      'traffic-without-contact',
      'warning',
      'Tráfego sem contato rastreado',
      'Há pelo menos 50 pessoas no período, mas nenhum contato rastreado. Valide o rastreamento e a oferta antes de concluir que não houve demanda.',
    ));
  }

  const criticalCount = signals.filter((item) => item.severity === 'critical').length;
  const warningCount = signals.filter((item) => item.severity === 'warning').length;
  const hasMinimumSample = current.visits >= 10
    || (search?.current.impressions ?? 0) >= 100
    || (current.totalEvents ?? 0) >= 20;

  if (criticalCount > 0) {
    return {
      status: 'critical',
      label: 'Ação imediata',
      summary: `${criticalCount} falha(s) crítica(s) podem comprometer a aquisição ou a leitura dos dados.`,
      signals,
    };
  }

  if (warningCount > 0) {
    return {
      status: 'attention',
      label: 'Atenção',
      summary: `${warningCount} variação(ões) relevante(s) merecem investigação, sem atribuir causa automaticamente.`,
      signals,
    };
  }

  if (!hasMinimumSample) {
    return {
      status: 'insufficient',
      label: 'Dados insuficientes',
      summary: 'Ainda não há volume mínimo para classificar tendência com segurança.',
      signals: [
        ...signals,
        signal(
          'minimum-sample',
          'info',
          'Amostra ainda pequena',
          'O painel continuará acompanhando sem disparar alertas de variação com baixo volume.',
        ),
      ],
    };
  }

  return {
    status: 'healthy',
    label: 'Sem alertas de queda',
    summary: 'Nenhuma queda relevante ultrapassou os limites conservadores deste período. Isso não comprova retorno nem causalidade.',
    signals: signals.length
      ? signals
      : [signal('stable', 'info', 'Sem queda detectada', 'Os indicadores não cruzaram os limites de alerta neste período.')],
  };
}
