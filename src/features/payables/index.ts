/**
 * Porta pública do módulo Payables.
 *
 * Todos os imports externos a este módulo devem usar '@/features/payables'
 * em vez de caminhos diretos para pages/ContasAPagar ou components/payables/*.
 * Isso permite mover a implementação interna sem quebrar consumers.
 *
 * Migração interna planejada (não executada ainda):
 *   src/features/payables/
 *     pages/ContasAPagar.tsx       ← de src/pages/ContasAPagar.tsx
 *     components/                  ← de src/components/payables/
 *     hooks/usePayables.ts         ← novo: TanStack Query + API real
 *     api/payables.api.ts          ← novo: endpoints de backend
 *     domain/                      ← de src/services/domain/payables.ts
 *     types.ts                     ← tipos específicos do módulo
 */

// Página principal
export { default as ContasAPagar } from '@/pages/ContasAPagar';

// Componentes
export { default as PayableCreateModal } from '@/components/payables/PayableCreateModal';
export { default as PayableDetailsModal } from '@/components/payables/PayableDetailsModal';
export { default as PayableImportModal } from '@/components/payables/PayableImportModal';
export { default as PayableEmailSuggestions } from '@/components/payables/PayableEmailSuggestions';
export { default as PayableModalShell } from '@/components/payables/PayableModalShell';
export { default as PayableQuickForm } from '@/components/payables/PayableQuickForm';

// Lógica de domínio
export * from '@/services/domain/payables';

// Tipos relevantes
export type {
  AccountPayable,
  PayableCategory,
  PayableSupplier,
  PayableAttachment,
  PayableHistory,
  PayableStatus,
  PayableDisplayStatus,
  PaymentMethod,
  RecurrenceType,
  EmailSuggestion,
} from '@/types';
