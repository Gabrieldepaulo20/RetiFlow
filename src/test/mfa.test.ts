import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMfaAssuranceLevel,
  isMfaChallengeRequired,
  listVerifiedTotpFactors,
  startTotpEnrollment,
  verifyFirstAvailableTotpFactor,
  verifyTotpFactor,
} from '@/services/auth/mfa';

const mocks = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: mocks,
    },
  },
}));

describe('MFA helpers', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('detects when a verified factor requires an MFA challenge', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });

    await expect(getMfaAssuranceLevel()).resolves.toEqual({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
    });
    await expect(isMfaChallengeRequired()).resolves.toBe(true);
  });

  it('does not require MFA when the session is already aal2', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });

    await expect(isMfaChallengeRequired()).resolves.toBe(false);
  });

  it('lists only verified TOTP factors', async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'verified-1', status: 'verified', friendly_name: 'Celular' },
          { id: 'pending-1', status: 'unverified', friendly_name: 'Pendente' },
        ],
      },
      error: null,
    });

    await expect(listVerifiedTotpFactors()).resolves.toEqual([
      { id: 'verified-1', friendlyName: 'Celular' },
    ]);
  });

  it('starts a TOTP enrollment and returns QR code metadata', async () => {
    mocks.enroll.mockResolvedValue({
      data: {
        id: 'factor-1',
        totp: {
          qr_code: 'data:image/svg+xml;utf8,<svg />',
          secret: 'ABC123',
        },
      },
      error: null,
    });

    await expect(startTotpEnrollment('Retiflow')).resolves.toEqual({
      factorId: 'factor-1',
      qrCode: 'data:image/svg+xml;utf8,<svg />',
      secret: 'ABC123',
    });
  });

  it('challenges and verifies a six digit TOTP code', async () => {
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null });
    mocks.verify.mockResolvedValue({ data: {}, error: null });

    await verifyTotpFactor('factor-1', '123456');

    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(mocks.verify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      challengeId: 'challenge-1',
      code: '123456',
    });
  });

  it('rejects invalid TOTP codes before calling Supabase', async () => {
    await expect(verifyTotpFactor('factor-1', '123')).rejects.toThrow('6 dígitos');
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('verifies the first available verified factor during login', async () => {
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }] },
      error: null,
    });
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null });
    mocks.verify.mockResolvedValue({ data: {}, error: null });

    await verifyFirstAvailableTotpFactor('123456');

    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({
      factorId: 'factor-1',
      code: '123456',
    }));
  });
});
