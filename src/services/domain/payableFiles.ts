import type { PayableAttachmentFileType } from '@/types';

const MIME_BY_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

const LOOSE_BROWSER_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-pdf',
]);

function getExtension(filename: string) {
  const cleanName = filename.split(/[?#]/)[0] ?? '';
  return cleanName.includes('.') ? cleanName.split('.').pop()?.toLowerCase() ?? '' : '';
}

export function resolvePayableFileMimeType(file: File | { name: string; type?: string | null }) {
  const explicitType = file.type?.trim().toLowerCase() ?? '';
  if (explicitType && !LOOSE_BROWSER_MIME_TYPES.has(explicitType)) {
    return explicitType;
  }

  return MIME_BY_EXTENSION.get(getExtension(file.name)) ?? explicitType;
}

export function isPayablePdfFile(file: File | { name: string; type?: string | null }) {
  return resolvePayableFileMimeType(file) === 'application/pdf' || getExtension(file.name) === 'pdf';
}

export function isPayableImageFile(file: File | { name: string; type?: string | null }) {
  const mimeType = resolvePayableFileMimeType(file);
  return mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(getExtension(file.name));
}

export function inferPayableAttachmentType(file: File | { name: string; type?: string | null }): PayableAttachmentFileType {
  const lower = file.name.toLowerCase();
  if (isPayablePdfFile(file) || lower.includes('boleto')) return 'BOLETO';
  if (lower.includes('nota') || lower.includes('nf')) return 'NOTA_FISCAL';
  if (lower.includes('comp') || lower.includes('recibo') || isPayableImageFile(file)) return 'COMPROVANTE';
  if (lower.includes('contrato')) return 'CONTRATO';
  return 'OUTRO';
}
