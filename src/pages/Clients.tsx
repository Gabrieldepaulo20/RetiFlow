import { useMemo, useState } from 'react';
import { useOperationalData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  BadgeDollarSign,
  Download,
  Eye,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import {
  buildCustomerCrm,
  type CustomerCrmClass,
  type CustomerCrmStats,
  type CustomerRiskLevel,
  type CustomerTrend,
} from '@/services/domain/customerCrm';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { Client } from '@/types';

type CommercialFilter = 'all' | 'risk' | 'growth' | 'classA' | 'one_service';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

const CRM_CLASS_META: Record<CustomerCrmClass, { label: string; className: string }> = {
  A: { label: 'Classe A', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  B: { label: 'Classe B', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  C: { label: 'Classe C', className: 'border-slate-200 bg-slate-50 text-slate-700' },
};

const RISK_META: Record<CustomerRiskLevel, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  watch: { label: 'Atenção', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  high_risk: { label: 'Alto risco', className: 'border-orange-200 bg-orange-50 text-orange-800' },
  lost: { label: 'Parado', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  no_history: { label: 'Sem histórico', className: 'border-slate-200 bg-slate-50 text-slate-700' },
};

const TREND_META: Record<CustomerTrend, { label: string; className: string }> = {
  growing: { label: 'Crescendo', className: 'text-emerald-700' },
  falling: { label: 'Em queda', className: 'text-rose-700' },
  reactivated: { label: 'Voltou', className: 'text-teal-700' },
  new: { label: 'Novo', className: 'text-sky-700' },
  stable: { label: 'Estável', className: 'text-slate-600' },
  no_history: { label: 'Sem histórico', className: 'text-slate-500' },
};

const escapeCsvCell = (value: unknown) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const formatDate = (date: Date | null) => (date ? dateFormatter.format(date) : 'Sem O.S.');

const normalizeSearchText = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const downloadClientsCsv = (clients: Client[], statsByClientId: Map<string, CustomerCrmStats>) => {
  const headers = [
    'Nome',
    'Tipo documento',
    'Documento',
    'Telefone',
    'Email',
    'Endereco',
    'Cidade',
    'UF',
    'Status',
    'Classe CRM',
    'Risco',
    'Faturamento',
    'O.S.',
    'Ultima O.S.',
  ];
  const rows = clients.map((client) => {
    const stat = statsByClientId.get(client.id);
    return [
      client.name,
      client.docType,
      client.docNumber,
      client.phone,
      client.email,
      buildCustomerAddressLabel(client),
      client.city,
      client.state,
      client.isActive ? 'Ativo' : 'Inativo',
      stat?.crmClass ?? '',
      stat ? RISK_META[stat.risk].label : '',
      stat?.totalRevenue ?? 0,
      stat?.noteCount ?? 0,
      stat?.lastNoteAt ? dateFormatter.format(stat.lastNoteAt) : '',
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clientes-crm-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: 'default' | 'green' | 'amber' | 'rose';
}) {
  const toneClass = {
    default: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone];

  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground md:text-2xl">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function ClientCrmBadges({ stat }: { stat?: CustomerCrmStats }) {
  if (!stat) {
    return <Badge variant="outline" className="rounded-full text-[11px]">Sem dados</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className={cn('rounded-full text-[11px]', CRM_CLASS_META[stat.crmClass].className)}>
        {CRM_CLASS_META[stat.crmClass].label}
      </Badge>
      <Badge variant="outline" className={cn('rounded-full text-[11px]', RISK_META[stat.risk].className)}>
        {RISK_META[stat.risk].label}
      </Badge>
    </div>
  );
}

function crmMatchesCommercialFilter(
  filter: CommercialFilter,
  stat: CustomerCrmStats | undefined,
) {
  if (filter === 'all') return true;
  if (!stat) return false;
  if (filter === 'risk') return stat.risk === 'watch' || stat.risk === 'high_risk' || stat.risk === 'lost';
  if (filter === 'growth') return stat.trend === 'growing' || stat.trend === 'reactivated' || stat.trend === 'new';
  if (filter === 'classA') return stat.crmClass === 'A';
  if (filter === 'one_service') return stat.noteCount === 1;
  return true;
}

export default function Clients() {
  const { clients, notes, updateClient } = useOperationalData();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDocType, setFilterDocType] = useState<'all' | 'CPF' | 'CNPJ'>('all');
  const [commercialFilter, setCommercialFilter] = useState<CommercialFilter>('all');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const crm = useMemo(() => buildCustomerCrm({ clients, notes }), [clients, notes]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    const normalizedQuery = q.replace(/\D/g, '');

    return clients
      .filter((client) => {
        const stat = crm.statsByClientId.get(client.id);
        if (filterStatus === 'active' && !client.isActive) return false;
        if (filterStatus === 'inactive' && client.isActive) return false;
        if (filterDocType !== 'all' && client.docType !== filterDocType) return false;
        if (!crmMatchesCommercialFilter(commercialFilter, stat)) return false;
        if (q) {
          const searchable = normalizeSearchText([
            client.name,
            client.tradeName,
            client.docNumber,
            client.phone,
            client.email,
            client.city,
            client.state,
          ].filter(Boolean).join(' '));
          const normalizedDocument = client.docNumber.replace(/\D/g, '');
          return searchable.includes(q) || (normalizedQuery.length > 0 && normalizedDocument.includes(normalizedQuery));
        }
        return true;
      })
      .sort((a, b) => {
        const aStat = crm.statsByClientId.get(a.id);
        const bStat = crm.statsByClientId.get(b.id);
        const byRevenue = (bStat?.totalRevenue ?? 0) - (aStat?.totalRevenue ?? 0);
        if (byRevenue !== 0) return byRevenue;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [clients, commercialFilter, crm.statsByClientId, filterDocType, filterStatus, search]);

  const filteredDocCounts = useMemo(() => {
    return filtered.reduce(
      (acc, client) => {
        if (client.docType === 'CNPJ') acc.cnpj += 1;
        if (client.docType === 'CPF') acc.cpf += 1;
        return acc;
      },
      { cpf: 0, cnpj: 0 },
    );
  }, [filtered]);

  const editingClient = editingClientId ? clients.find((client) => client.id === editingClientId) : undefined;

  const openEdit = (clientId: string) => {
    setSelectedClientId(null);
    setEditingClientId(clientId);
  };

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">CRM comercial</p>
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Quem gera receita, quem está sumindo e onde agir para vender mais.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[18rem]">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              downloadClientsCsv(filtered, crm.statsByClientId);
              toast({
                title: 'Exportação concluída',
                description: `${filtered.length} cliente${filtered.length === 1 ? '' : 's'} exportado${filtered.length === 1 ? '' : 's'} com métricas de CRM.`,
              });
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <Button className="w-full" onClick={() => setNewClientOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          label="Receita mapeada"
          value={formatCurrency(crm.summary.totalRevenue)}
          detail={`${crm.summary.clientsWithHistory} clientes com histórico`}
          icon={BadgeDollarSign}
          tone="green"
        />
        <MetricTile
          label="Receita em risco"
          value={formatCurrency(crm.summary.revenueAtRisk90d)}
          detail={`${crm.summary.fallingCount} clientes em queda`}
          icon={AlertTriangle}
          tone="rose"
        />
        <MetricTile
          label="Classe A"
          value={`${crm.summary.classCounts.A}`}
          detail="Clientes que sustentam a carteira"
          icon={ShieldCheck}
        />
      </section>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 grid gap-2 md:grid-cols-[minmax(16rem,1fr)_140px_150px_190px]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, cidade, telefone ou documento"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 pl-9 text-sm"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-10 w-full px-2 text-xs md:px-3 md:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDocType} onValueChange={(value) => setFilterDocType(value as 'all' | 'CPF' | 'CNPJ')}>
              <SelectTrigger className="h-10 w-full px-2 text-xs md:px-3 md:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">CPF/CNPJ</SelectItem>
                <SelectItem value="CPF">CPF</SelectItem>
                <SelectItem value="CNPJ">CNPJ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={commercialFilter} onValueChange={(value) => setCommercialFilter(value as CommercialFilter)}>
              <SelectTrigger className="h-10 w-full px-2 text-xs md:px-3 md:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos no CRM</SelectItem>
                <SelectItem value="risk">Em risco</SelectItem>
                <SelectItem value="growth">Crescendo</SelectItem>
                <SelectItem value="classA">Classe A</SelectItem>
                <SelectItem value="one_service">Só 1 O.S.</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5 md:mb-4 md:gap-2">
            <Badge variant="outline" className="rounded-full bg-background text-[11px] md:text-xs">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} na lista
            </Badge>
            <Badge variant="secondary" className="rounded-full text-[11px] md:text-xs">
              {filteredDocCounts.cnpj} empresa{filteredDocCounts.cnpj !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="secondary" className="rounded-full text-[11px] md:text-xs">
              {filteredDocCounts.cpf} pessoa{filteredDocCounts.cpf !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="rounded-full text-[11px] md:text-xs">
              Ticket médio {formatCurrency(crm.summary.avgTicket)}
            </Badge>
          </div>

          <div className="grid gap-2 lg:hidden">
            {filtered.map((client) => {
              const stat = crm.statsByClientId.get(client.id);

              return (
                <div key={client.id} className="rounded-lg border border-border/60 bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight text-foreground">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.docType}: {client.docNumber}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setSelectedClientId(client.id)}>
                          <Eye className="mr-2 h-4 w-4" /> Ver cliente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(client.id)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { void updateClient(client.id, { isActive: !client.isActive }); }}>
                          {client.isActive ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ClientCrmBadges stat={stat} />
                    <Badge variant={client.isActive ? 'default' : 'secondary'} className="h-6 rounded-full px-2 text-[11px]">
                      {client.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Faturamento</p>
                      <p className="font-bold tabular-nums">{formatCurrency(stat?.totalRevenue ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">O.S.</p>
                      <p className="font-bold tabular-nums">{stat?.noteCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Última</p>
                      <p className="font-bold tabular-nums">{formatDate(stat?.lastNoteAt ?? null)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.phone || 'Telefone não informado'}</span>
                    </span>
                    {(client.city || client.state) ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{[client.city, client.state].filter(Boolean).join('/')}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border/60 lg:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Cliente</TableHead>
                  <TableHead className="w-[15%]">Perfil CRM</TableHead>
                  <TableHead className="w-[15%]">Receita</TableHead>
                  <TableHead className="w-[14%]">Frequência</TableHead>
                  <TableHead className="w-[14%]">Última O.S.</TableHead>
                  <TableHead className="w-[150px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client) => {
                  const stat = crm.statsByClientId.get(client.id);

                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{client.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{client.docType}: {client.docNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">{client.city}/{client.state}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ClientCrmBadges stat={stat} />
                        {stat ? (
                          <p className={cn('mt-1 text-xs font-medium', TREND_META[stat.trend].className)}>
                            {TREND_META[stat.trend].label}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="font-bold tabular-nums">{formatCurrency(stat?.totalRevenue ?? 0)}</p>
                        {stat ? (
                          <p className="text-xs text-muted-foreground">
                            {percentFormatter.format(stat.revenueShare * 100)}% da carteira
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{stat?.noteCount ?? 0} O.S.</p>
                        <p className="text-xs text-muted-foreground">Ticket {formatCurrency(stat?.avgTicket ?? 0)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium tabular-nums">{formatDate(stat?.lastNoteAt ?? null)}</p>
                        {stat?.daysSinceLastNote != null ? (
                          <p className="text-xs text-muted-foreground">{stat.daysSinceLastNote} dia{stat.daysSinceLastNote === 1 ? '' : 's'} sem O.S.</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedClientId(client.id)}>Ver</Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(client.id)}>Editar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ClientDetailModal
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
        onEdit={openEdit}
      />

      <ClientFormModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSuccess={() => setNewClientOpen(false)}
      />

      <ClientFormModal
        open={Boolean(editingClient)}
        editingClient={editingClient}
        onClose={() => setEditingClientId(null)}
        onSuccess={() => setEditingClientId(null)}
      />
    </div>
  );
}
