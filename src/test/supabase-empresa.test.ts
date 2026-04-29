import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_COMPANY_SETTINGS,
  getConfiguracaoEmpresaUsuario,
  upsertConfiguracaoEmpresaUsuario,
} from '@/api/supabase/empresa';

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

describe('Supabase company settings wrappers', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
  });

  it('keeps GAWI as the safe default company settings', () => {
    expect(DEFAULT_USER_COMPANY_SETTINGS).toMatchObject({
      razaoSocial: '59.540.218 GABRIEL WILLIAM DE PAULO',
      nomeFantasia: 'GAWI',
      cnpj: '59.540.218/0001-81',
      telefone: '(16) 98840-5275',
      email: 'gabrielwilliam208@gmail.com',
    });
  });

  it('loads and maps persisted company settings', async () => {
    mocks.callRPC.mockResolvedValue({
      status: 200,
      mensagem: 'ok',
      dados: {
        fk_usuarios: 'user-1',
        razao_social: '59.540.218 GABRIEL WILLIAM DE PAULO',
        nome_fantasia: 'GAWI',
        cnpj: '59540218000181',
        inscricao_estadual: '',
        inscricao_municipal: '',
        endereco: 'Rua Exemplo, 100',
        cidade: 'Sertãozinho',
        estado: 'SP',
        cep: '14177612',
        telefone: '(16) 98840-5275',
        email: 'gabrielwilliam208@gmail.com',
        site: 'https://gawi.com.br',
        updated_at: '2026-04-29T12:00:00.000Z',
      },
    });

    await expect(getConfiguracaoEmpresaUsuario('user-1')).resolves.toEqual({
      fkUsuarios: 'user-1',
      razaoSocial: '59.540.218 GABRIEL WILLIAM DE PAULO',
      nomeFantasia: 'GAWI',
      cnpj: '59540218000181',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      endereco: 'Rua Exemplo, 100',
      cidade: 'Sertãozinho',
      estado: 'SP',
      cep: '14177612',
      telefone: '(16) 98840-5275',
      email: 'gabrielwilliam208@gmail.com',
      site: 'https://gawi.com.br',
      updatedAt: '2026-04-29T12:00:00.000Z',
    });
    expect(mocks.callRPC).toHaveBeenCalledWith('get_configuracao_empresa_usuario', {
      p_fk_usuarios: 'user-1',
    });
  });

  it('persists company settings through the RPC contract', async () => {
    mocks.callRPC.mockResolvedValue({
      status: 200,
      mensagem: 'ok',
      dados: {
        fk_usuarios: 'user-1',
        razao_social: 'Empresa Teste Ltda',
        nome_fantasia: 'Teste',
        cnpj: '12345678000190',
        inscricao_estadual: '123',
        inscricao_municipal: '456',
        endereco: 'Av. Principal, 50',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: '01001000',
        telefone: '(11) 99999-0000',
        email: 'financeiro@teste.com',
        site: '',
        updated_at: null,
      },
    });

    await expect(upsertConfiguracaoEmpresaUsuario({
      idUsuarios: 'user-1',
      razaoSocial: 'Empresa Teste Ltda',
      nomeFantasia: 'Teste',
      cnpj: '12.345.678/0001-90',
      inscricaoEstadual: '123',
      inscricaoMunicipal: '456',
      endereco: 'Av. Principal, 50',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01001-000',
      telefone: '(11) 99999-0000',
      email: 'financeiro@teste.com',
      site: '',
    })).resolves.toMatchObject({
      fkUsuarios: 'user-1',
      razaoSocial: 'Empresa Teste Ltda',
      cnpj: '12345678000190',
    });

    expect(mocks.callRPC).toHaveBeenCalledWith('upsert_configuracao_empresa_usuario', {
      p_fk_usuarios: 'user-1',
      p_razao_social: 'Empresa Teste Ltda',
      p_nome_fantasia: 'Teste',
      p_cnpj: '12.345.678/0001-90',
      p_inscricao_estadual: '123',
      p_inscricao_municipal: '456',
      p_endereco: 'Av. Principal, 50',
      p_cidade: 'São Paulo',
      p_estado: 'SP',
      p_cep: '01001-000',
      p_telefone: '(11) 99999-0000',
      p_email: 'financeiro@teste.com',
      p_site: '',
    });
  });
});
