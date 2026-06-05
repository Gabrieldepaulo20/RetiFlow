import {
  Ban,
  CircleDot,
  ClipboardCheck,
  Inbox,
  PackageCheck,
  Search,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  Trash2,
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
  PRONTA: PackageCheck,
  ENTREGUE: Truck,
  RECUSADO: ThumbsDown,
  SEM_CONSERTO: Ban,
  EXCLUIDA: Trash2,
};

export function getNoteStatusIcon(status: NoteStatus): LucideIcon {
  return NOTE_STATUS_ICONS[status] ?? CircleDot;
}
