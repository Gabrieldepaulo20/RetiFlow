import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Percent } from 'lucide-react';
import { getAllFechamentos } from '@/api/supabase/fechamentos';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FinancialValue } from '@/components/privacy/FinancialValue';

interface NoteClosingReferenceProps {
  noteId: string;
  closingId: string | null | undefined;
  clientId: string;
  onBeforeNavigate?: () => void;
  compact?: boolean;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function NoteClosingReference({
  noteId,
  closingId,
  clientId,
  onBeforeNavigate,
  compact = false,
}: NoteClosingReferenceProps) {
  const navigate = useNavigate();
  const { canAccessModule } = useAuth();
  const canOpenClosing = canAccessModule('closing');

  const { data: closing } = useQuery({
    queryKey: ['note-closing-reference', clientId, closingId],
    queryFn: async () => {
      const rows = await getAllFechamentos({ p_fk_clientes: clientId });
      return rows.find((item) => item.id_fechamentos === closingId) ?? null;
    },
    enabled: Boolean(closingId && clientId && canOpenClosing),
    staleTime: 60_000,
  });

  const itemDiscount = useMemo(() => {
    const note = closing?.dados_json?.notas.find((item) => item.id === noteId);
    if (!note) return 0;
    return roundMoney(note.itens.reduce((sum, item) => {
      const gross = Math.max(0, item.quantidade) * Math.max(0, item.preco_unitario);
      return sum + Math.max(0, gross - Math.max(0, item.subtotal));
    }, 0));
  }, [closing, noteId]);

  if (!closingId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {itemDiscount > 0.004 ? (
        <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          <Percent className="h-3 w-3" />
          Desconto no fechamento: <FinancialValue>R$ {itemDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</FinancialValue>
        </Badge>
      ) : null}
      {canOpenClosing ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={compact ? 'h-9 flex-1 gap-1.5 text-xs' : 'gap-1.5'}
          onClick={() => {
            onBeforeNavigate?.();
            navigate(`/fechamento?fechamento=${encodeURIComponent(closingId)}`);
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir fechamento
        </Button>
      ) : (
        <Badge variant="outline">Fechamento vinculado</Badge>
      )}
    </div>
  );
}
