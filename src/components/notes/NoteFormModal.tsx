import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ClipboardList, Pencil } from 'lucide-react';
import NoteFormCore from './NoteFormCore';
import { IntakeNote } from '@/types';

interface NoteFormModalProps {
  open: boolean;
  onClose: () => void;
  preClientId?: string;
  preParentId?: string;
  editingNote?: IntakeNote;
  onSuccess?: (note: IntakeNote) => void;
}

export default function NoteFormModal({
  open,
  onClose,
  preClientId,
  preParentId,
  editingNote,
  onSuccess,
}: NoteFormModalProps) {
  const handleSuccess = (note: IntakeNote) => {
    onSuccess?.(note);
    onClose();
  };

  const isEditing = !!editingNote;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 sm:h-[min(820px,calc(100dvh-2rem))] sm:w-[calc(100vw-2rem)] [&>button:last-child]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-border/40 px-4 pb-3 pt-4 sm:px-5 min-[900px]:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {isEditing ? <Pencil className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
              </span>
              <div>
                <DialogTitle className="font-display text-lg font-bold tracking-tight">
                  {isEditing ? `Editando ${editingNote.number}` : 'Nova Ordem de Serviço'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                  {isEditing
                    ? 'Altere os dados abaixo e salve para atualizar a O.S.'
                    : 'Preencha os dados abaixo para registrar a O.S.'}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <NoteFormCore
          isModal
          editingNote={editingNote}
          preClientId={preClientId}
          preParentId={preParentId}
          onSuccess={handleSuccess}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
