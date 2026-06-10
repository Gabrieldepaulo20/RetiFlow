import { useParams, useNavigate } from 'react-router-dom';
import { useOperationalData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_LABELS, STATUS_COLORS } from '@/types';
import { ArrowLeft, Phone, Mail, MapPin } from 'lucide-react';
import { buildCustomerAddressLabel } from '@/services/domain/customers';

export default function ClientDetail() {
  const { id } = useParams();
  const { getClient, notes, attachments } = useOperationalData();
  const navigate = useNavigate();
  const client = getClient(id!);

  if (!client) return <div className="text-center py-20 text-muted-foreground">Cliente não encontrado.</div>;

  const clientNotes = notes.filter(n => n.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clientAtts = attachments.filter(a => a.clientId === client.id || clientNotes.some(n => n.id === a.noteId));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <h1 className="break-words text-xl font-display font-bold sm:text-2xl">{client.name}</h1>
          <Badge variant={client.isActive ? 'default' : 'secondary'}>{client.isActive ? 'Ativo' : 'Inativo'}</Badge>
        </div>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto"><TabsTrigger value="resumo">Resumo</TabsTrigger><TabsTrigger value="notas">Histórico ({clientNotes.length})</TabsTrigger><TabsTrigger value="anexos">Anexos ({clientAtts.length})</TabsTrigger></TabsList>
        <TabsContent value="resumo">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><p className="text-sm text-muted-foreground">Documento</p><p className="break-words font-medium">{client.docType}: {client.docNumber}</p></div>
              <div className="flex min-w-0 items-center gap-2"><Phone className="w-4 h-4 shrink-0 text-muted-foreground" /><p className="min-w-0 break-words">{client.phone}</p></div>
              <div className="flex min-w-0 items-center gap-2"><Mail className="w-4 h-4 shrink-0 text-muted-foreground" /><p className="min-w-0 break-all">{client.email}</p></div>
              <div className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 w-4 h-4 shrink-0 text-muted-foreground" /><p className="min-w-0 break-words">{buildCustomerAddressLabel(client)}</p></div>
              {client.notes && <div className="col-span-full"><p className="text-sm text-muted-foreground">Observações</p><p>{client.notes}</p></div>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notas">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 md:hidden">
                {clientNotes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm"
                    onClick={() => navigate(`/notas-entrada/${n.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-bold text-primary">{n.number}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <Badge className={STATUS_COLORS[n.status]}>{STATUS_LABELS[n.status]}</Badge>
                    </div>
                    <p className="mt-3 text-right text-base font-semibold">R$ {n.totalAmount.toLocaleString('pt-BR')}</p>
                  </button>
                ))}
                {clientNotes.length === 0 && <p className="text-center py-8 text-muted-foreground">Nenhuma nota encontrada.</p>}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {clientNotes.map(n => (
                    <TableRow key={n.id} className="cursor-pointer" onClick={() => navigate(`/notas-entrada/${n.id}`)}>
                      <TableCell className="font-medium text-primary">{n.number}</TableCell>
                      <TableCell>{new Date(n.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[n.status]}>{STATUS_LABELS[n.status]}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">R$ {n.totalAmount.toLocaleString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                  {clientNotes.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma nota encontrada.</TableCell></TableRow>}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="anexos">
          <Card>
            <CardContent className="p-6">
              {clientAtts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nenhum anexo.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {clientAtts.map(a => (
                    <div key={a.id} className="border rounded-lg p-3 text-center">
                      <div className="w-10 h-10 bg-muted rounded mx-auto mb-2 flex items-center justify-center text-xs font-bold text-muted-foreground">{a.type}</div>
                      <p className="text-xs truncate">{a.filename}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
