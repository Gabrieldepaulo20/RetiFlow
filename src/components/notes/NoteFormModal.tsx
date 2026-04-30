import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
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
        className="max-w-3xl p-0 gap-0 overflow-hidden flex flex-col max-h-[92vh] [&>button:last-child]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-display text-lg font-bold tracking-tight">
                {isEditing ? `Editando ${editingNote.number}` : 'Nova Ordem de Serviço'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                {isEditing
                  ? 'Altere os dados abaixo e salve para atualizar a O.S.'
                  : 'Preencha os dados abaixo para registrar a O.S.'}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0 rounded-lg w-8 h-8 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
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
