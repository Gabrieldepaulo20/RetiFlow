const MAX_ATTACHMENT_DISPLAY_NAME = 140;

function getExtension(filename: string) {
  const match = filename.trim().match(/\.([a-z0-9]{1,12})$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function sanitizeNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

export function normalizeAttachmentDisplayName(value: string, fallback = 'anexo') {
  const normalized = sanitizeNamePart(value).slice(0, MAX_ATTACHMENT_DISPLAY_NAME).trim();
  return normalized || fallback;
}

export function buildImportedPayableAttachmentName(params: {
  title: string;
  supplierName?: string | null;
  dueDate?: string | null;
  originalFilename: string;
}) {
  const extension = getExtension(params.originalFilename);
  const datePart = params.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(params.dueDate)
    ? params.dueDate
    : null;
  const supplierPart = sanitizeNamePart(params.supplierName ?? '');
  const titlePart = sanitizeNamePart(params.title);

  const base = [datePart, supplierPart, titlePart]
    .filter(Boolean)
    .join(' - ')
    .slice(0, MAX_ATTACHMENT_DISPLAY_NAME - extension.length)
    .trim();

  return normalizeAttachmentDisplayName(`${base || 'conta-importada'}${extension}`);
}
