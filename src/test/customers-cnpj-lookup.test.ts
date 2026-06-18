import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCnpj, sanitizeClientInput } from '@/services/domain/customers';

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

    expect(result.name).toBe('');
    expect(result.tradeName).toBe('');
    expect(result.email).toBe('');
    expect(result.cep).toBe('14177-612');
    expect(result.address).toBe('Rua Antônio Dias');
    expect(result.district).toBe('Jardim Boa Vista');
    expect(result.city).toBe('Sertãozinho');
    expect(result.state).toBe('SP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('usa nome fantasia como nome principal quando a BrasilAPI informa', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('brasilapi.com.br/api/cnpj/v1/12345678000195')) {
        return jsonResponse({
          razao_social: 'EMPRESA EXEMPLO SERVICOS LTDA',
          nome_fantasia: 'OFICINA PREMIUM',
          cep: '14177612',
          logradouro: 'Rua Teste',
          numero: '100',
          bairro: 'Centro',
          municipio: 'SERTAOZINHO',
          uf: 'SP',
          email: 'CONTATO@EXEMPLO.COM',
          ddd_telefone_1: '1635244661',
          ddd_telefone_2: null,
        });
      }

      throw new Error(`URL inesperada: ${url}`);
    });

    const result = await lookupCnpj('12.345.678/0001-95');

    expect(result.name).toBe('Oficina Premium');
    expect(result.tradeName).toBe('Oficina Premium');
    expect(result.email).toBe('contato@exemplo.com');
    expect(result.addressNumber).toBe('100');
  });
});

describe('sanitizeClientInput', () => {
  it('preserva caixa digitada em nomes e siglas de clientes', () => {
    const result = sanitizeClientInput({
      name: '  CCM   Retifica  Premium  ',
      tradeName: '  CCM  ',
      docType: 'CNPJ',
      docNumber: '12.345.678/0001-95',
      phone: '(16) 99999-0000',
      email: ' CONTATO@EXEMPLO.COM ',
      cep: '14177-612',
      address: 'rua teste',
      addressNumber: '100',
      district: 'centro',
      city: 'sertaozinho',
      state: 'sp',
      notes: '  cliente   prefere  sigla  ',
      isActive: true,
    });

    expect(result.name).toBe('CCM Retifica Premium');
    expect(result.tradeName).toBe('CCM');
    expect(result.email).toBe('contato@exemplo.com');
    expect(result.city).toBe('Sertãozinho');
    expect(result.state).toBe('SP');
  });
});
