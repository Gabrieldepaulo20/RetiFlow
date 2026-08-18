/**
 * Vocabulário visual dos status da O.S. na paleta `os-*` (ver tailwind.config.ts).
 *
 * Três tons cobrem os 11 status: ACTIVE (fluxo em andamento, laranja), DONE
 * (entregue, teal) e DANGER (recusada/sem conserto/excluída, vermelho). Isso
 * mantém o stepper legível sem pintar cada etapa de uma cor diferente.
 */

import {
  Ban,
  CheckCheck,
  ClipboardList,
  FolderOpen,
  Hammer,
  ScanSearch,
  ShoppingCart,
  ThumbsUp,
  Trash2,
  Truck,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NoteStatus } from '@/types';

export const OS_STATUS_ICON: Record<NoteStatus, LucideIcon> = {
  ABERTO: FolderOpen,
  EM_ANALISE: ScanSearch,
  ORCAMENTO: ClipboardList,
  APROVADO: ThumbsUp,
  EM_EXECUCAO: Wrench,
  AGUARDANDO_COMPRA: ShoppingCart,
  PRONTA: CheckCheck,
  ENTREGUE: Truck,
  RECUSADO: XCircle,
  SEM_CONSERTO: Hammer,
  EXCLUIDA: Trash2,
};

export function osStatusIcon(status: NoteStatus): LucideIcon {
  return OS_STATUS_ICON[status] ?? Ban;
}

export type OSStatusTone = 'ACTIVE' | 'DONE' | 'DANGER';

export function osStatusTone(status: NoteStatus): OSStatusTone {
  if (status === 'ENTREGUE') return 'DONE';
  if (status === 'RECUSADO' || status === 'SEM_CONSERTO' || status === 'EXCLUIDA') return 'DANGER';
  return 'ACTIVE';
}

/** Pílula de status sobre o cabeçalho escuro. */
export const OS_STATUS_PILL_ON_INK: Record<OSStatusTone, string> = {
  ACTIVE: 'bg-os-accent/[0.16] border-os-accent-glow/45 text-os-accent-glow-2',
  DONE: 'bg-os-done/25 border-os-done/60 text-os-done-soft',
  DANGER: 'bg-os-danger/25 border-os-danger/60 text-os-danger-soft',
};

/** Pílula de status sobre fundo claro (página, listas dentro do corpo). */
export const OS_STATUS_PILL_ON_PANEL: Record<OSStatusTone, string> = {
  ACTIVE: 'bg-os-accent-soft border-os-accent/30 text-os-accent-ink',
  DONE: 'bg-os-done-soft border-os-done/30 text-os-done-ink',
  DANGER: 'bg-os-danger-soft border-os-danger-line text-os-danger-ink',
};
