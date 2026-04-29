export function extractFirstMoneyValue(text: string) {
  const match = text.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
}

export function extractFirstBrazilianDate(text: string) {
  const match = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

export function buildEmailSuggestionTitle(subject: string, senderName: string) {
  const cleanSubject = subject.replace(/\s+/g, ' ').trim();
  if (cleanSubject) return cleanSubject.slice(0, 120);
  return `Conta de ${senderName || 'fornecedor'}`.slice(0, 120);
}
