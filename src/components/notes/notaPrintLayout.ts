import { normalizeWhitespace, toTitleCasePtBr } from '@/services/domain/textNormalization';

export const NOTA_PRINT_MAX_ROWS = 7;
export const NOTA_PRINT_LONG_MAX_ROWS = 12;

export const NOTA_PRINT_PAGE = {
  width: 1122,
  height: 793,
  minScale: 0.3,
  viewportPadding: 16,
} as const;

export const NOTA_PRINT_PORTRAIT_PAGE = {
  width: 793,
  height: 1122,
  minScale: 0.28,
  viewportPadding: 16,
} as const;

export const NOTA_PRINT_OBSERVATIONS = [
  '1. O prazo de entrega poderá ser alterado caso seja necessário serviço adicional não previsto.',
  '2. Peças substituídas ficam à disposição do cliente por até 30 dias após a retirada.',
  '3. Garantia de 6 meses para os serviços executados conforme contrato.',
];

const LEADING_CUSTOMER_TITLES = new Set([
  'dr',
  'dra',
  'senhor',
  'senhora',
  'sr',
  'sra',
]);

const CUSTOMER_NAME_CONNECTORS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const CUSTOMER_NAME_SEPARATORS = new Set(['-', '&', '+', '/']);

function normalizeNameToken(token: string) {
  return token.replace(/[.]/g, '').toLocaleLowerCase('pt-BR');
}

export function formatNotaClientPrintName(value: string | null | undefined) {
  const formatted = toTitleCasePtBr(value);
  if (!formatted) return '';

  const tokens = normalizeWhitespace(formatted).split(' ').filter(Boolean);
  const withoutTitle = tokens.filter((token, index) => {
    if (index > 1) return true;
    return !LEADING_CUSTOMER_TITLES.has(normalizeNameToken(token));
  });

  const usefulTokenIndexes = withoutTitle
    .map((token, index) => ({ token, index, key: normalizeNameToken(token) }))
    .filter(({ key }) => !CUSTOMER_NAME_CONNECTORS.has(key) && !CUSTOMER_NAME_SEPARATORS.has(key))
    .slice(0, 2);

  const printTokens = usefulTokenIndexes.length > 0
    ? usefulTokenIndexes.flatMap(({ token, index }, selectedIndex) => {
        const previous = usefulTokenIndexes[selectedIndex - 1];
        if (!previous) return [token];

        const separatorsBetween = withoutTitle
          .slice(previous.index + 1, index)
          .filter((candidate) => CUSTOMER_NAME_SEPARATORS.has(normalizeNameToken(candidate)));
        return [...separatorsBetween, token];
      })
    : [];

  if (printTokens.length > 0) {
    return printTokens.join(' ');
  }

  return withoutTitle.slice(0, 2).join(' ') || formatted;
}
