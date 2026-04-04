import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import NoteFormCore from './NoteFormCore';
import { IntakeNote } from '@/types';

interface NoteFormModalProps {
  open: boolean;
  onClose: () => void;
  preClientId?: string;
  preParentId?: string;
  editingNote?: IntakeNote;
}

export default function NoteFormModal({
  open,
  onClose,
  preClientId,
  preParentId,
  editingNote,
}: NoteFormModalProps) {
  const handleSuccess = (_note: IntakeNote) => {
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
          <DialogTitle className="font-display text-lg font-bold tracking-tight">
            {isEditing ? `Editando ${editingNote.number}` : 'Nova Ordem de Serviço'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isEditing
              ? 'Altere os dados abaixo e salve para atualizar a O.S.'
              : 'Preencha os dados abaixo para registrar a O.S.'}
          </DialogDescription>
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
