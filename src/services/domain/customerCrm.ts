import { BILLABLE_STATUSES } from '@/types';
import type { Client, IntakeNote } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_DAYS = 90;
const DEFAULT_PREVIOUS_DAYS = 90;

export type CustomerCrmClass = 'A' | 'B' | 'C';
export type CustomerRiskLevel = 'active' | 'watch' | 'high_risk' | 'lost' | 'no_history';
export type CustomerTrend = 'growing' | 'falling' | 'reactivated' | 'new' | 'stable' | 'no_history';
export type CustomerOpportunityType =
  | 'recover_drop'
  | 'reactivate'
  | 'protect_top_client'
  | 'grow_low_frequency'
  | 'first_service_followup'
  | 'expand_growth';

export type CustomerCrmStats = {
  client: Client;
  crmClass: CustomerCrmClass;
  risk: CustomerRiskLevel;
  trend: CustomerTrend;
  noteCount: number;
  billableNoteCount: number;
  totalRevenue: number;
  potentialRevenue: number;
  avgTicket: number;
  firstNoteAt: Date | null;
  lastNoteAt: Date | null;
  daysSinceLastNote: number | null;
  recentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number | null;
  recentNoteCount: number;
  previousNoteCount: number;
  monthlyRunRate: number;
  riskRevenue90d: number;
  revenueShare: number;
  cumulativeRevenueShare: number;
};

export type CustomerCommercialOpportunity = {
  clientId: string;
  clientName: string;
  city: string;
  type: CustomerOpportunityType;
  title: string;
  reason: string;
  recommendedAction: string;
  estimatedImpact: number;
  priorityScore: number;
};

export type CustomerCrmSummary = {
  totalClients: number;
  clientsWithHistory: number;
  totalRevenue: number;
  totalNotes: number;
  avgTicket: number;
  classCounts: Record<CustomerCrmClass, number>;
  atRiskCount: number;
  lostCount: number;
  fallingCount: number;
  growingCount: number;
  revenueAtRisk90d: number;
  growthPotential: number;
  oneServiceClients: number;
};

export type CustomerCrmResult = {
  summary: CustomerCrmSummary;
  stats: CustomerCrmStats[];
  statsByClientId: Map<string, CustomerCrmStats>;
  opportunities: CustomerCommercialOpportunity[];
};

type BuildCustomerCrmOptions = {
  clients: Client[];
  notes: IntakeNote[];
  referenceDate?: Date;
  recentDays?: number;
  previousDays?: number;
};

function toValidDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((startOfLocalDay(later).getTime() - startOfLocalDay(earlier).getTime()) / DAY_MS));
}

function isInsideWindow(date: Date | null, startExclusive: Date, endInclusive: Date): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time > startExclusive.getTime() && time <= endInclusive.getTime();
}

function getRiskLevel(noteCount: number, daysSinceLastNote: number | null): CustomerRiskLevel {
  if (noteCount === 0 || daysSinceLastNote == null) return 'no_history';
  if (daysSinceLastNote >= 90) return 'lost';
  if (daysSinceLastNote >= 60) return 'high_risk';
  if (daysSinceLastNote >= 30) return 'watch';
  return 'active';
}

function getTrend({
  noteCount,
  firstNoteAt,
  referenceDate,
  recentRevenue,
  previousRevenue,
  revenueDelta,
}: {
  noteCount: number;
  firstNoteAt: Date | null;
  referenceDate: Date;
  recentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
}): CustomerTrend {
  if (noteCount === 0) return 'no_history';
  if (firstNoteAt && daysBetween(referenceDate, firstNoteAt) <= DEFAULT_RECENT_DAYS) return 'new';
  if (previousRevenue === 0 && recentRevenue > 0) return 'reactivated';
  if (revenueDelta >= 1000 && recentRevenue >= previousRevenue * 1.25) return 'growing';
  if (previousRevenue >= 1000 && recentRevenue <= previousRevenue * 0.75) return 'falling';
  return 'stable';
}

