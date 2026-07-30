export function normalizeMegaMasterEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

export function parseMegaMasterEmails(raw: string | null | undefined) {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(normalizeMegaMasterEmail)
      .filter(Boolean),
  );
}

export function isMegaMasterEmail(email: string | null | undefined, allowedEmails: Set<string>) {
  return allowedEmails.has(normalizeMegaMasterEmail(email));
}

export function isOtherMegaMasterEmail(
  requesterEmail: string | null | undefined,
  targetEmail: string | null | undefined,
  allowedEmails: Set<string>,
) {
  const requester = normalizeMegaMasterEmail(requesterEmail);
  const target = normalizeMegaMasterEmail(targetEmail);
  return Boolean(target && requester !== target && allowedEmails.has(target));
}
