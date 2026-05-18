import { describe, it, expect } from 'vitest';
import { validarCPF, validarCNPJ } from '@/services/domain/customers';

describe('validarCPF', () => {
  it('rejects 11 identical digits', () => {
    expect(validarCPF('111.111.111-11')).toBe(false);
    expect(validarCPF('000.000.000-00')).toBe(false);
  });

  it('rejects shorter or longer strings', () => {
    expect(validarCPF('123')).toBe(false);
    expect(validarCPF('123.456.789-012')).toBe(false);
  });

  it('rejects CPF with wrong check digits', () => {
    expect(validarCPF('123.456.789-00')).toBe(false);
  });

  it('accepts valid CPFs (formatted and digits-only)', () => {
    expect(validarCPF('529.982.247-25')).toBe(true);
    expect(validarCPF('52998224725')).toBe(true);
  });
});

describe('validarCNPJ', () => {
  it('rejects 14 identical digits', () => {
    expect(validarCNPJ('11.111.111/1111-11')).toBe(false);
  });

  it('rejects CNPJ with wrong check digits', () => {
    expect(validarCNPJ('11.222.333/0001-00')).toBe(false);
  });

  it('accepts valid CNPJ (formatted and digits-only)', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true);
    expect(validarCNPJ('11222333000181')).toBe(true);
  });
});
