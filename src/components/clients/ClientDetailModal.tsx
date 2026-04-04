import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_COLORS, STATUS_LABELS, FINAL_STATUSES } from '@/types';
import {
  Mail, MapPin, Phone, Pencil, Check, X,
  FileText, Paperclip, ExternalLink, User, Building,
} from 'lucide-react';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientDetailModalProps {
  clientId: string | null;
  onClose: () => void;
}

export default function ClientDetailModal({ clientId, onClose }: ClientDetailModalProps) {
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
    ? client.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '';

  const startEditObs = () => {
    setObsValue(client?.notes ?? '');
    setEditingObs(true);
  };

  const saveObs = () => {
    if (!client) return;
    updateClient(client.id, { notes: obsValue });
    setEditingObs(false);
    toast({ title: 'Observações salvas' });
  };

  const cancelObs = () => {
    setEditingObs(false);
    setObsValue('');
  };

  return (
    <DialogPrimitive.Root open={!!clientId} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100vw-1rem)] h-[100dvh]',
            'sm:w-[640px] sm:h-auto sm:max-h-[88vh] sm:rounded-2xl',
            'lg:w-[760px]',
            'flex flex-col overflow-hidden',
            'bg-background border border-border/50 shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors focus:outline-none">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          {client ? (
            <>
              {/* ── Header ── */}
              <div className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 select-none">
                    {client.docType === 'CNPJ' ? (
                      <Building className="w-5 h-5 text-primary/60" />
                    ) : (
                      <span className="text-sm font-bold text-primary">{initials}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold font-display leading-tight truncate">
                        {client.name}
                      </h2>
                      <Badge
                        variant={client.isActive ? 'default' : 'secondary'}
                        className="text-[10px] h-5 px-1.5"
                      >
                        {client.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {/* Key metrics row */}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground/70">
                        {client.docType}: {client.docNumber}
                      </span>
                      {clientNotes.length > 0 && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">·</span>
                          <span className="text-xs text-muted-foreground/70">
                            {clientNotes.length} O.S.
                          </span>
                        </>
                      )}
                      {activeNotes > 0 && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">·</span>
                          <span className="text-xs text-amber-600 font-medium">
                            {activeNotes} em aberto
                          </span>
                        </>
                      )}
                      {totalRevenue > 0 && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">·</span>
                          <span className="text-xs text-muted-foreground/70">
                            R$ {totalRevenue.toLocaleString('pt-BR')} faturado
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Tabs ── */}
              <Tabs defaultValue="cadastro" className="flex flex-col flex-1 min-h-0">
                {/* Tab bar */}
                <TabsList className="shrink-0 h-auto rounded-none border-b bg-transparent px-5 sm:px-6 pt-0 pb-0 justify-start gap-0">
                  {[
                    { value: 'cadastro', label: 'Cadastro' },
                    { value: 'historico', label: `Histórico (${clientNotes.length})` },
                    { value: 'anexos', label: `Anexos (${clientAttachments.length})` },
                  ].map(({ value, label }) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className={cn(
                        'relative h-10 rounded-none border-b-2 border-transparent px-4',
                        'text-sm font-medium text-muted-foreground',
                        'transition-none data-[state=active]:border-primary',
                        'data-[state=active]:text-foreground data-[state=active]:bg-transparent',
                        'data-[state=active]:shadow-none',
                      )}
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* ── Cadastro ── */}
                <TabsContent value="cadastro" className="flex-1 overflow-y-auto m-0 min-h-0">
                  <div className="p-5 sm:p-6 space-y-5">
                    {/* Contact grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <InfoRow
                        icon={<Phone className="w-3.5 h-3.5" />}
                        label="Telefone"
                        value={client.phone || '—'}
                      />
                      <InfoRow
                        icon={<Mail className="w-3.5 h-3.5" />}
                        label="E-mail"
                        value={client.email || '—'}
                      />
                      <InfoRow
                        icon={<MapPin className="w-3.5 h-3.5" />}
                        label="Endereço"
                        value={buildCustomerAddressLabel(client) || '—'}
                        className="sm:col-span-2"
                      />
                      {client.tradeName && (
                        <InfoRow label="Nome fantasia" value={client.tradeName} />
                      )}
                      {client.city && (
                        <InfoRow
                          label="Cidade / UF"
                          value={`${client.city} — ${client.state}`}
                        />
                      )}
                      {client.cep && (
                        <InfoRow label="CEP" value={client.cep} />
                      )}
                      <InfoRow
                        label="Cadastrado em"
                        value={format(new Date(client.createdAt), "dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      />
                    </div>

                    <div className="border-t border-border/40" />

                    {/* Observations — inline editable */}
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
                            rows={4}
                            className="resize-none text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8 gap-1.5" onClick={saveObs}>
                              <Check className="w-3.5 h-3.5" /> Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={cancelObs}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className={cn(
                            'text-sm leading-relaxed rounded-xl px-3 py-2.5',
                            client.notes
                              ? 'bg-muted/30 text-foreground/80'
                              : 'text-muted-foreground/40 italic',
                          )}
                        >
                          {client.notes || 'Nenhuma observação cadastrada.'}
                        </p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── Histórico ── */}
                <TabsContent value="historico" className="flex-1 overflow-y-auto m-0 min-h-0">
                  <div className="p-5 sm:p-6">
                    {clientNotes.length === 0 ? (
                      <div className="py-14 text-center">
                        <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2.5" />
                        <p className="text-sm text-muted-foreground">
                          Nenhuma O.S. encontrada para este cliente.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Summary bar */}
                        <div className="flex items-center gap-4 mb-3 px-1 text-xs text-muted-foreground">
                          <span>{clientNotes.length} total</span>
                          {activeNotes > 0 && (
                            <span className="text-amber-600 font-medium">{activeNotes} em aberto</span>
                          )}
                          {totalRevenue > 0 && (
                            <span className="ml-auto font-semibold text-foreground/70 tabular-nums">
                              R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} faturado
                            </span>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          {clientNotes.map((note) => (
                            <button
                              key={note.id}
                              type="button"
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left group"
                              onClick={() => {
                                onClose();
                                navigate(`/notas-entrada/${note.id}`);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-primary">
                                    {note.number}
                                  </span>
                                  <span className="text-xs text-muted-foreground/60">
                                    {format(new Date(note.createdAt), 'dd/MM/yyyy')}
                                  </span>
                                </div>
                                {(note.vehicleModel || note.plate) && (
                                  <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                                    {note.vehicleModel}
                                    {note.plate ? ` · ${note.plate}` : ''}
                                  </p>
                                )}
                              </div>
                              <Badge
                                className={cn('shrink-0 text-[10px] h-5', STATUS_COLORS[note.status])}
                              >
                                {STATUS_LABELS[note.status]}
                              </Badge>
                              <span className="text-sm font-semibold tabular-nums shrink-0">
                                R${' '}
                                {note.totalAmount.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}
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
                  <div className="p-5 sm:p-6">
                    {clientAttachments.length === 0 ? (
                      <div className="py-14 text-center">
                        <Paperclip className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2.5" />
                        <p className="text-sm text-muted-foreground">Nenhum anexo encontrado.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {clientAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-lg bg-foreground/[0.06] flex items-center justify-center">
                              <span className="text-[10px] font-bold text-foreground/40 uppercase">
                                {att.type}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/60 truncate w-full text-center">
                              {att.filename}
                            </p>
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
  );
}

/** Compact info row used in the Cadastro tab */
function InfoRow({
  icon,
  label,
  value,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl bg-muted/30 px-3 py-2.5', className)}>
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground/40 shrink-0">{icon}</span>}
        <p className="text-sm font-medium text-foreground/80 break-words leading-snug">{value}</p>
      </div>
    </div>
  );
}
