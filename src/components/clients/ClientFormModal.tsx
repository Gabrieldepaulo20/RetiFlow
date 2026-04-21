import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Building2, X } from 'lucide-react';
import { ClientFormCore } from './ClientFormCore';
import type { Client } from '@/types';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (client: Client) => void;
  editingClient?: Client;
}

/**
 * Modal de cadastro/edição de cliente.
 * Usa DialogPrimitive diretamente para controle total:
 * header fixo → body scroll → footer fixo.
 */
export function ClientFormModal({ open, onClose, onSuccess, editingClient }: ClientFormModalProps) {
  const handleSuccess = (client: Client) => {
    onSuccess?.(client);
    onClose();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />

        {/* Panel */}
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={[
            // position
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            // sizing
            'w-full h-[100dvh]',
            'sm:h-auto sm:max-h-[92vh] sm:w-[680px] sm:rounded-2xl',
            // layout
            'flex flex-col overflow-hidden',
            // appearance
            'bg-background border border-border/70 shadow-2xl shadow-black/20',
            // animation — fade + zoom only, sem slide
            'duration-150',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          ].join(' ')}
        >
          <div className="h-1 shrink-0 bg-primary" />

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-muted/35 px-6 pt-5 pb-4 shrink-0">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15">
                <Building2 className="h-[18px] w-[18px]" />
              </div>
              <div className="space-y-1 min-w-0">
                <DialogPrimitive.Title className="font-display text-lg font-bold tracking-tight text-foreground leading-snug">
                  {editingClient ? `Editar — ${editingClient.name}` : 'Novo cliente'}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-foreground/72 leading-snug">
                  {editingClient
                    ? 'Altere os dados abaixo e salve para atualizar o cadastro.'
                    : <>Preencha os dados abaixo. Campos com <span className="font-semibold text-destructive">*</span> são obrigatórios.</>
                  }
                </DialogPrimitive.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Form ── */}
          <ClientFormCore isModal onSuccess={handleSuccess} onCancel={onClose} editingClient={editingClient} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
