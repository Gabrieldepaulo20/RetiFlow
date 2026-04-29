export const SUPPORT_MESSAGE_LIMITS = {
  min: 10,
  max: 2000,
} as const;

export function normalizeSupportMessage(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, SUPPORT_MESSAGE_LIMITS.max);
}

export function validateSupportMessage(value: string) {
  const message = normalizeSupportMessage(value);
  if (message.length < SUPPORT_MESSAGE_LIMITS.min) {
    return {
      ok: false as const,
      message,
      error: `Descreva o chamado com pelo menos ${SUPPORT_MESSAGE_LIMITS.min} caracteres.`,
    };
  }

  return { ok: true as const, message };
}
