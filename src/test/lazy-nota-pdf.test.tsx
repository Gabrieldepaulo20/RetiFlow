import { describe, expect, it, vi } from 'vitest';
import { generateNotaPdfBlob } from '@/lib/notaPdf';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

const mocks = vi.hoisted(() => ({
  toBlob: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
  pdf: vi.fn(),
}));

vi.mock('@react-pdf/renderer', () => ({
  pdf: mocks.pdf,
}));

vi.mock('@/components/notes/NotaPDFTemplate', () => ({
  NotaPDFTemplate: () => null,
}));

function makeDetalhes(): NotaServicoDetalhes {
  return {
    cabecalho: {
      id_nota: 'nota-1',
      os_numero: 'OS-1',
      prazo: '2026-04-28',
      defeito: '',
      observacoes: null,
      data_criacao: '2026-04-28T00:00:00.000Z',
      finalizado_em: null,
      total: 100,
      total_servicos: 100,
      total_produtos: 0,
      criado_por_usuario: null,
      pdf_url: null,
      cliente: {
        id: 'cliente-1',
        nome: 'Cliente Teste',
        documento: '123',
        telefone: null,
        email: null,
        endereco: null,
        cidade: null,
        cep: null,
      },
      veiculo: {
        id: 'veiculo-1',
        modelo: 'Civic',
        placa: 'ABC1234',
        km: 0,
        motor: 'Flex',
      },
      status: {
        id: 1,
        nome: 'Aberto',
        index: 1,
        tipo_status: 'ativo',
      },
    },
    itens_servico: [],
    notas_compra_vinculadas: [],
    financeiro_servicos: {
      total_bruto: 100,
      total_liquido: 100,
    },
  };
}

describe('generateNotaPdfBlob', () => {
  it('loads react-pdf lazily and returns the generated blob', async () => {
    mocks.pdf.mockReturnValue({ toBlob: mocks.toBlob });

    const blob = await generateNotaPdfBlob(makeDetalhes());

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.toBlob).toHaveBeenCalledTimes(1);
  });
});
