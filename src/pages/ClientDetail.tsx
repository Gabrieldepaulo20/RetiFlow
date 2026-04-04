import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
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
  const { getClient, notes, attachments } = useData();
  const navigate = useNavigate();
  const client = getClient(id!);

  if (!client) return <div className="text-center py-20 text-muted-foreground">Cliente não encontrado.</div>;

  const clientNotes = notes.filter(n => n.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clientAtts = attachments.filter(a => a.clientId === client.id || clientNotes.some(n => n.id === a.noteId));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold">{client.name}</h1>
          <Badge variant={client.isActive ? 'default' : 'secondary'}>{client.isActive ? 'Ativo' : 'Inativo'}</Badge>
        </div>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList><TabsTrigger value="resumo">Resumo</TabsTrigger><TabsTrigger value="notas">Histórico ({clientNotes.length})</TabsTrigger><TabsTrigger value="anexos">Anexos ({clientAtts.length})</TabsTrigger></TabsList>
        <TabsContent value="resumo">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><p className="text-sm text-muted-foreground">Documento</p><p className="font-medium">{client.docType}: {client.docNumber}</p></div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><p>{client.phone}</p></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><p>{client.email}</p></div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><p>{buildCustomerAddressLabel(client)}</p></div>
              {client.notes && <div className="col-span-full"><p className="text-sm text-muted-foreground">Observações</p><p>{client.notes}</p></div>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notas">
          <Card>
            <CardContent className="p-4">
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
