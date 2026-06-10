import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ativarTemaDocumento,
  getHistoricoConfiguracoesUsuario,
  getModelosDocumentosUsuario,
  getTemasDocumentosUsuario,
  publicarModeloDocumento,
  resolverConfiguracaoDocumento,
  restaurarModeloDocumentoPadrao,
  salvarRascunhoModeloDocumento,
  salvarTemaDocumento,
} from '@/api/supabase/documentos';

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

const templateRow = {
  id_templates_documentos_usuario: 'template-1',
  fk_usuarios: 'user-1',
  document_type: 'entry_note',
  name: 'Nota de entrada',
  status: 'draft',
  version: 2,
  config_json: { title: 'O.S. {{service_order_number}}', theme: { primaryColor: '#123456' } },
  created_by: 'actor-1',
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T11:00:00.000Z',
  published_at: null,
  archived_at: null,
};

const themeRow = {
  id_temas_documentos_usuario: 'theme-1',
  fk_usuarios: 'user-1',
  name: 'Outubro Rosa',
  config_json: { primaryColor: '#d94684', secondaryColor: '#831843' },
  applies_to_json: ['entry_note', 'closing_report'],
  starts_at: '2026-10-01',
  ends_at: '2026-10-31',
  is_active: true,
  created_by: 'actor-1',
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T11:00:00.000Z',
};

describe('Supabase document customization wrappers', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
  });

  it('loads document templates and maps snake_case rows', async () => {
    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok', dados: [templateRow] });

    await expect(getModelosDocumentosUsuario('user-1')).resolves.toMatchObject([
      {
        id: 'template-1',
        fkUsuarios: 'user-1',
        documentType: 'entry_note',
        status: 'draft',
        version: 2,
        config: { title: 'O.S. {{service_order_number}}' },
      },
    ]);
    expect(mocks.callRPC).toHaveBeenCalledWith('get_modelos_documentos_usuario', {
      p_fk_usuarios: 'user-1',
    });
  });

  it('saves, publishes and restores templates through whitelisted RPCs', async () => {
    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok', dados: templateRow });

    await salvarRascunhoModeloDocumento({
      idUsuarios: 'user-1',
      documentType: 'entry_note',
      name: 'Nota de entrada',
      config: { title: 'O.S.' },
    });
    expect(mocks.callRPC).toHaveBeenLastCalledWith('salvar_rascunho_modelo_documento', {
      p_fk_usuarios: 'user-1',
      p_document_type: 'entry_note',
      p_name: 'Nota de entrada',
      p_config_json: { title: 'O.S.' },
    });

    await publicarModeloDocumento('template-1');
    expect(mocks.callRPC).toHaveBeenLastCalledWith('publicar_modelo_documento', {
      p_id_template: 'template-1',
    });

    await restaurarModeloDocumentoPadrao({ idUsuarios: 'user-1', documentType: 'closing_report' });
    expect(mocks.callRPC).toHaveBeenLastCalledWith('restaurar_modelo_documento_padrao', {
      p_fk_usuarios: 'user-1',
      p_document_type: 'closing_report',
    });
  });

  it('loads, saves and toggles document themes', async () => {
    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok', dados: [themeRow] });

    await expect(getTemasDocumentosUsuario('user-1')).resolves.toMatchObject([
      { id: 'theme-1', name: 'Outubro Rosa', appliesTo: ['entry_note', 'closing_report'], isActive: true },
    ]);

    mocks.callRPC.mockResolvedValue({ status: 200, mensagem: 'ok', dados: themeRow });
    await salvarTemaDocumento({
      idUsuarios: 'user-1',
      name: 'Outubro Rosa',
      config: { primaryColor: '#d94684' },
      appliesTo: ['entry_note'],
      startsAt: '2026-10-01',
      endsAt: '2026-10-31',
      isActive: true,
    });
    expect(mocks.callRPC).toHaveBeenLastCalledWith('salvar_tema_documento', {
      p_fk_usuarios: 'user-1',
      p_id_tema: null,
      p_name: 'Outubro Rosa',
      p_config_json: { primaryColor: '#d94684' },
      p_applies_to_json: ['entry_note'],
      p_starts_at: '2026-10-01',
      p_ends_at: '2026-10-31',
      p_is_active: true,
    });

    await ativarTemaDocumento('theme-1', false);
    expect(mocks.callRPC).toHaveBeenLastCalledWith('ativar_tema_documento', {
      p_id_tema: 'theme-1',
      p_is_active: false,
    });
  });

  it('resolves customization and audit records', async () => {
    mocks.callRPC.mockResolvedValueOnce({
      status: 200,
      mensagem: 'ok',
      dados: {
        fk_usuarios: 'user-1',
        document_type: 'entry_note',
        company: {
          fk_usuarios: 'user-1',
          razao_social: 'Empresa LTDA',
          nome_fantasia: 'Empresa',
          cnpj: '123',
          inscricao_estadual: '',
          inscricao_municipal: '',
          endereco: '',
          cidade: '',
          estado: '',
          cep: '',
          telefone: '',
          whatsapp: '',
          email: '',
          site: '',
          instagram: '',
          horario_atendimento: '',
          mensagem_atendimento: '',
          observacao_documentos: '',
          brand_primary_color: '#1a7a8a',
          brand_secondary_color: '#0f7f95',
          updated_at: null,
        },
        template: templateRow,
        theme: themeRow,
        resolved_config: { title: 'Resolvido', theme: { primaryColor: '#d94684' } },
      },
    });

    await expect(resolverConfiguracaoDocumento({ idUsuarios: 'user-1', documentType: 'entry_note' }))
      .resolves
      .toMatchObject({
        fkUsuarios: 'user-1',
        documentType: 'entry_note',
        company: { nomeFantasia: 'Empresa' },
        template: { id: 'template-1' },
        theme: { id: 'theme-1' },
        resolvedConfig: { title: 'Resolvido', theme: { primaryColor: '#d94684' } },
      });

    mocks.callRPC.mockResolvedValueOnce({
      status: 200,
      mensagem: 'ok',
      dados: [{
        id_logs_configuracoes_usuario: 'log-1',
        fk_usuarios: 'user-1',
        fk_actor_usuarios: 'actor-1',
        action: 'publish_template',
        entity_type: 'template',
        entity_id: 'template-1',
        before_json: null,
        after_json: { status: 'active' },
        created_at: '2026-06-10T10:00:00.000Z',
      }],
    });

    await expect(getHistoricoConfiguracoesUsuario({ idUsuarios: 'user-1', limit: 10 })).resolves.toMatchObject([
      { id: 'log-1', action: 'publish_template', after: { status: 'active' } },
    ]);
  });
});
