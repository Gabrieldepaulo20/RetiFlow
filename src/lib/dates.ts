/**
 * Formatação defensiva de datas vindas do banco/RPC/localStorage.
 * Timestamps corrompidos ou em formato inesperado viram null em vez de
 * renderizar "Invalid Date" na tela.
 */

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `DD/MM/AAAA` em pt-BR, ou null se o valor não for uma data válida. */
export function formatDateBR(value: string | null | undefined): string | null {
  return parseDateSafe(value)?.toLocaleDateString('pt-BR') ?? null;
}

/** Data+hora curta em pt-BR (`DD/MM HH:mm`), ou null se inválida. */
export function formatDateTimeShortBR(value: string | null | undefined): string | null {
  return (
    parseDateSafe(value)?.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? null
  );
}
