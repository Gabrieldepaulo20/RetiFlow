import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  NOTE_STATUS_ORDER,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  STATUS_CUSTOMER_LABELS,
  NoteStatus,
} from '@/types';
import { getNoteStatusIcon } from '@/lib/noteStatusIcon';
import { submitSupportTicket } from '@/api/supabase/support';
import { useToast } from '@/hooks/use-toast';
import { MessageSquarePlus, MessageCircle } from 'lucide-react';

/** Todos os status visíveis no glossário (fluxo + EXCLUIDA administrativa). */
const GLOSSARY_STATUSES: NoteStatus[] = [...NOTE_STATUS_ORDER, 'EXCLUIDA'];

export default function StatusGlossarySection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      await submitSupportTicket(`[Sugestão de status] ${text}`);
      toast({ title: 'Sugestão enviada', description: 'Abrimos um chamado com sua sugestão de status.' });
      setMessage('');
      setOpen(false);
    } catch {
      toast({ title: 'Não foi possível enviar', description: 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Status & Fluxo das O.S.</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            O que cada status significa e o que o cliente vê. Está faltando algum? Sugira pelo chamado.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              <MessageSquarePlus className="h-4 w-4" /> Sugerir status
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sugerir um novo status</DialogTitle>
              <DialogDescription>
                Descreva o status que falta e quando ele acontece. Abrimos um chamado para o time avaliar.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex.: precisamos de um status 'Aguardando aprovação do seguro' entre Orçamento e Aprovado."
              rows={4}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={sending || !message.trim()}>
                {sending ? 'Enviando...' : 'Enviar sugestão'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {GLOSSARY_STATUSES.map((status) => {
          const Icon = getNoteStatusIcon(status);
          const customer = STATUS_CUSTOMER_LABELS[status];
          return (
            <div
              key={status}
              className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-[160px] items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                  <Icon className="h-4 w-4 text-foreground/70" />
                </span>
                <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
              </div>
              <p className="flex-1 text-sm text-muted-foreground">{STATUS_DESCRIPTIONS[status]}</p>
              {customer && (
                <div className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 py-1 text-xs text-primary">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="font-medium">{customer}</span>
                </div>
              )}
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">
          O texto da coluna azul é o que o cliente vê (base do futuro chatbot de acompanhamento).
        </p>
      </CardContent>
    </Card>
  );
}
