type CsvValue = string | number | boolean | null | undefined | Date;

export type CsvRow = Record<string, CsvValue>;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function normalizeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function escapeCsvField(value: CsvValue): string {
  const normalized = normalizeCsvValue(value);
  const formulaSafe = FORMULA_PREFIX.test(normalized) ? `'${normalized}` : normalized;
  const escaped = formulaSafe.replace(/"/g, '""');

  return /[",\n\r;]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function toCsv(rows: CsvRow[], columns = rows[0] ? Object.keys(rows[0]) : []): string {
  const header = columns.map(escapeCsvField).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsvField(row[column])).join(','));

  return [header, ...body].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
