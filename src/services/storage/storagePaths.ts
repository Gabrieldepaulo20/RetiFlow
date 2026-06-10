const MONTH_SEGMENTS_PT_BR = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

function removeDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function slugifyStorageSegment(value: string | null | undefined, fallback = 'tenant') {
  const slug = removeDiacritics(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || fallback;
}

export function getStorageDateParts(input: Date | string | number = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    year: String(safeDate.getFullYear()),
    month: MONTH_SEGMENTS_PT_BR[safeDate.getMonth()],
    day: String(safeDate.getDate()).padStart(2, '0'),
  };
}

export function sanitizeStorageFilename(filename: string, fallback = 'arquivo') {
  const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : '';
  const basename = removeDiacritics(filename)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;

  return `${basename}${extension.toLowerCase()}`;
}

export function buildNotePdfStoragePath(params: {
  tenantName: string | null | undefined;
  osNumero: string;
  date?: Date | string | number;
}) {
  const tenant = slugifyStorageSegment(params.tenantName);
  const { year, month, day } = getStorageDateParts(params.date);
  const osToken = params.osNumero.replace(/^OS-/i, '').replace(/[^\dA-Za-z-]/g, '') || params.osNumero;

  return `${tenant}/${year}/${month}/${day}/OS-${osToken}.pdf`;
}

export function buildPayableAttachmentStoragePath(params: {
  tenantName: string | null | undefined;
  contaPagarId: string;
  filename: string;
  date?: Date | string | number;
  timestamp?: number;
}) {
  const tenant = slugifyStorageSegment(params.tenantName);
  const { year, month, day } = getStorageDateParts(params.date);
  const safeName = sanitizeStorageFilename(params.filename, 'anexo');
  const timestamp = params.timestamp ?? Date.now();

  return `${tenant}/${year}/${month}/${day}/${params.contaPagarId}/${timestamp}-${safeName}`;
}
