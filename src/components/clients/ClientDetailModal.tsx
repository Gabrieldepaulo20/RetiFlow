import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { STATUS_COLORS, STATUS_LABELS, FINAL_STATUSES } from '@/types';
import {
  Mail, MapPin, Phone, Pencil, Check, X,
  FileText, Paperclip, ExternalLink, User, Building,
  Hash, Calendar, TrendingUp, Clock,
} from 'lucide-react';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientDetailModalProps {
  clientId: string | null;
  onClose: () => void;
  onEdit?: (clientId: string) => void;
}

export default function ClientDetailModal({ clientId, onClose, onEdit }: ClientDetailModalProps) {
  const { getClient, notes, attachments, updateClient } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editingObs, setEditingObs] = useState(false);
  const [obsValue, setObsValue] = useState('');

  const client = clientId ? getClient(clientId) : undefined;

  const clientNotes = useMemo(() => {
    if (!client) return [];
    return notes
      .filter((n) => n.clientId === client.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [client, notes]);

  const clientAttachments = useMemo(() => {
    if (!client) return [];
    return attachments.filter(
      (a) => a.clientId === client.id || clientNotes.some((n) => n.id === a.noteId),
    );
  }, [attachments, client, clientNotes]);

  const totalRevenue = useMemo(
    () =>
      clientNotes
        .filter((n) => n.status === 'FINALIZADO')
        .reduce((s, n) => s + n.totalAmount, 0),
    [clientNotes],
  );

  const activeNotes = useMemo(
    () => clientNotes.filter((n) => !FINAL_STATUSES.has(n.status)).length,
    [clientNotes],
  );

  const initials = client
    ? client.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '';

  const startEditObs = () => {
    setObsValue(client?.notes ?? '');
    setEditingObs(true);
  };

  const saveObs = () => {
    if (!client) return;
    void updateClient(client.id, { notes: obsValue });
    setEditingObs(false);
    toast({ title: 'Observações salvas' });
  };

  const cancelObs = () => {
    setEditingObs(false);
    setObsValue('');
  };

  return (
    <>
      <DialogPrimitive.Root open={!!clientId} onOpenChange={(v) => !v && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
              'h-[100dvh] w-[calc(100vw-1rem)]',
              'sm:h-[min(720px,calc(100vh-3rem))] sm:w-[min(760px,calc(100vw-2rem))] sm:rounded-[28px]',
              'flex flex-col overflow-hidden',
              'bg-card border border-white/10 shadow-2xl shadow-slate-950/30',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
          >
            <DialogPrimitive.Close className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {client ? (
              <>
                {/* ── Colored top strip ── */}
                <div className={cn(
                  'h-1 shrink-0',
                  client.isActive
                    ? 'bg-gradient-to-r from-primary/50 via-primary to-accent/70'
                    : 'bg-gradient-to-r from-zinc-300 via-zinc-400 to-zinc-300',
                )} />

                {/* ── Header ── */}
                <div className={cn(
                  'shrink-0 border-b px-5 py-5 pr-16 sm:px-6',
                  'bg-gradient-to-br from-primary/[0.09] via-background to-background',
                )}>
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className={cn(
                      'flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-3xl shadow-sm ring-1',
                      client.isActive
                        ? 'bg-primary/10 text-primary ring-primary/20'
                        : 'bg-zinc-100 text-zinc-400 ring-zinc-200',
                    )}>
                      {client.docType === 'CNPJ' ? (
                        <Building className="w-5 h-5" />
                      ) : (
                        <span className="text-sm font-bold">{initials}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Name + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <DialogPrimitive.Title className="min-w-0 truncate font-display text-lg font-bold leading-tight text-foreground sm:text-xl">
                          {client.name}
                        </DialogPrimitive.Title>
                        <Badge
                          variant={client.isActive ? 'default' : 'secondary'}
                          className="text-[10px] h-5 px-1.5 shrink-0"
                        >
                          {client.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      {/* Doc */}
                      <DialogPrimitive.Description className="mt-1 text-xs font-mono text-muted-foreground/70">
                        {client.docType}: {client.docNumber}
                      </DialogPrimitive.Description>

                      {/* Stats chips */}
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        {clientNotes.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-600 border border-blue-200/70 rounded-full px-2 py-0.5 font-medium">
                            <FileText className="w-3 h-3" /> {clientNotes.length} O.S.
                          </span>
                        )}
                        {activeNotes > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-600 border border-amber-200/70 rounded-full px-2 py-0.5 font-medium">
                            <Clock className="w-3 h-3" /> {activeNotes} em aberto
                          </span>
                        )}
                        {totalRevenue > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-200/70 rounded-full px-2 py-0.5 font-medium">
                            <TrendingUp className="w-3 h-3" /> R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => client && onEdit?.(client.id)}
                      title="Editar cadastro"
                      className="mr-9 hidden h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:flex"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit?.(client.id)}
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:hidden"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar cadastro
                  </button>
                </div>

                {/* ── Tabs ── */}
                <Tabs defaultValue="cadastro" className="flex flex-col flex-1 min-h-0">
                  <TabsList className="h-auto shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b bg-muted/35 px-4 py-2 sm:px-6">
                    {[
                      { value: 'cadastro', label: 'Cadastro' },
                      { value: 'historico', label: `Histórico (${clientNotes.length})` },
                      { value: 'anexos', label: `Anexos (${clientAttachments.length})` },
                    ].map(({ value, label }) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className={cn(
                          'relative h-9 rounded-xl border border-transparent px-4',
                          'text-sm font-medium text-muted-foreground',
                          'transition-colors data-[state=active]:border-border/60',
                          'data-[state=active]:text-foreground data-[state=active]:bg-background',
                          'data-[state=active]:shadow-sm',
                        )}
                      >
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* ── Cadastro ── */}
                  <TabsContent value="cadastro" className="flex-1 overflow-y-auto m-0 min-h-0">
                    <div className="p-4 sm:p-6 space-y-4">
                      {/* Contact + address grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <InfoRow
                          icon={<Phone className="w-3.5 h-3.5" />}
                          iconColor="text-blue-500"
                          label="Telefone / WhatsApp"
                          value={client.phone || '—'}
                        />
                        <InfoRow
                          icon={<Mail className="w-3.5 h-3.5" />}
                          iconColor="text-violet-500"
                          label="E-mail"
                          value={client.email || '—'}
                        />
                        <InfoRow
                          icon={<MapPin className="w-3.5 h-3.5" />}
                          iconColor="text-rose-500"
                          label="Endereço"
                          value={buildCustomerAddressLabel(client) || '—'}
                          className="sm:col-span-2"
                        />
                        {client.tradeName && (
                          <InfoRow
                            icon={<Building className="w-3.5 h-3.5" />}
                            iconColor="text-amber-500"
                            label="Nome fantasia"
                            value={client.tradeName}
                          />
                        )}
                        {client.cep && (
                          <InfoRow
                            icon={<Hash className="w-3.5 h-3.5" />}
                            iconColor="text-teal-500"
                            label="CEP"
                            value={client.cep}
                          />
                        )}
                        <InfoRow
                          icon={<Calendar className="w-3.5 h-3.5" />}
                          iconColor="text-indigo-400"
                          label="Cadastrado em"
                          value={format(new Date(client.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        />
                      </div>

                      <div className="border-t border-border/40" />

                      {/* Observations */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Observações
                          </p>
                          {!editingObs && (
                            <button
                              type="button"
                              onClick={startEditObs}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              {client.notes ? 'Editar' : 'Adicionar'}
                            </button>
                          )}
                        </div>

                        {editingObs ? (
                          <div className="space-y-2">
                            <Textarea
                              value={obsValue}
                              onChange={(e) => setObsValue(e.target.value)}
                              placeholder="Adicione observações sobre este cliente..."
                              rows={3}
                              className="resize-none rounded-2xl text-sm"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="h-8 gap-1.5" onClick={saveObs}>
                                <Check className="w-3.5 h-3.5" /> Salvar
                              </Button>
                              <Button size="sm" variant="outline" className="h-8" onClick={cancelObs}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className={cn(
                            'text-sm leading-relaxed rounded-2xl border px-3 py-3',
                            client.notes
                              ? 'border-border/50 bg-background text-foreground/80'
                              : 'border-dashed border-border/60 bg-muted/20 text-muted-foreground/50 italic',
                          )}>
                            {client.notes || 'Nenhuma observação cadastrada.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── Histórico ── */}
                  <TabsContent value="historico" className="flex-1 overflow-y-auto m-0 min-h-0">
                    <div className="p-4 sm:p-6">
                      {clientNotes.length === 0 ? (
                        <div className="py-14 text-center">
                          <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2.5" />
                          <p className="text-sm text-muted-foreground">
                            Nenhuma O.S. encontrada para este cliente.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 mb-3 px-1">
                            <span className="text-xs text-muted-foreground">{clientNotes.length} total</span>
                            {activeNotes > 0 && (
                              <span className="text-xs text-amber-600 font-medium">{activeNotes} em aberto</span>
                            )}
                            {totalRevenue > 0 && (
                              <span className="ml-auto text-xs font-semibold text-emerald-600 tabular-nums">
                                R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} faturado
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {clientNotes.map((note) => (
                              <button
                                key={note.id}
                                type="button"
                                className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border/60 hover:bg-background hover:shadow-sm"
                                onClick={() => { onClose(); navigate(`/notas-entrada/${note.id}`); }}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-primary">{note.number}</span>
                                    <span className="text-xs text-muted-foreground/60">
                                      {format(new Date(note.createdAt), 'dd/MM/yyyy')}
                                    </span>
                                  </div>
                                  {(note.vehicleModel || note.plate) && (
                                    <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                                      {note.vehicleModel}{note.plate ? ` · ${note.plate}` : ''}
                                    </p>
                                  )}
                                </div>
                                <Badge className={cn('shrink-0 text-[10px] h-5', STATUS_COLORS[note.status])}>
                                  {STATUS_LABELS[note.status]}
                                </Badge>
                                <span className="text-sm font-semibold tabular-nums shrink-0">
                                  R$ {note.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/25 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  {/* ── Anexos ── */}
                  <TabsContent value="anexos" className="flex-1 overflow-y-auto m-0 min-h-0">
                    <div className="p-4 sm:p-6">
                      {clientAttachments.length === 0 ? (
                        <div className="py-14 text-center">
                          <Paperclip className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2.5" />
                          <p className="text-sm text-muted-foreground">Nenhum anexo encontrado.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {clientAttachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-border/50 bg-background p-3 shadow-sm transition-colors hover:bg-muted/40"
                            >
                              <div className="w-10 h-10 rounded-lg bg-foreground/[0.06] flex items-center justify-center">
                                <span className="text-[10px] font-bold text-foreground/40 uppercase">{att.type}</span>
                              </div>
                              <p className="text-xs text-foreground/60 truncate w-full text-center">{att.filename}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="text-center">
                  <User className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

/** Compact info row */
function InfoRow({
  icon,
  iconColor,
  label,
  value,
  className,
}: {
  icon?: React.ReactNode;
  iconColor?: string;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl bg-muted/30 px-3 py-2.5 flex items-start gap-2.5', className)}>
      {icon && (
        <span className={cn('mt-0.5 shrink-0', iconColor ?? 'text-muted-foreground/40')}>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-sm font-medium text-foreground/80 break-words leading-snug">{value}</p>
      </div>
    </div>
  );
}
