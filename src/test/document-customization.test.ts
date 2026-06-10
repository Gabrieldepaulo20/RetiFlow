import { describe, expect, it } from 'vitest';
import {
  buildFallbackResolvedCustomization,
  containsUnsafeTemplateContent,
  extractTemplateVariables,
  getDefaultDocumentTemplateConfig,
  getInvalidTemplateVariables,
  isHexColor,
  normalizeDocumentTemplateConfig,
  normalizeHexColor,
  renderTemplateText,
  sanitizeDocumentText,
  validateDocumentTemplateConfig,
} from '@/services/domain/documentCustomization';

describe('document customization domain helpers', () => {
  it('validates and normalizes hex colors', () => {
    expect(isHexColor('#1a7a8a')).toBe(true);
    expect(isHexColor('#xyz')).toBe(false);
    expect(normalizeHexColor(' #0f7f95 ', '#111111')).toBe('#0f7f95');
    expect(normalizeHexColor('tomato', '#111111')).toBe('#111111');
  });

  it('sanitizes document text and rejects unsafe content', () => {
    expect(sanitizeDocumentText(' <b>Olá</b>\n ', 20)).toBe('bOlá/b');
    expect(containsUnsafeTemplateContent('<script>alert(1)</script>')).toBe(true);
    expect(containsUnsafeTemplateContent('Obrigado pela preferência')).toBe(false);
  });

  it('extracts and validates whitelisted variables', () => {
    expect(extractTemplateVariables('Olá {{ customer_name }} — {{total_amount}}')).toEqual(['customer_name', 'total_amount']);
    expect(getInvalidTemplateVariables('Olá {{ user.password }} {{unknown}}')).toEqual(['unknown']);
    expect(renderTemplateText('Cliente {{customer_name}}: {{total_amount}}', {
      customer_name: 'Cliente Teste',
      total_amount: 'R$ 100,00',
    })).toBe('Cliente Cliente Teste: R$ 100,00');
  });

  it('normalizes template config with safe defaults', () => {
    const config = normalizeDocumentTemplateConfig('entry_note', {
      title: 'Minha O.S.',
      layoutStyle: 'invalid',
      showFooter: false,
      theme: {
        primaryColor: '#123456',
        secondaryColor: 'not-a-color',
      },
    });
    const defaults = getDefaultDocumentTemplateConfig('entry_note');

    expect(config.title).toBe('Minha O.S.');
    expect(config.layoutStyle).toBe(defaults.layoutStyle);
    expect(config.showFooter).toBe(false);
    expect(config.theme.primaryColor).toBe('#123456');
    expect(config.theme.secondaryColor).toBe(defaults.theme.secondaryColor);
  });

  it('reports unsafe template payloads', () => {
    expect(validateDocumentTemplateConfig({
      title: 'Modelo',
      introText: 'Use {{unknown_variable}}',
      theme: { primaryColor: 'blue' },
    }).errors).toEqual(expect.arrayContaining([
      'Variável inválida: unknown_variable',
      'Cor inválida em primaryColor.',
    ]));
  });

  it('builds a fallback resolved customization for documents', () => {
    const fallback = buildFallbackResolvedCustomization('closing_report', 'user-1');

    expect(fallback.fkUsuarios).toBe('user-1');
    expect(fallback.documentType).toBe('closing_report');
    expect(fallback.template).toBeNull();
    expect(fallback.resolvedConfig.title).toBe('Fechamento');
  });
});
