const LOWERCASE_WORDS = new Set([
  'a',
  'as',
  'à',
  'às',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'para',
  'por',
]);

const PRESERVED_TERMS = new Set([
  'ABC',
  'ABS',
  'AP',
  'BMW',
  'CNPJ',
  'CPF',
  'DOHC',
  'ECU',
  'EPP',
  'FIAT',
  'GM',
  'IE',
  'LTDA',
  'ME',
  'MEI',
  'MWM',
  'RG',
  'S/A',
  'TBI',
  'VW',
]);

export function normalizeWhitespace(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeEmail(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();
}

export function normalizePlate(value: string | null | undefined) {
  return String(value ?? '').replace(/[\s-]/g, '').trim().toUpperCase();
}

export function normalizeDecimalInputDraft(value: string | null | undefined) {
  return String(value ?? '').replace(/[^\d.,]/g, '');
}

export function isValidBrazilianPlate(value: string | null | undefined) {
  const plate = normalizePlate(value);
  return /^[A-Z]{3}\d{4}$/.test(plate) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(plate);
}

function capitalizeToken(token: string) {
  if (!token) return token;

  const upper = token.toUpperCase();
  if (PRESERVED_TERMS.has(upper)) return upper;
  if (/\d/.test(token)) return upper;

  return token.charAt(0).toLocaleUpperCase('pt-BR') + token.slice(1).toLocaleLowerCase('pt-BR');
}

function normalizeHyphenatedWord(word: string) {
  return word
    .split('-')
    .map((part) => capitalizeToken(part))
    .join('-');
}

export function toTitleCasePtBr(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';

  return normalized
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      const upper = word.toUpperCase();

      if (PRESERVED_TERMS.has(upper)) return upper;
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return normalizeHyphenatedWord(word);
    })
    .join(' ');
}

type ParsedNumberResult = {
  value: number | null;
  normalized: string;
  error?: string;
};

export function normalizeMoneyInput(value: string | number | null | undefined): ParsedNumberResult {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value, normalized: String(value) }
      : { value: null, normalized: '', error: 'Informe um valor válido.' };
  }

  const raw = normalizeWhitespace(value);
  if (!raw) return { value: null, normalized: '' };
  if (!/^[\d.,]+$/.test(raw)) {
    return { value: null, normalized: raw, error: 'Use apenas números, ponto ou vírgula.' };
  }

  let normalized = raw;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = raw.split('.');
    if (parts.length > 2) {
      const [first, ...rest] = parts;
      const looksLikeThousands = first.length <= 3 && rest.every((part) => part.length === 3);
      if (!looksLikeThousands) {
        return { value: null, normalized: raw, error: 'Informe um valor válido.' };
      }
      normalized = parts.join('');
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, normalized: raw, error: 'Informe um valor válido.' };
  }

  return { value: parsed, normalized };
}

export function parsePositiveNumber(
  value: string | number | null | undefined,
  options: { allowZero?: boolean; integer?: boolean; fieldLabel?: string } = {},
) {
  const { allowZero = true, integer = false, fieldLabel = 'valor' } = options;
  const result = normalizeMoneyInput(value);

  if (result.error || result.value == null) {
    return { value: null, error: `Informe um ${fieldLabel} válido.` };
  }

  if (integer && !Number.isInteger(result.value)) {
    return { value: null, error: `O ${fieldLabel} deve ser um número inteiro.` };
  }

  if (allowZero ? result.value < 0 : result.value <= 0) {
    return { value: null, error: allowZero ? `O ${fieldLabel} não pode ser negativo.` : `O ${fieldLabel} deve ser maior que zero.` };
  }

  return { value: result.value, error: null };
}

function localDateValue(value: string | null | undefined) {
  const date = normalizeWhitespace(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

export function validateDueDateNotBeforeBaseDate(dueDate: string | null | undefined, baseDate: string | null | undefined) {
  const due = localDateValue(dueDate);
  const base = localDateValue(baseDate);
  if (due == null || base == null) return true;
  return due >= base;
}
