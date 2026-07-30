import { describe, expect, it } from 'vitest';
import {
  isMegaMasterEmail,
  isOtherMegaMasterEmail,
  parseMegaMasterEmails,
} from '../../supabase/functions/_shared/mega-master';

describe('Mega Master Edge Function guard', () => {
  const allowedEmails = parseMegaMasterEmails(
    'gabrielwilliam208@gmail.com, guilhermehenriquedepaulo2@gmail.com',
  );

  it('normalizes and recognizes both Mega Masters', () => {
    expect(isMegaMasterEmail(' GABRIELWILLIAM208@gmail.com ', allowedEmails)).toBe(true);
    expect(isMegaMasterEmail('guilhermehenriquedepaulo2@gmail.com', allowedEmails)).toBe(true);
    expect(isMegaMasterEmail('cliente@example.com', allowedEmails)).toBe(false);
  });

  it('protects a peer Mega Master but not the requester or a regular user', () => {
    expect(isOtherMegaMasterEmail(
      'gabrielwilliam208@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com',
      allowedEmails,
    )).toBe(true);
    expect(isOtherMegaMasterEmail(
      'guilhermehenriquedepaulo2@gmail.com',
      'guilhermehenriquedepaulo2@gmail.com',
      allowedEmails,
    )).toBe(false);
    expect(isOtherMegaMasterEmail(
      'guilhermehenriquedepaulo2@gmail.com',
      'cliente@example.com',
      allowedEmails,
    )).toBe(false);
  });
});
