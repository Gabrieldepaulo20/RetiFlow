import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCnpj } from '@/services/domain/customers';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('lookupCnpj', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consulta CNPJ real com campos nulos e completa endereco pelo CEP', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('brasilapi.com.br/api/cnpj/v1/59540218000181')) {
        return jsonResponse({
          razao_social: '59.540.218 GABRIEL WILLIAM DE PAULO',
          nome_fantasia: '',
          cep: '14177612',
          logradouro: '',
          numero: '',
          bairro: 'JARDIM BOA VISTA',
          municipio: 'SERTAOZINHO',
          uf: 'SP',
          email: null,
          ddd_telefone_1: '',
          ddd_telefone_2: null,
        });
      }

      if (url.includes('viacep.com.br/ws/14177612/json')) {
        return jsonResponse({
          cep: '14177-612',
          logradouro: 'Rua Antônio Dias',
          bairro: 'Jardim Boa Vista',
          localidade: 'Sertãozinho',
          uf: 'SP',
        });
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    const result = await lookupCnpj('59.540.218/0001-81');

    expect(result.name).toBe('59.540.218 Gabriel William de Paulo');
    expect(result.email).toBe('');
    expect(result.cep).toBe('14177-612');
    expect(result.address).toBe('Rua Antônio Dias');
    expect(result.district).toBe('Jardim Boa Vista');
    expect(result.city).toBe('Sertãozinho');
    expect(result.state).toBe('SP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
