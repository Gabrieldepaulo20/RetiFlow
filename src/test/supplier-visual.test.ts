import { describe, it, expect } from 'vitest';
import {
  getSupplierVisual,
  getSupplierColor,
  getSupplierInitials,
  normalizeSupplierText,
} from '@/lib/supplierVisual';

describe('supplierVisual', () => {
  it('reconhece bancos/fintechs conhecidos como marca', () => {
    expect(getSupplierVisual('Nubank Empresas')?.kind).toBe('brand');
    expect(getSupplierVisual('ITAÚ UNIBANCO S.A.')?.kind).toBe('brand');
    expect(getSupplierVisual('Banco Inter')?.kind).toBe('brand');
  });

  it('infere ramo por palavra-chave quando a marca não é conhecida', () => {
    expect(getSupplierVisual('Faculdade Anhanguera')?.kind).toBe('industry');
    expect(getSupplierVisual('Salgaderia da Esquina')?.kind).toBe('industry');
    expect(getSupplierVisual('Posto Shell Centro')?.kind).toBe('industry');
    expect(getSupplierVisual('Distribuidora de Energia XYZ')?.kind).toBe('industry');
  });

  it('retorna null quando nada bate (fallback fica com o componente)', () => {
    expect(getSupplierVisual('Zzqwx Ltda')).toBeNull();
    expect(getSupplierVisual('')).toBeNull();
    expect(getSupplierVisual(null)).toBeNull();
  });

  it('normaliza acentos e caixa', () => {
    expect(normalizeSupplierText('ÁGUA São Paulo')).toBe('agua sao paulo');
  });

  it('gera cor determinística e estável para o mesmo nome', () => {
    expect(getSupplierColor('Auto Peças Silva')).toBe(getSupplierColor('Auto Peças Silva'));
    expect(getSupplierColor('Auto Peças Silva')).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('extrai iniciais sensatas', () => {
    expect(getSupplierInitials('Auto Peças Silva')).toBe('AS');
    expect(getSupplierInitials('Sabesp')).toBe('SA');
    expect(getSupplierInitials('')).toBe('?');
  });
});
