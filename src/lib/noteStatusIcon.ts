import {
  Ban,
  CheckCheck,
  CircleDot,
  ClipboardCheck,
  Inbox,
  PackageCheck,
  Search,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { NoteStatus } from '@/types';

/**
 * Ícone por status da O.S. Usado junto do rótulo + cor para que o status
 * nunca dependa só de cor (acessibilidade) e seja fácil de ler à distância.
 */
const NOTE_STATUS_ICONS: Record<NoteStatus, LucideIcon> = {
  ABERTO: Inbox,
  EM_ANALISE: Search,
  ORCAMENTO: ClipboardCheck,
  APROVADO: ThumbsUp,
  EM_EXECUCAO: Wrench,
  AGUARDANDO_COMPRA: ShoppingCart,
  PRONTO: PackageCheck,
  ENTREGUE: Truck,
  FINALIZADO: CheckCheck,
  CANCELADO: Ban,
  DESCARTADO: ThumbsDown,
  SEM_CONSERTO: ThumbsDown,
};

export function getNoteStatusIcon(status: NoteStatus): LucideIcon {
  return NOTE_STATUS_ICONS[status] ?? CircleDot;
}
