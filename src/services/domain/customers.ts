import { Client, DocType } from '@/types';
import { fetchCep, fetchCnpj } from '@/api/endpoints/brazilian';
import { ApiError } from '@/api/errors';

export const CUSTOMER_FIELD_LIMITS = {
  name: 80,
  tradeName: 80,
  docNumber: 18,
  phone: 20,
  email: 120,
  cep: 9,
  address: 120,
  addressNumber: 12,
  district: 60,
  city: 60,
  state: 2,
  notes: 280,
} as const;


export interface CepLookupResult {
  cep: string;
  address: string;
  district: string;
  city: string;
  state: string;
}

export interface CnpjLookupResult {
  name: string;
  tradeName: string;
  email: string;
  phone: string;
  cep: string;
  address: string;
  addressNumber: string;
  district: string;
  city: string;
  state: string;
}

export function stripDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function clamp(value: string, limit: number) {
  return value.slice(0, limit);
}

export function formatCep(value: string) {
  const digits = stripDigits(value).slice(0, 8);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatCpfCnpj(value: string, docType: DocType) {
  const digits = stripDigits(value).slice(0, docType === 'CPF' ? 11 : 14);

  if (docType === 'CPF') {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatPhone(value: string) {
  const digits = stripDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits ? `(${digits}` : '';
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function buildCustomerAddressLabel(client?: Partial<Client> | null) {
  if (!client) {
    return '—';
  }

  const parts = [
    client.address,
    client.addressNumber,
    client.district,
    client.city && client.state ? `${client.city}/${client.state}` : client.city || client.state,
    client.cep,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : '—';
}

export function sanitizeClientInput(client: Omit<Client, 'id' | 'createdAt'>): Omit<Client, 'id' | 'createdAt'> {
  return {
    ...client,
    name: clamp(client.name.trim(), CUSTOMER_FIELD_LIMITS.name),
    tradeName: clamp((client.tradeName || '').trim(), CUSTOMER_FIELD_LIMITS.tradeName),
    docNumber: clamp(client.docNumber.trim(), CUSTOMER_FIELD_LIMITS.docNumber),
    phone: clamp(client.phone.trim(), CUSTOMER_FIELD_LIMITS.phone),
    email: clamp(client.email.trim().toLowerCase(), CUSTOMER_FIELD_LIMITS.email),
    cep: clamp((client.cep || '').trim(), CUSTOMER_FIELD_LIMITS.cep),
    address: clamp(client.address.trim(), CUSTOMER_FIELD_LIMITS.address),
    addressNumber: clamp((client.addressNumber || '').trim(), CUSTOMER_FIELD_LIMITS.addressNumber),
    district: clamp((client.district || '').trim(), CUSTOMER_FIELD_LIMITS.district),
    city: clamp(client.city.trim(), CUSTOMER_FIELD_LIMITS.city),
    state: clamp(client.state.trim().toUpperCase(), CUSTOMER_FIELD_LIMITS.state),
    notes: clamp(client.notes.trim(), CUSTOMER_FIELD_LIMITS.notes),
  };
}

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepLookupResult> {
  const digits = stripDigits(cep);
  if (digits.length !== 8) {
    throw new Error('Informe um CEP com 8 dígitos.');
  }

  try {
    const data = await fetchCep(digits, signal);
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }
    return {
      cep: formatCep(data.cep || digits),
      address: data.logradouro || '',
      district: data.bairro || '',
      city: data.localidade || '',
      state: (data.uf || '').toUpperCase(),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error('Não foi possível consultar o CEP agora. Tente novamente.');
    }
    throw error;
  }
}

export async function lookupCnpj(cnpj: string, signal?: AbortSignal): Promise<CnpjLookupResult> {
  const digits = stripDigits(cnpj);
  if (digits.length !== 14) {
    throw new Error('Informe um CNPJ com 14 dígitos.');
  }

  try {
    const data = await fetchCnpj(digits, signal);
    const phone = formatPhone(data.ddd_telefone_1 || data.ddd_telefone_2 || '');
    return {
      name: clamp((data.nome_fantasia || data.razao_social || '').trim(), CUSTOMER_FIELD_LIMITS.name),
      tradeName: clamp((data.nome_fantasia || '').trim(), CUSTOMER_FIELD_LIMITS.tradeName),
      email: clamp((data.email || '').trim().toLowerCase(), CUSTOMER_FIELD_LIMITS.email),
      phone,
      cep: formatCep(data.cep || ''),
      address: clamp((data.logradouro || '').trim(), CUSTOMER_FIELD_LIMITS.address),
      addressNumber: clamp((data.numero || '').trim(), CUSTOMER_FIELD_LIMITS.addressNumber),
      district: clamp((data.bairro || '').trim(), CUSTOMER_FIELD_LIMITS.district),
      city: clamp((data.municipio || '').trim(), CUSTOMER_FIELD_LIMITS.city),
      state: clamp((data.uf || '').trim().toUpperCase(), CUSTOMER_FIELD_LIMITS.state),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error('Não foi possível consultar o CNPJ agora. Tente novamente.');
    }
    throw error;
  }
}
