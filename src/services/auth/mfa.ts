import { supabase } from '@/lib/supabase';

export type MfaAssuranceLevel = 'aal1' | 'aal2';

export interface VerifiedTotpFactor {
  id: string;
  friendlyName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret?: string;
}

export async function getMfaAssuranceLevel(): Promise<{
  currentLevel: MfaAssuranceLevel;
  nextLevel: MfaAssuranceLevel;
}> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;

  return {
    currentLevel: (data.currentLevel ?? 'aal1') as MfaAssuranceLevel,
    nextLevel: (data.nextLevel ?? 'aal1') as MfaAssuranceLevel,
  };
}

export async function isMfaChallengeRequired() {
  const { currentLevel, nextLevel } = await getMfaAssuranceLevel();
  return currentLevel !== 'aal2' && nextLevel === 'aal2';
}

export async function listVerifiedTotpFactors(): Promise<VerifiedTotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;

  return (data.totp ?? [])
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? undefined,
      createdAt: factor.created_at ?? undefined,
      updatedAt: factor.updated_at ?? undefined,
    }));
}

export async function startTotpEnrollment(friendlyName = 'Retiflow'): Promise<MfaEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });

  if (error) throw error;
  if (!data.totp?.qr_code) {
    throw new Error('O Supabase não retornou o QR Code do MFA.');
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyTotpFactor(factorId: string, code: string) {
  const cleanCode = code.replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Informe o código de 6 dígitos do aplicativo autenticador.');
  }

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;

  const verification = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: cleanCode,
  });
  if (verification.error) throw verification.error;
}

export async function verifyFirstAvailableTotpFactor(code: string) {
  const factors = await listVerifiedTotpFactors();
  const factor = factors[0];
  if (!factor) {
    throw new Error('Nenhum fator MFA verificado foi encontrado para esta conta.');
  }

  await verifyTotpFactor(factor.id, code);
}

export async function removeTotpFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
