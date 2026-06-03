import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callRpc, createServiceClient, getTestEnv, signInAsTestUser } from './helpers/client';
import { ensureTestUser, TEST_PREFIX } from './helpers/seed';
import { getIntegrationEnvStatus, warnIntegrationSkipped } from './helpers/env';

const skipIntegration = !getIntegrationEnvStatus().configured;
if (skipIntegration) warnIntegrationSkipped('notas.test');

describe.skipIf(skipIntegration)('Notas de entrada — integração real com Supabase', () => {
  const createdNoteIds = new Set<string>();
  const createdClientIds = new Set<string>();
  const createdVehicleIds = new Set<string>();
  const serviceDescription = `${TEST_PREFIX} Linha somente descritiva`;

  beforeAll(async () => {
    const env = getTestEnv();
    await ensureTestUser(env.testUserEmail, env.testUserPassword);
  });

  afterAll(async () => {
    const service = createServiceClient();
    const noteIds = [...createdNoteIds];

    if (noteIds.length > 0) {
      await service.schema('RetificaPremium').from('Rel_NotaS_Serv').delete().in('fk_notas_servico', noteIds);
      await service.schema('RetificaPremium').from('Notas_de_Servico').delete().in('id_notas_servico', noteIds);
    }

    const clientIds = [...createdClientIds];
    if (clientIds.length > 0) {
      await service.schema('RetificaPremium').from('Clientes').delete().in('id_clientes', clientIds);
    }

    const vehicleIds = [...createdVehicleIds];
    if (vehicleIds.length > 0) {
      await service.schema('RetificaPremium').from('Veiculos').delete().in('id_veiculos', vehicleIds);
    }

    await service
      .schema('RetificaPremium')
      .from('Servicos_ou_Itens')
      .delete()
      .ilike('nome', `${TEST_PREFIX}%`);
  });

  it('cria e atualiza O.S. sem placa com linha apenas descritiva', async () => {
    const { client } = await signInAsTestUser();
    const suffix = String(Date.now()).slice(-8);

    const createdClient = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${TEST_PREFIX} Cliente Nota Sem Placa ${suffix}`,
        documento: `8${suffix.padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });
    expect(createdClient.status).toBe(200);
    const clientId = createdClient.id_cliente as string;
    createdClientIds.add(clientId);

    const createdNote = await callRpc(client, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `${TEST_PREFIX} OS-${suffix}`,
        fk_clientes: clientId,
        defeito: 'Serviço com observação descritiva',
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
        veiculo: {
          modelo: 'Motor de teste',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [
          {
            descricao: serviceDescription,
            quantidade: 1,
            valor: 0,
            desconto: 0,
          },
        ],
      },
    });

    expect(createdNote.status).toBe(200);
    const noteId = createdNote.id_nota as string;
    createdNoteIds.add(noteId);

    const details = await callRpc(client, 'get_nota_servico_detalhes', {
      p_id_nota_servico: noteId,
    });
    expect(details.status).toBe(200);
    expect((details.cabecalho as { veiculo: { placa: string | null; id: string } }).veiculo.placa).toBeNull();
    createdVehicleIds.add((details.cabecalho as { veiculo: { id: string } }).veiculo.id);
    expect(details.itens_servico).toContainEqual(expect.objectContaining({
      descricao: serviceDescription,
      preco_unitario: 0,
      subtotal_item: 0,
    }));

    const updated = await callRpc(client, 'update_nota_servico', {
      p_payload: {
        id_notas_servico: noteId,
        veiculo: {
          modelo: 'Motor de teste atualizado',
          placa: '',
          km: 10,
          motor: 'Gasolina',
        },
        itens: [
          {
            descricao: serviceDescription,
            quantidade: 1,
            valor: 0,
            desconto: 0,
          },
        ],
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
      },
    });

    expect(updated.status).toBe(200);
    const updatedDetails = await callRpc(client, 'get_nota_servico_detalhes', {
      p_id_nota_servico: noteId,
    });
    expect(updatedDetails.status).toBe(200);
    expect((updatedDetails.cabecalho as { veiculo: { placa: string | null } }).veiculo.placa).toBeNull();
    expect(updatedDetails.itens_servico).toContainEqual(expect.objectContaining({
      descricao: serviceDescription,
      preco_unitario: 0,
      subtotal_item: 0,
    }));

    await client.auth.signOut();
  });
});
