import { useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BILLABLE_STATUSES, IntakeNote, NoteStatus, STATUS_LABELS } from '@/types';
import { getManualNoteStatusTargets, MANUAL_NOTE_WORKFLOW } from '@/services/domain/intakeNotes';

interface NoteStatusMoveControlProps {
  note: IntakeNote;
  canManage: boolean;
  onMove: (status: NoteStatus) => Promise<void>;
  compact?: boolean;
  disabled?: boolean;
}

function getTransitionExplanation(note: IntakeNote, target: NoteStatus): string {
  const messages: string[] = [];
  const currentIndex = MANUAL_NOTE_WORKFLOW.indexOf(note.status);
  const targetIndex = MANUAL_NOTE_WORKFLOW.indexOf(target);

  if (currentIndex >= 0 && targetIndex >= 0 && Math.abs(targetIndex - currentIndex) > 1) {
    messages.push('As etapas intermediárias serão puladas.');
  }
  if (!BILLABLE_STATUSES.has(note.status) && BILLABLE_STATUSES.has(target)) {
    messages.push('A O.S. passará a compor o faturamento. O recebimento continuará separado.');
  }
  if (BILLABLE_STATUSES.has(note.status) && !BILLABLE_STATUSES.has(target)) {
    messages.push('A O.S. deixará de ser faturável até voltar a um estágio final. O pagamento não será alterado.');
  }

  return messages.join(' ') || 'A nova etapa será salva no histórico operacional da O.S.';
}

export default function NoteStatusMoveControl({
  note,
  canManage,
  onMove,
  compact = false,
  disabled = false,
}: NoteStatusMoveControlProps) {
  const [pendingStatus, setPendingStatus] = useState<NoteStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const targets = canManage ? getManualNoteStatusTargets(note) : [];

  if (!canManage) return null;

  if (note.closingId) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="Esta O.S. já entrou em um fechamento e não pode mudar de status."
        className="h-9 gap-1.5 text-xs"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" /> Em fechamento
      </Button>
    );
  }

  if (note.status === 'AGUARDANDO_COMPRA') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="A O.S. será retomada pelo fluxo da compra vinculada."
        className="h-9 gap-1.5 text-xs"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" /> Retoma após compra
      </Button>
    );
  }

  if (targets.length === 0) return null;

  const pendingLabel = pendingStatus ? STATUS_LABELS[pendingStatus] : '';

  const confirmMove = async () => {
    if (!pendingStatus || isSaving) return;
    setIsSaving(true);
    try {
      await onMove(pendingStatus);
      setPendingStatus(null);
    } catch {
      // O DataContext mantém a confirmação aberta, reverte o estado e mostra o erro.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Select
        value=""
        disabled={disabled || isSaving}
        onValueChange={(value) => setPendingStatus(value as NoteStatus)}
      >
        <SelectTrigger
          aria-label={`Mover ${note.number} para outro status`}
          className={compact ? 'h-9 w-[132px] text-xs' : 'h-9 w-[150px] text-xs'}
        >
          <ArrowRightLeft className="mr-1 h-3.5 w-3.5 shrink-0" />
          <SelectValue placeholder="Mover para..." />
        </SelectTrigger>
        <SelectContent>
          {targets.map((status) => (
            <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={pendingStatus !== null} onOpenChange={(open) => !open && !isSaving && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover {note.number} para {pendingLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Status atual: {STATUS_LABELS[note.status]}. {pendingStatus ? getTransitionExplanation(note, pendingStatus) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void confirmMove();
              }}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar mudança
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
