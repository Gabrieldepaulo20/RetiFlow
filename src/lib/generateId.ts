function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackUuidFromCrypto(randomBytes: Uint8Array) {
  const bytes = new Uint8Array(randomBytes);

  // RFC 4122 v4 bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytesToHex(bytes);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function generateId(prefix?: string) {
  const cryptoApi = globalThis.crypto;

  let id: string;

  if (typeof cryptoApi?.randomUUID === 'function') {
    id = cryptoApi.randomUUID();
  } else if (typeof cryptoApi?.getRandomValues === 'function') {
    id = fallbackUuidFromCrypto(cryptoApi.getRandomValues(new Uint8Array(16)));
  } else {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  return prefix ? `${prefix}-${id}` : id;
}
