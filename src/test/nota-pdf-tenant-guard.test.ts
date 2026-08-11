import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

function makeDetalhes(ownerId: string | null): NotaServicoDetalhes {
  return {
    cabecalho: {
      id_nota: 'nota-1',
      os_numero: 'OS-1',
      prazo: '2026-08-11',
      defeito: '',
      observacoes: null,
      data_criacao: '2026-08-11T12:00:00.000Z',
      finalizado_em: null,
      total: 100,
      total_servicos: 100,
      total_produtos: 0,
      criado_por_usuario: ownerId,
      pdf_url: null,
      cliente: {
        id: 'cliente-1',
        nome: 'Cliente Teste',
        documento: '',
        endereco: null,
        cep: null,
        cidade: null,
        telefone: null,
        email: null,
      },
      veiculo: {
        id: 'veiculo-1',
        modelo: 'Motor teste',
        placa: null,
        km: 0,
        motor: 'Teste',
      },
      status: { id: 1, nome: 'Aberta', index: 1, tipo_status: 'ativo' },
    },
    itens_servico: [],
    notas_compra_vinculadas: [],
    financeiro_servicos: { total_bruto: 100, total_liquido: 100 },
  };
}

describe('O.S. PDF tenant guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects document settings from another company before loading the PDF renderer', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'real');
    vi.resetModules();
    const [{ generateNotaPdfBlob }, { buildFallbackResolvedCustomization }] = await Promise.all([
      import('@/lib/notaPdf'),
      import('@/services/domain/documentCustomization'),
    ]);

    await expect(generateNotaPdfBlob(makeDetalhes('tenant-retifica'), {
      documentSettings: buildFallbackResolvedCustomization('entry_note', 'tenant-gawi'),
      expectedUserId: 'tenant-retifica',
    })).rejects.toThrow(/identidade visual da empresa/i);
  });

  it('rejects O.S. data owned by another company before loading the PDF renderer', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'real');
    vi.resetModules();
    const [{ generateNotaPdfBlob }, { buildFallbackResolvedCustomization }] = await Promise.all([
      import('@/lib/notaPdf'),
      import('@/services/domain/documentCustomization'),
    ]);

    await expect(generateNotaPdfBlob(makeDetalhes('tenant-gawi'), {
      documentSettings: buildFallbackResolvedCustomization('entry_note', 'tenant-retifica'),
      expectedUserId: 'tenant-retifica',
    })).rejects.toThrow(/não pertence à empresa ativa/i);
  });
});
