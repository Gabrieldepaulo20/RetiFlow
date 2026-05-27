import type { NotaServicoDetalhesItem } from '@/api/supabase/notas';

function normalizeComparableText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function getNotaItemDetailLines(
  item: Pick<NotaServicoDetalhesItem, 'descricao' | 'detalhes'>,
) {
  const details = item.detalhes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) ?? [];

  if (details.length === 0) return [];

  const [firstLine, ...rest] = details;
  if (normalizeComparableText(firstLine) === normalizeComparableText(item.descricao)) {
    return rest;
  }

  return details;
}
