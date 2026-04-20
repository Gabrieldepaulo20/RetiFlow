import PayableModalShell from '@/components/payables/PayableModalShell';
import PayableQuickForm from '@/components/payables/PayableQuickForm';
import { AccountPayable, PayableEntrySource } from '@/types';

type PayableCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (payable: AccountPayable) => void;
  entrySource?: PayableEntrySource;
};

export default function PayableCreateModal({
  open,
  onOpenChange,
  onSaved,
  entrySource = 'MANUAL',
}: PayableCreateModalProps) {
  return (
    <PayableModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Nova conta a pagar"
      description="Cadastro rápido, com os campos realmente úteis para a operação financeira do dia a dia."
      desktopClassName="sm:max-w-5xl"
    >
      <PayableQuickForm
        entrySource={entrySource}
        onCancel={() => onOpenChange(false)}
        onSaved={(payable) => {
          onSaved?.(payable);
          onOpenChange(false);
        }}
      />
    </PayableModalShell>
  );
}
