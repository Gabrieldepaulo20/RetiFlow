import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, MapPin, Phone, PlusCircle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { Client } from '@/types';

export default function Clients() {
  const { clients, notes, updateClient } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (filterStatus === 'active' && !c.isActive) return false;
      if (filterStatus === 'inactive' && c.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.docNumber.includes(q) || c.city.toLowerCase().includes(q);
      }
      return true;
    });
  }, [clients, search, filterStatus]);

  const lastNote = (clientId: string) => {
    const cn = notes.filter(n => n.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return cn[0]?.number;
  };

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm">{clients.length} cadastrados</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" onClick={() => toast({ title: 'Exportação (mock)', description: 'Arquivo CSV gerado com sucesso.' })}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button onClick={() => setNewClientOpen(true)}><PlusCircle className="w-4 h-4 mr-2" /> Novo Cliente</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, documento, cidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 xl:hidden">
            {filtered.map((client) => (
              <Card key={client.id} className="border border-border/60 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{client.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {client.docType}: {client.docNumber}
                      </p>
                    </div>
                    <Badge variant={client.isActive ? 'default' : 'secondary'}>
                      {client.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span className="truncate">{client.phone || 'Telefone nao informado'}</span>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{buildCustomerAddressLabel(client)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Ultima nota:</span>
                    <span className="font-medium text-primary">{lastNote(client.id) || '—'}</span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button size="sm" variant="outline" onClick={() => setSelectedClientId(client.id)}>
                      Ver cliente
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        updateClient(client.id, { isActive: !client.isActive });
                        toast({ title: client.isActive ? 'Cliente desativado' : 'Cliente ativado' });
                      }}
                    >
                      {client.isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </div>
            )}
          </div>

          <div className="hidden xl:block overflow-hidden rounded-lg border border-border/60">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">Nome</TableHead>
                  <TableHead className="w-[16%]">CPF/CNPJ</TableHead>
                  <TableHead className="w-[16%]">Telefone</TableHead>
                  <TableHead className="w-[18%]">Cidade/UF</TableHead>
                  <TableHead className="w-[12%]">Última Nota</TableHead>
                  <TableHead className="w-[12%]">Status</TableHead>
                  <TableHead className="text-right w-[170px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium truncate">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate">{c.docNumber}</TableCell>
                    <TableCell className="text-sm truncate">{c.phone}</TableCell>
                    <TableCell className="text-sm truncate">{c.city}/{c.state}</TableCell>
                    <TableCell className="text-sm text-primary truncate">{lastNote(c.id) || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? 'default' : 'secondary'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedClientId(c.id)}>Ver</Button>
                        <Button size="sm" variant="ghost" onClick={() => { updateClient(c.id, { isActive: !c.isActive }); toast({ title: c.isActive ? 'Cliente desativado' : 'Cliente ativado' }); }}>
                          {c.isActive ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ClientDetailModal
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
      />

      <ClientFormModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSuccess={(client: Client) => navigate(`/clientes/${client.id}`)}
      />
    </div>
  );
}