function buildOpportunity(stat: CustomerCrmStats): CustomerCommercialOpportunity | null {
  const clientName = stat.client.tradeName || stat.client.name;
  const city = [stat.client.city, stat.client.state].filter(Boolean).join('/');
  const drop = Math.max(0, stat.previousRevenue - stat.recentRevenue);

  if (drop >= 1000) {
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'recover_drop',
      title: 'Cliente caiu no trimestre',
      reason: `Caiu R$ ${drop.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} frente aos 90 dias anteriores.`,
      recommendedAction: 'Fazer contato comercial e entender se preço, prazo ou concorrente mudou a preferência.',
      estimatedImpact: drop,
      priorityScore: 90 + Math.min(30, drop / 1000),
    };
  }

  if ((stat.risk === 'lost' || stat.risk === 'high_risk') && stat.riskRevenue90d >= 1000) {
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'reactivate',
      title: stat.risk === 'lost' ? 'Cliente provavelmente perdido' : 'Cliente em alto risco',
      reason: `${stat.daysSinceLastNote ?? 0} dias sem enviar O.S.; histórico aponta R$ ${stat.riskRevenue90d.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em 90 dias.`,
      recommendedAction: 'Criar abordagem de recuperação com visita, ligação e condição de retorno.',
      estimatedImpact: stat.riskRevenue90d,
      priorityScore: 78 + Math.min(20, stat.riskRevenue90d / 1000),
    };
  }

  if (stat.noteCount === 1 && stat.avgTicket >= 700) {
    const impact = stat.avgTicket * 2;
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'first_service_followup',
      title: 'Primeira O.S. sem recorrência',
      reason: `Fez 1 O.S. de R$ ${stat.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} e ainda não virou recorrente.`,
      recommendedAction: 'Enviar pós-venda e pedir indicação/retorno para próximos cabeçotes.',
      estimatedImpact: impact,
      priorityScore: 58 + Math.min(18, impact / 1000),
    };
  }

  if (stat.noteCount >= 2 && stat.noteCount <= 5 && stat.avgTicket >= 1000) {
    const missingToSix = Math.max(0, 6 - stat.noteCount);
    const impact = missingToSix * stat.avgTicket;
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'grow_low_frequency',
      title: 'Alto ticket com pouca frequência',
      reason: `${stat.noteCount} O.S. com ticket médio de R$ ${stat.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`,
      recommendedAction: 'Oferecer parceria simples: prioridade, retirada combinada ou condição por volume.',
      estimatedImpact: impact,
      priorityScore: 62 + Math.min(18, impact / 1000),
    };
  }

  if (stat.trend === 'growing' || stat.trend === 'reactivated') {
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'expand_growth',
      title: stat.trend === 'reactivated' ? 'Cliente voltou a comprar' : 'Cliente em crescimento',
      reason: `Últimos 90 dias cresceram R$ ${Math.max(0, stat.revenueDelta).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}.`,
      recommendedAction: 'Acompanhar de perto e propor acordo para aumentar recorrência.',
      estimatedImpact: Math.max(stat.revenueDelta, stat.avgTicket),
      priorityScore: 55 + Math.min(16, Math.max(stat.revenueDelta, stat.avgTicket) / 1000),
    };
  }

  if (stat.crmClass === 'A' && stat.risk !== 'lost') {
    return {
      clientId: stat.client.id,
      clientName,
      city,
      type: 'protect_top_client',
      title: 'Cliente classe A para blindar',
      reason: `Representa ${(stat.revenueShare * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da receita mapeada.`,
      recommendedAction: 'Manter relacionamento ativo com visita e checagem de satisfação.',
      estimatedImpact: Math.max(stat.recentRevenue, stat.monthlyRunRate),
      priorityScore: 50 + Math.min(14, stat.totalRevenue / 10000),
    };
  }

  return null;
}

