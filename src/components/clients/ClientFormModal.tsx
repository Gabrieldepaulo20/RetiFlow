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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />

        {/* Panel */}
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={[
            // position
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            // sizing
            'h-[100dvh] w-[calc(100vw-1rem)]',
            'sm:h-auto sm:max-h-[92vh] sm:w-[min(760px,calc(100vw-2rem))] sm:rounded-[28px]',
            // layout
            'flex flex-col overflow-hidden',
            // appearance
            'bg-card border border-white/10 shadow-2xl shadow-slate-950/30',
            // animation — fade + zoom only, sem slide
            'duration-150',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          ].join(' ')}
        >
          <div className="h-1 shrink-0 bg-gradient-to-r from-primary/55 via-primary to-accent/70" />

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-gradient-to-br from-primary/[0.09] via-background to-background px-5 pt-5 pb-4 shrink-0 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <DialogPrimitive.Title className="font-display text-lg font-bold tracking-tight text-foreground leading-snug sm:text-xl">
                  {editingClient ? `Editar — ${editingClient.name}` : 'Novo cliente'}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="max-w-[48rem] text-sm text-muted-foreground leading-snug">
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
