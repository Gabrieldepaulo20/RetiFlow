export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  Message: string;
  MessageId: string;
  Timestamp: string;
  TopicArn: string;
  Signature: string;
  SignatureVersion: '1' | '2';
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

interface ParsedMimePart {
  headers: Record<string, string>;
  text: string;
  contentType: string;
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeQuotedPrintable(value: string) {
  const unfolded = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];

  for (let index = 0; index < unfolded.length; index += 1) {
    const current = unfolded[index];
    const hex = unfolded.slice(index + 1, index + 3);
    if (current === '=' && /^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(current.charCodeAt(0));
    }
  }

  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function decodeBody(value: string, encoding: string) {
  if (encoding === 'base64') return decodeBase64(value);
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(value);
  return value;
}

function parseHeaders(rawHeaders: string) {
  const headers: Record<string, string> = {};
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');

  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }

  return headers;
}

function splitMime(rawMime: string) {
  const separator = rawMime.search(/\r?\n\r?\n/);
  if (separator === -1) return { headers: {}, body: rawMime };

  const separatorLength = rawMime.slice(separator).startsWith('\r\n\r\n') ? 4 : 2;
  return {
    headers: parseHeaders(rawMime.slice(0, separator)),
    body: rawMime.slice(separator + separatorLength),
  };
}

function getBoundary(contentType: string) {
  return contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean) ?? null;
}

function parseMimeParts(rawMime: string): ParsedMimePart[] {
  const { headers, body } = splitMime(rawMime);
  const contentType = headers['content-type'] ?? 'text/plain';
  const boundary = getBoundary(contentType);

  if (boundary) {
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter((part) => !part.startsWith('--'))
      .flatMap((part) => parseMimeParts(part.replace(/^\r?\n/, '').replace(/\r?\n$/, '')));
  }

  const encoding = (headers['content-transfer-encoding'] ?? '').toLowerCase();
  return [{ headers, contentType, text: decodeBody(body, encoding) }];
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

export function extractReplyText(rawMime: string) {
  const parts = parseMimeParts(rawMime);
  const plainText = parts.find((part) => part.contentType.toLowerCase().startsWith('text/plain'))?.text;
  const htmlText = parts.find((part) => part.contentType.toLowerCase().startsWith('text/html'))?.text;
  return stripQuotedReply(plainText ?? stripHtml(htmlText ?? ''));
}

export function stripQuotedReply(value: string) {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const normalized = line.trim();
    if (/^>/.test(normalized)) continue;
    if (/^--\s*$/.test(normalized)) break;
    if (/^-{2,}\s*(original message|mensagem original)\s*-{2,}$/i.test(normalized)) break;
    if (/^(on .+ wrote:|em .+ escreveu:|de:\s|from:\s|sent:\s|enviado em:\s)/i.test(normalized)) break;
    kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

export function extractMimeHeader(rawMime: string, name: string) {
  const { headers } = splitMime(rawMime);
  return headers[name.toLowerCase()] ?? '';
}

export function extractTicketId(recipients: string[], inboundDomain: string) {
  const escapedDomain = inboundDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`reply\\+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@${escapedDomain}`, 'i');

  for (const recipient of recipients) {
    const match = recipient.match(pattern);
    if (match) return match[1].toLowerCase();
  }

  return null;
}

export function isTrustedSnsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && /^sns(?:\.[a-z0-9-]+)?\.amazonaws\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function buildSnsCanonicalString(message: SnsMessage) {
  const fields = message.Type === 'Notification'
    ? ['Message', 'MessageId', ...(message.Subject ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

  return fields.map((field) => `${field}\n${String(message[field as keyof SnsMessage] ?? '')}\n`).join('');
}

function readDerTlv(bytes: Uint8Array, offset: number) {
  const start = offset;
  const tag = bytes[offset];
  const lengthByte = bytes[offset + 1];
  if (tag === undefined || lengthByte === undefined) throw new Error('Certificado SNS inválido.');

  let length = lengthByte;
  let headerLength = 2;
  if (lengthByte & 0x80) {
    const lengthBytes = lengthByte & 0x7f;
    if (!lengthBytes || lengthBytes > 4) throw new Error('Certificado SNS inválido.');
    length = 0;
    headerLength += lengthBytes;
    for (let index = 0; index < lengthBytes; index += 1) {
      length = (length << 8) | bytes[offset + 2 + index];
    }
  }

  const valueStart = start + headerLength;
  const end = valueStart + length;
  if (end > bytes.length) throw new Error('Certificado SNS inválido.');
  return { start, tag, valueStart, end };
}

function extractSpkiFromCertificate(certificate: Uint8Array) {
  const root = readDerTlv(certificate, 0);
  const tbsCertificate = readDerTlv(certificate, root.valueStart);
  let cursor = tbsCertificate.valueStart;

  if (certificate[cursor] === 0xa0) cursor = readDerTlv(certificate, cursor).end;
  for (let index = 0; index < 5; index += 1) cursor = readDerTlv(certificate, cursor).end;

  const spki = readDerTlv(certificate, cursor);
  return certificate.slice(spki.start, spki.end).buffer;
}

function pemToArrayBuffer(pem: string) {
  const isCertificate = pem.includes('-----BEGIN CERTIFICATE-----');
  const base64 = pem.replace(/-----BEGIN (?:CERTIFICATE|PUBLIC KEY)-----|-----END (?:CERTIFICATE|PUBLIC KEY)-----|\s+/g, '');
  const binary = atob(base64);
  const der = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return isCertificate ? extractSpkiFromCertificate(der) : der.buffer;
}

export async function verifySnsSignature(
  message: SnsMessage,
  fetchCertificate = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Não foi possível baixar o certificado SNS.');
    return response.text();
  },
) {
  if (!isTrustedSnsUrl(message.SigningCertURL)) return false;
  if (message.SignatureVersion !== '1' && message.SignatureVersion !== '2') return false;

  const certificate = await fetchCertificate(message.SigningCertURL);
  const hash = message.SignatureVersion === '1' ? 'SHA-1' : 'SHA-256';
  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(certificate),
    { name: 'RSASSA-PKCS1-v1_5', hash },
    false,
    ['verify'],
  );
  const signature = Uint8Array.from(atob(message.Signature), (char) => char.charCodeAt(0));

  return crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    new TextEncoder().encode(buildSnsCanonicalString(message)),
  );
}