export function buildCustomerCrm({
  clients,
  notes,
  referenceDate = new Date(),
  recentDays = DEFAULT_RECENT_DAYS,
  previousDays = DEFAULT_PREVIOUS_DAYS,
}: BuildCustomerCrmOptions): CustomerCrmResult {
  const recentStart = new Date(referenceDate.getTime() - recentDays * DAY_MS);
  const previousStart = new Date(referenceDate.getTime() - (recentDays + previousDays) * DAY_MS);
  const notesByClient = new Map<string, IntakeNote[]>();

  for (const note of notes) {
    if (!note.clientId) continue;
    const current = notesByClient.get(note.clientId) ?? [];
    current.push(note);
    notesByClient.set(note.clientId, current);
  }

  const baseStats = clients.map((client) => {
    const clientNotes = notesByClient.get(client.id) ?? [];
    const billableNotes = clientNotes.filter((note) => BILLABLE_STATUSES.has(note.status));
    const totalRevenue = billableNotes.reduce((sum, note) => sum + (note.totalAmount || 0), 0);
    const potentialRevenue = clientNotes
      .filter((note) => note.status !== 'EXCLUIDA')
      .reduce((sum, note) => sum + (note.totalAmount || 0), 0);
    const datedNotes = clientNotes
      .map((note) => ({ note, date: toValidDate(note.createdAt) }))
      .filter((entry): entry is { note: IntakeNote; date: Date } => entry.date != null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstNoteAt = datedNotes[0]?.date ?? null;
    const lastNoteAt = datedNotes[datedNotes.length - 1]?.date ?? null;
    const daysSinceLastNote = lastNoteAt ? daysBetween(referenceDate, lastNoteAt) : null;
    const recentNotes = datedNotes.filter((entry) => isInsideWindow(entry.date, recentStart, referenceDate));
    const previousNotes = datedNotes.filter((entry) => isInsideWindow(entry.date, previousStart, recentStart));
    const recentRevenue = recentNotes
      .filter((entry) => BILLABLE_STATUSES.has(entry.note.status))
      .reduce((sum, entry) => sum + (entry.note.totalAmount || 0), 0);
    const previousRevenue = previousNotes
      .filter((entry) => BILLABLE_STATUSES.has(entry.note.status))
      .reduce((sum, entry) => sum + (entry.note.totalAmount || 0), 0);
    const revenueDelta = recentRevenue - previousRevenue;
    const observedDays = firstNoteAt && lastNoteAt ? Math.max(30, daysBetween(lastNoteAt, firstNoteAt) + 1) : 30;
    const monthlyRunRate = totalRevenue / (observedDays / 30);
    const risk = getRiskLevel(clientNotes.length, daysSinceLastNote);
    const avgTicket = billableNotes.length > 0 ? totalRevenue / billableNotes.length : 0;

    return {
      client,
      crmClass: 'C' as CustomerCrmClass,
      risk,
      trend: getTrend({ noteCount: clientNotes.length, firstNoteAt, referenceDate, recentRevenue, previousRevenue, revenueDelta }),
      noteCount: clientNotes.length,
      billableNoteCount: billableNotes.length,
      totalRevenue,
      potentialRevenue,
      avgTicket,
      firstNoteAt,
      lastNoteAt,
      daysSinceLastNote,
      recentRevenue,
      previousRevenue,
      revenueDelta,
      revenueDeltaPercent: previousRevenue > 0 ? revenueDelta / previousRevenue : null,
      recentNoteCount: recentNotes.length,
      previousNoteCount: previousNotes.length,
      monthlyRunRate,
      riskRevenue90d: monthlyRunRate * 3,
      revenueShare: 0,
      cumulativeRevenueShare: 0,
    } satisfies CustomerCrmStats;
  });

  const totalRevenue = baseStats.reduce((sum, stat) => sum + stat.totalRevenue, 0);
  const sortedByRevenue = [...baseStats].sort((a, b) => b.totalRevenue - a.totalRevenue);
  let cumulativeRevenue = 0;

  for (const stat of sortedByRevenue) {
    const beforeShare = totalRevenue > 0 ? cumulativeRevenue / totalRevenue : 1;
    cumulativeRevenue += stat.totalRevenue;
    stat.revenueShare = totalRevenue > 0 ? stat.totalRevenue / totalRevenue : 0;
    stat.cumulativeRevenueShare = totalRevenue > 0 ? cumulativeRevenue / totalRevenue : 0;
    stat.crmClass = beforeShare < 0.8 ? 'A' : beforeShare < 0.95 ? 'B' : 'C';
  }

  const opportunities = baseStats
    .map(buildOpportunity)
    .filter((opportunity): opportunity is CustomerCommercialOpportunity => opportunity != null && opportunity.estimatedImpact > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.estimatedImpact - a.estimatedImpact);

  const classCounts = baseStats.reduce<Record<CustomerCrmClass, number>>((acc, stat) => {
    acc[stat.crmClass] += 1;
    return acc;
  }, { A: 0, B: 0, C: 0 });
  const atRiskCount = baseStats.filter((stat) => stat.risk === 'watch' || stat.risk === 'high_risk' || stat.risk === 'lost').length;
  const lostCount = baseStats.filter((stat) => stat.risk === 'lost').length;
  const fallingStats = baseStats.filter((stat) => stat.trend === 'falling' && stat.previousRevenue >= 1000);
  const growthPotential = opportunities.slice(0, 20).reduce((sum, opportunity) => sum + opportunity.estimatedImpact, 0);
  const billableNoteCount = baseStats.reduce((sum, stat) => sum + stat.billableNoteCount, 0);

  return {
    summary: {
      totalClients: clients.length,
      clientsWithHistory: baseStats.filter((stat) => stat.noteCount > 0).length,
      totalRevenue,
      totalNotes: baseStats.reduce((sum, stat) => sum + stat.noteCount, 0),
      avgTicket: billableNoteCount > 0 ? totalRevenue / billableNoteCount : 0,
      classCounts,
      atRiskCount,
      lostCount,
      fallingCount: fallingStats.length,
      growingCount: baseStats.filter((stat) => stat.trend === 'growing' || stat.trend === 'reactivated' || stat.trend === 'new').length,
      revenueAtRisk90d: fallingStats.reduce((sum, stat) => sum + Math.max(0, stat.previousRevenue - stat.recentRevenue), 0),
      growthPotential,
      oneServiceClients: baseStats.filter((stat) => stat.noteCount === 1).length,
    },
    stats: sortedByRevenue,
    statsByClientId: new Map(baseStats.map((stat) => [stat.client.id, stat])),
    opportunities,
  };
}
