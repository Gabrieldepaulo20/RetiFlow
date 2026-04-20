import { apiFetch } from '../client';
import { brasilApiCnpjResponseSchema, type BrasilApiCnpjResponse } from '../schemas/brasilapi';
import { viaCepResponseSchema, type ViaCepResponse } from '../schemas/viacep';

/**
 * Consulta endereço pelo CEP via ViaCEP.
 * Retorna o objeto raw validado; o mapeamento para CepLookupResult fica em customers.ts.
 */
export async function fetchCep(
  digits: string,
  signal?: AbortSignal,
): Promise<ViaCepResponse> {
  return apiFetch<ViaCepResponse>(
    `https://viacep.com.br/ws/${digits}/json/`,
    {
      signal,
      validate: (raw) => viaCepResponseSchema.parse(raw),
    },
  );
}

/**
 * Consulta dados de empresa pelo CNPJ via BrasilAPI.
 * Retorna o objeto raw validado; o mapeamento para CnpjLookupResult fica em customers.ts.
 */
export async function fetchCnpj(
  digits: string,
  signal?: AbortSignal,
): Promise<BrasilApiCnpjResponse> {
  return apiFetch<BrasilApiCnpjResponse>(
    `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
    {
      signal,
      validate: (raw) => brasilApiCnpjResponseSchema.parse(raw),
    },
  );
}
