import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { BadgeCheck, Bot, CheckCircle2, ChevronRight, MailOpen, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { EmailSuggestion } from '@/types';
import { buildPayableHistoryDescription } from '@/services/domain/payables';

function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 90 ? 'bg-success/10 text-success' : value >= 75 ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning-foreground';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone)}><Sparkles className="h-2.5 w-2.5" />{value}% confiança</span>;
}

type SuggestionCardProps = {
  suggestion: EmailSuggestion;
  categoryName: string;
  onAccept: () => void;
  onDismiss: () => void;
};

function SuggestionCard({ suggestion, categoryName, onAccept, onDismiss }: SuggestionCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
    >
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-start gap-4 p-4">
            <div className="mt-0.5 shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
              <MailOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{suggestion.subject}</p>
                <ConfidenceBadge value={suggestion.confidence} />
              </div>
              <p className="text-xs text-muted-foreground">
                {suggestion.senderName} &middot; {format(parseISO(suggestion.receivedAt), "d 'de' MMM", { locale: ptBR })}
              </p>
              {suggestion.emailSnippet ? (
                <p className="mt-2 line-clamp-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground italic">
                  &ldquo;{suggestion.emailSnippet}&rdquo;
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span><span className="text-muted-foreground">Valor: </span><span className="font-semibold">{fmtBRL(suggestion.suggestedAmount)}</span></span>
              <span><span className="text-muted-foreground">Vence: </span><span className="font-semibold">{format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}</span></span>
              <span><span className="text-muted-foreground">Categoria: </span><span className="font-semibold">{categoryName}</span></span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground hover:text-destructive" onClick={onDismiss}>
                <X className="h-3.5 w-3.5" />Ignorar
              </Button>
              <Button size="sm" className="h-7 gap-1" onClick={onAccept}>
                <CheckCircle2 className="h-3.5 w-3.5" />Usar como conta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

type PayableEmailSuggestionsProps = {
  onCreated?: (payableId: string) => void;
};

export default function PayableEmailSuggestions({ onCreated }: PayableEmailSuggestionsProps) {
  const { emailSuggestions, acceptEmailSuggestion, dismissEmailSuggestion, payableCategories, addPayableHistoryEntry } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  const categoryById = useMemo(() => new Map(payableCategories.map((c) => [c.id, c])), [payableCategories]);
  const pending = useMemo(() => emailSuggestions.filter((s) => s.status === 'PENDING'), [emailSuggestions]);
  const dismissed = useMemo(() => emailSuggestions.filter((s) => s.status === 'DISMISSED'), [emailSuggestions]);
  const accepted = useMemo(() => emailSuggestions.filter((s) => s.status === 'ACCEPTED'), [emailSuggestions]);

  function handleAccept(suggestion: EmailSuggestion) {
    const payable = acceptEmailSuggestion(suggestion.id);
    if (!payable) return;
    addPayableHistoryEntry(buildPayableHistoryDescription({
      payableId: payable.id,
      action: 'CREATED',
      userId: user?.id ?? 'user-2',
    }));
    toast({ title: 'Conta criada a partir do e-mail', description: `"${payable.title}" já está na listagem.` });
    onCreated?.(payable.id);
  }

  function handleDismiss(suggestion: EmailSuggestion) {
    dismissEmailSuggestion(suggestion.id);
    toast({ title: 'Sugestão ignorada', description: 'Você pode encontrá-la no histórico se precisar.' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sugestões extraídas do e-mail</p>
            <p className="text-xs text-muted-foreground">Contas detectadas automaticamente na caixa de entrada — escolha o que usar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {accepted.length > 0 ? <span className="flex items-center gap-1 text-success"><BadgeCheck className="h-3.5 w-3.5" />{accepted.length} aceitas</span> : null}
          {dismissed.length > 0 ? <span>{dismissed.length} ignoradas</span> : null}
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <div className="rounded-full bg-muted/60 p-3">
            <MailOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Nenhuma sugestão pendente</p>
            <p className="mt-1 text-xs text-muted-foreground">Quando novas contas forem detectadas nos e-mails, elas aparecerão aqui para você revisar.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">{pending.length} pendente{pending.length !== 1 ? 's' : ''}</Badge>
            <p className="text-xs text-muted-foreground">Revise cada sugestão antes de aceitar</p>
          </div>
          <AnimatePresence mode="popLayout">
            {pending.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                categoryName={categoryById.get(suggestion.suggestedCategoryId)?.name ?? 'Categoria'}
                onAccept={() => handleAccept(suggestion)}
                onDismiss={() => handleDismiss(suggestion)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {dismissed.length > 0 ? (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Ver {dismissed.length} ignorada{dismissed.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-3 space-y-2">
            {dismissed.map((suggestion) => (
              <div key={suggestion.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3 text-sm opacity-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{suggestion.suggestedTitle}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(suggestion.suggestedAmount)} &middot; vence {format(parseISO(suggestion.suggestedDueDate), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
