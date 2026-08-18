/**
 * Faixas de exceção da O.S.: final alternativo, pausa por compra vinculada e
 * vínculo com a nota pai. Substituem o bloco "OS cancelada" do design, que no
 * RetiFlow se desdobra em Recusada / Sem Conserto / Excluída.
 */

import { AlertCircle, Link2 } from 'lucide-react';
import { STATUS_LABELS, type IntakeNote, type NoteStatus } from '@/types';
import { cn } from '@/lib/utils';
import { osStatusIcon } from './osStatusVisuals';
import { formatOSDate } from './osViewModel';

/** Motivo de cada final alternativo — texto do glossário, não inventado por tela. */
const ALT_FINAL_REASON: Partial<Record<NoteStatus, string>> = {
  RECUSADO: 'O cliente não aprovou o orçamento; fatura-se o banho químico.',
  SEM_CONSERTO: 'Peça sem conserto viável; fatura-se o diagnóstico.',
  EXCLUIDA: 'Nota anulada por engano ou duplicata.',
};

interface OSAltFinalBannerProps {
  note: IntakeNote;
}

/** Faixa vermelha no topo do corpo quando a O.S. saiu do fluxo principal. */
export function OSAltFinalBanner({ note }: OSAltFinalBannerProps) {
  const reason = ALT_FINAL_REASON[note.status];
  if (!reason) return null;

  const Icon = osStatusIcon(note.status);
  const closedAt = note.finalizedAt ?? note.updatedAt;

  return (
    <div className="flex flex-none flex-wrap items-center gap-3 border-b border-os-danger-line bg-os-danger-soft px-4 py-3.5 sm:gap-3.5 sm:px-8">
      <span className="inline-flex items-center gap-2.5 rounded-lg bg-os-danger px-3.5 py-2 text-[13px] font-bold uppercase tracking-[0.06em] text-white">
        <Icon className="h-4 w-4 shrink-0" />
        O.S. {STATUS_LABELS[note.status]}
      </span>
      <span className="text-[13.5px] text-os-danger-ink">
        Encerrada em {formatOSDate(closedAt)} — {reason} O fluxo abaixo está congelado.
      </span>
    </div>
  );
}

interface OSLinkedNotesBannerProps {
  note: IntakeNote;
  parentNote?: IntakeNote | null;
  childNotes: IntakeNote[];
  onOpenNote: (noteId: string) => void;
}

/**
 * Pausa por compra vinculada + vínculo com a nota pai. O clique é delegado:
 * o modal fecha antes de navegar, a página navega direto.
 */
export function OSLinkedNotesBanner({
  note,
  parentNote,
  childNotes,
  onOpenNote,
}: OSLinkedNotesBannerProps) {
  const isAguardando = note.status === 'AGUARDANDO_COMPRA';
  if (!isAguardando && !parentNote) return null;

  return (
    <div className="flex flex-col gap-3">
      {isAguardando ? (
        <div className="flex gap-3 rounded-xl border border-os-warn-line bg-os-warn-soft p-3.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-os-warn-icon" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-os-warn-ink">
              O.S. pausada — aguardando a compra vinculada ser finalizada.
            </p>
            {childNotes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {childNotes.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className={cn(
                      'text-xs font-semibold text-os-warn-icon underline underline-offset-2',
                      'hover:text-os-warn-ink',
                    )}
                    onClick={() => onOpenNote(child.id)}
                  >
                    {child.number} — {STATUS_LABELS[child.status]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {parentNote ? (
        <div className="flex gap-3 rounded-xl border border-os-line bg-os-subtle p-3.5">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-os-accent" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-os-stone">
              Vinculada à O.S. de serviço
            </p>
            <button
              type="button"
              className="mt-0.5 text-xs font-semibold text-os-accent-hover underline underline-offset-2 hover:text-os-accent-ink"
              onClick={() => onOpenNote(parentNote.id)}
            >
              {parentNote.number} — {STATUS_LABELS[parentNote.status]}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
