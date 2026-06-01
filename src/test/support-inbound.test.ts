import { describe, expect, it } from 'vitest';
import {
  buildSnsCanonicalString,
  extractReplyText,
  extractTicketId,
  verifySnsSignature,
  type SnsMessage,
} from '../../supabase/functions/support-inbound/lib';

function toBase64(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

function toPem(value: ArrayBuffer) {
  const base64 = toBase64(value);
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

const snsCertificateFixture = `-----BEGIN CERTIFICATE-----
MIIDLTCCAhWgAwIBAgIURWri09uGZEG/zVGSuxaQ6V2m37YwDQYJKoZIhvcNAQEL
BQAwJjEkMCIGA1UEAwwbc25zLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tMB4XDTI2
MDYwMTE4MTAxOVoXDTI2MDYwMjE4MTAxOVowJjEkMCIGA1UEAwwbc25zLnVzLWVh
c3QtMS5hbWF6b25hd3MuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAoBosw6Vk6WDef9HqBy0ZaNlHr7iXIeVyxfEaa+tTdEbZafXwPg9/vFgUntJg
8b11laEQbNZTrMJylyPzoFGIM0OkN8sjox5j4wXUqlgRPZXLSTUk+WDuj0C+j9vJ
FR2SRHMqGnoO8TC05WxwGd+KFtkZVP9rKmg59LLX0weGE6wjBexJAcYhJIlKELIy
VvFHD2smj0yA0qM0lZT39HlujK1kdmZAtVQzDyBZbR4hKr3Iye6zNSmIMO41Z3eP
C3NH/CXthoBEv2YGdd+AoKklnfZzE6LoFj1t+37iZngH/fGlQSnGVZNiDpGBdN2H
/kClB9HbLHNFfkCUfao3a2sDZwIDAQABo1MwUTAdBgNVHQ4EFgQU4csYeLr7LLRz
2TEoM7X5gyFzYlgwHwYDVR0jBBgwFoAU4csYeLr7LLRz2TEoM7X5gyFzYlgwDwYD
VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAS0LSPeF3KrjLIQD7j3Yj
eUI4NhUybKcnTAOBjY85uHwoifOeJ8LPd2pttfnThM1W+tRFckuAMyTlVIlipt3/
nooZVZZwGrMtPWToZT5W7PJg/VuKnt0jiQMbplrdIh955n6D3seIM0thWQwuA2Pd
Ce60wEuTsyz6mROOLCGtFDVKq17Eehim16MDK2dUKqG8dJL75wKVxwpGrM+VAxCd
5WcvfIsrnEiBpSPdTMbyW97HEs7ykY+XwITaDb0aZy6BpE4PZOwRlRWyCUVc8iBC
X7+OV/8nnAqUG0//L3sTXjqnQWJLfwT0d0CP7LMRlQpWC4dMqEHwl4aCTkbVbxbh
DQ==
-----END CERTIFICATE-----`;

async function createSignedMessage() {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const message: SnsMessage = {
    Type: 'Notification',
    Message: '{"mail":{"destination":[]}}',
    MessageId: crypto.randomUUID(),
    Timestamp: new Date().toISOString(),
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:retiflow-support-inbound',
    Signature: '',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/test.pem',
  };
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keys.privateKey,
    new TextEncoder().encode(buildSnsCanonicalString(message)),
  );
  message.Signature = toBase64(signature);
  const publicKey = toPem(await crypto.subtle.exportKey('spki', keys.publicKey));
  return { message, publicKey };
}

describe('support inbound helpers', () => {
  it('rejeita payload SNS alterado depois da assinatura', async () => {
    const { message, publicKey } = await createSignedMessage();
    const forged = { ...message, Message: '{"mail":{"destination":["forjado@example.com"]}}' };

    await expect(verifySnsSignature(forged, async () => publicKey)).resolves.toBe(false);
  });

  it('aceita assinatura SNS válida', async () => {
    const { message, publicKey } = await createSignedMessage();

    await expect(verifySnsSignature(message, async () => publicKey)).resolves.toBe(true);
  });

  it('extrai a chave pública de um certificado X.509 como o usado pelo SNS', async () => {
    const message: SnsMessage = {
      Type: 'Notification',
      Message: '{"mail":{"destination":[]}}',
      MessageId: '11111111-1111-4111-8111-111111111111',
      Timestamp: '2026-06-01T12:00:00.000Z',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:retiflow-support-inbound',
      Signature: 'GBjh28EgY6YpyUi745FK4uEAd/tYv5ipK5WTxF8oEtROchAWjDw8F2cl6MprLwlBGYtlXN+DYqHO8yN2Fs1+PSHBWhx/Wyf4dlkj54KSsCL/z9UGU2ul6ye3dsc7BkDUU9hj8MD0MSstyqbhJe+J/GfTDtjIwrdXg1/x4e0e/1My2TsxrEAWmIf+x14tA5GE7Y4A9RdaBfRPkhL6nifpG7NtFZ+7cSr4mfNy+5SHwSDtUrCXDu3mgxW6QLYrMZp2rZdzvI3a/3zX2fKiRI/AQ38PDpDGSW24XrVkxvOsag7xhKWmdEbtgciWZhPoVr+cPGdjJL0n/lgSn+WJkq/nDw==',
      SignatureVersion: '2',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/test.pem',
    };

    await expect(verifySnsSignature(message, async () => snsCertificateFixture)).resolves.toBe(true);
  });

  it('extrai o chamado do plus-address e remove histórico citado', () => {
    const ticketId = '21e20dad-bb63-4de8-8e2e-622cd1ebf541';
    const rawMime = [
      'From: Admin <admin@example.com>',
      `To: reply+${ticketId}@inbox.example.com`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'Ajustamos o seu acesso.',
      '',
      'Em dom., 1 de jun. de 2026, Cliente escreveu:',
      '> Não estou conseguindo entrar.',
    ].join('\r\n');

    expect(extractTicketId([extractReplyText(rawMime), `reply+${ticketId}@inbox.example.com`], 'inbox.example.com')).toBe(ticketId);
    expect(extractReplyText(rawMime)).toBe('Ajustamos o seu acesso.');
  });
});
