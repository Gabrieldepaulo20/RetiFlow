import { describe, expect, it } from 'vitest';
import {
  buildDocumentCompanyPresentation,
  buildFallbackResolvedCustomization,
  containsUnsafeTemplateContent,
  extractTemplateVariables,
  getDefaultDocumentTemplateConfig,
  getInvalidTemplateVariables,
  isDocumentCustomizationForUser,
  normalizeDocumentCompanyName,
  isHexColor,
  normalizeDocumentTemplateConfig,
  normalizeHexColor,
  normalizeServiceOrderText,
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
    expect(fallback.company.nomeFantasia).toBe('Empresa');
    expect(fallback.company.telefone).toBe('');
    expect(fallback.resolvedConfig.title).toBe('Fechamento');
  });

  it('normalizes service document branding text', () => {
    expect(normalizeDocumentCompanyName('GAWI')).toBe('GAWI');
    expect(normalizeDocumentCompanyName('Retifica Premium')).toBe('Retífica Premium');
    expect(normalizeDocumentCompanyName('')).toBe('Empresa');
    expect(normalizeServiceOrderText('ordem de servico')).toBe('ordem de serviço');
    expect(normalizeServiceOrderText('ORDEM DE SERVICO')).toBe('ORDEM DE SERVIÇO');
  });

  it('builds company headers without injecting another tenant data', () => {
    const gawi = buildFallbackResolvedCustomization('entry_note', 'tenant-gawi');
    gawi.company.nomeFantasia = 'GAWI';
    gawi.company.email = 'contato@gawi.test';

    expect(buildDocumentCompanyPresentation(gawi.company)).toEqual({
      name: 'GAWI',
      address: '',
      contactLine: 'contato@gawi.test',
      site: '',
    });

    expect(buildDocumentCompanyPresentation(null)).toEqual({
      name: 'Empresa',
      address: '',
      contactLine: '',
      site: '',
    });
  });

  it('accepts document identity only when every record belongs to the active company', () => {
    const customization = buildFallbackResolvedCustomization('entry_note', 'tenant-retifica');
    expect(isDocumentCustomizationForUser(customization, 'tenant-retifica', 'entry_note')).toBe(true);
    expect(isDocumentCustomizationForUser(customization, 'tenant-retifica', 'closing_report')).toBe(false);

    expect(isDocumentCustomizationForUser({
      ...customization,
      company: { ...customization.company, fkUsuarios: 'tenant-gawi' },
    }, 'tenant-retifica')).toBe(false);

    expect(isDocumentCustomizationForUser({
      ...customization,
      template: {
        id: 'template-gawi',
        fkUsuarios: 'tenant-gawi',
        documentType: 'entry_note',
        name: 'Modelo GAWI',
        status: 'active',
        version: 1,
        config: {},
        createdBy: null,
        createdAt: '2026-08-11T12:00:00.000Z',
        updatedAt: '2026-08-11T12:00:00.000Z',
        publishedAt: '2026-08-11T12:00:00.000Z',
        archivedAt: null,
      },
    }, 'tenant-retifica')).toBe(false);
  });
});
