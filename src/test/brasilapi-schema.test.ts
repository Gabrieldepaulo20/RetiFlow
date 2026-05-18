import { describe, expect, it } from 'vitest';
import { brasilApiCnpjResponseSchema } from '@/api/schemas/brasilapi';

describe('brasilApiCnpjResponseSchema', () => {
  it('aceita campos nulos retornados pela BrasilAPI', () => {
    const parsed = brasilApiCnpjResponseSchema.parse({
      razao_social: '59.540.218 GABRIEL WILLIAM DE PAULO',
      nome_fantasia: '',
      cep: '14177612',
      logradouro: '',
      numero: '',
      bairro: 'JARDIM BOA VISTA',
      municipio: 'SERTAOZINHO',
      uf: 'SP',
      email: null,
      ddd_telefone_1: null,
      ddd_telefone_2: '',
    });

    expect(parsed.email).toBe('');
    expect(parsed.ddd_telefone_1).toBe('');
    expect(parsed.razao_social).toBe('59.540.218 GABRIEL WILLIAM DE PAULO');
  });

  it('normaliza numeros inesperados sem rejeitar a resposta inteira', () => {
    const parsed = brasilApiCnpjResponseSchema.parse({
      razao_social: 'Empresa Teste LTDA',
      nome_fantasia: undefined,
      cep: 14177612,
      logradouro: 'Rua Teste',
      numero: 123,
      bairro: 'Centro',
      municipio: 'Sertaozinho',
      uf: 'SP',
      email: undefined,
      ddd_telefone_1: 1635244661,
      ddd_telefone_2: null,
    });

    expect(parsed.cep).toBe('14177612');
    expect(parsed.numero).toBe('123');
    expect(parsed.ddd_telefone_1).toBe('1635244661');
  });
});
