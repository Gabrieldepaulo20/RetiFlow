export function buildWhatsAppUrl(phone: string | undefined, message: string) {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;

  const normalizedPhone = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareOrCopyText(payload: { title: string; text: string; url?: string }) {
  const shareData: ShareData = {
    title: payload.title,
    text: payload.text,
    url: payload.url,
  };

  if (navigator.share) {
    await navigator.share(shareData);
    return 'shared' as const;
  }

  const textToCopy = [payload.text, payload.url].filter(Boolean).join('\n');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textToCopy);
    return 'copied' as const;
  }

  return 'unsupported' as const;
}
