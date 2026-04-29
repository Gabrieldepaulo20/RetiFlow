import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_TEMPLATE_SETTINGS,
  getConfiguracaoModeloUsuario,
  upsertConfiguracaoModeloUsuario,
} from '@/api/supabase/modelos';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
}));

vi.mock('@/api/supabase/_base', () => ({
  callRPC: mocks.callRPC,
  extractDados: (envelope: { dados?: unknown }, rpcName: string) => {
    if (envelope.dados === undefined || envelope.dados === null) {
      throw new Error(`[${rpcName}] Campo 'dados' ausente na resposta.`);
    }
    return envelope.dados;
  },
}));

describe('Supabase model template wrappers', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
  });

  it('keeps safe defaults for users without custom settings', () => {
    expect(DEFAULT_USER_TEMPLATE_SETTINGS).toEqual({
      osModelo: 'auto',
      corDocumento: '#1a7a8a',
      fechamentoModelo: 'moderno',
      corFechamento: '#0f7f95',
    });
  });

  it('loads and maps a user template configuration', async () => {
    mocks.callRPC.mockResolvedValue({
      status: 200,
      mensagem: 'ok',
      dados: {
        fk_usuarios: 'user-1',
        os_modelo: 'a4_vertical',
        cor_documento: '#1e3a5f',
        fechamento_modelo: 'compacto',
        cor_fechamento: '#8b2252',
        updated_at: '2026-04-29T10:00:00.000Z',
      },
    });

    await expect(getConfiguracaoModeloUsuario('user-1')).resolves.toEqual({
      fkUsuarios: 'user-1',
      osModelo: 'a4_vertical',
      corDocumento: '#1e3a5f',
      fechamentoModelo: 'compacto',
      corFechamento: '#8b2252',
      updatedAt: '2026-04-29T10:00:00.000Z',
    });
    expect(mocks.callRPC).toHaveBeenCalledWith('get_configuracao_modelo_usuario', {
      p_fk_usuarios: 'user-1',
    });
  });

  it('persists a user template configuration through the RPC contract', async () => {
    mocks.callRPC.mockResolvedValue({
      status: 200,
      mensagem: 'ok',
      dados: {
        fk_usuarios: 'user-1',
        os_modelo: 'a5_duplo',
        cor_documento: '#2d7d46',
        fechamento_modelo: 'moderno',
        cor_fechamento: '#c05621',
        updated_at: null,
      },
    });

    await expect(upsertConfiguracaoModeloUsuario({
      idUsuarios: 'user-1',
      osModelo: 'a5_duplo',
      corDocumento: '#2d7d46',
      fechamentoModelo: 'moderno',
      corFechamento: '#c05621',
    })).resolves.toMatchObject({
      fkUsuarios: 'user-1',
      osModelo: 'a5_duplo',
      corDocumento: '#2d7d46',
      fechamentoModelo: 'moderno',
      corFechamento: '#c05621',
    });
    expect(mocks.callRPC).toHaveBeenCalledWith('upsert_configuracao_modelo_usuario', {
      p_fk_usuarios: 'user-1',
      p_os_modelo: 'a5_duplo',
      p_cor_documento: '#2d7d46',
      p_fechamento_modelo: 'moderno',
      p_cor_fechamento: '#c05621',
    });
  });
});
