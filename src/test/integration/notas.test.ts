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

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureStart = new Date();
    futureStart.setDate(futureStart.getDate() + 8);
    const futureEnd = new Date();
    futureEnd.setDate(futureEnd.getDate() + 9);

    const filteredToday = await callRpc(client, 'get_notas_servico', {
      p_busca: `${TEST_PREFIX} OS-${suffix}`,
      p_data_inicio: yesterday.toISOString().slice(0, 10),
      p_data_fim: tomorrow.toISOString().slice(0, 10),
      p_limite: 5,
    });
    expect(filteredToday.status).toBe(200);
    expect(filteredToday.total).toBeGreaterThanOrEqual(1);
    expect(filteredToday.dados).toEqual(expect.arrayContaining([
      expect.objectContaining({ id_notas_servico: noteId }),
    ]));

    const filteredFuture = await callRpc(client, 'get_notas_servico', {
      p_busca: `${TEST_PREFIX} OS-${suffix}`,
      p_data_inicio: futureStart.toISOString().slice(0, 10),
      p_data_fim: futureEnd.toISOString().slice(0, 10),
      p_limite: 5,
    });
    expect(filteredFuture.status).toBe(200);
    expect(filteredFuture.total).toBe(0);
    expect(filteredFuture.dados).toEqual([]);

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

  it('bloqueia criacao de O.S. duplicada na mesma conta', async () => {
    const { client } = await signInAsTestUser();
    const suffix = String(Date.now());

    const createdClient = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${TEST_PREFIX} Cliente OS Duplicada ${suffix}`,
        documento: `7${suffix.slice(-10).padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });
    expect(createdClient.status).toBe(200);
    const clientId = createdClient.id_cliente as string;
    createdClientIds.add(clientId);

    const firstNote = await callRpc(client, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `OS-${suffix}`,
        fk_clientes: clientId,
        defeito: 'Teste de duplicidade de O.S.',
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
        veiculo: {
          modelo: 'Motor duplicidade',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [
          {
            descricao: `${TEST_PREFIX} Item duplicidade ${suffix}`,
            quantidade: 1,
            valor: 0,
            desconto: 0,
          },
        ],
      },
    });

    expect(firstNote.status).toBe(200);
    const noteId = firstNote.id_nota as string;
    createdNoteIds.add(noteId);

    const firstDetails = await callRpc(client, 'get_nota_servico_detalhes', {
      p_id_nota_servico: noteId,
    });
    expect(firstDetails.status).toBe(200);
    createdVehicleIds.add((firstDetails.cabecalho as { veiculo: { id: string } }).veiculo.id);

    const duplicatedNote = await callRpc(client, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `OS-${suffix}`,
        fk_clientes: clientId,
        defeito: 'Tentativa duplicada',
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
        veiculo: {
          modelo: 'Motor duplicidade',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [],
      },
    });

    expect(duplicatedNote.status).toBe(400);
    expect(duplicatedNote.code).toBe('duplicate_os');
    expect(duplicatedNote.mensagem).toContain('Já existe uma O.S.');

    await client.auth.signOut();
  });

  it('bloqueia O.S. equivalente numericamente com formato diferente', async () => {
    const { client } = await signInAsTestUser();
    const suffix = String(Date.now());
    const osNumber = suffix.slice(-9);

    const createdClient = await callRpc(client, 'salvar_cliente_completo', {
      p_payload: {
        nome: `${TEST_PREFIX} Cliente OS Equivalente ${suffix}`,
        documento: `6${suffix.slice(-10).padStart(10, '0')}`,
        tipo_documento: 'CPF',
        status: true,
      },
    });
    expect(createdClient.status).toBe(200);
    const clientId = createdClient.id_cliente as string;
    createdClientIds.add(clientId);

    const firstNote = await callRpc(client, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `000${osNumber}`,
        fk_clientes: clientId,
        defeito: 'Teste de O.S. numericamente equivalente',
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
        veiculo: {
          modelo: 'Motor equivalente',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [],
      },
    });

    expect(firstNote.status).toBe(200);
    const noteId = firstNote.id_nota as string;
    createdNoteIds.add(noteId);

    const firstDetails = await callRpc(client, 'get_nota_servico_detalhes', {
      p_id_nota_servico: noteId,
    });
    expect(firstDetails.status).toBe(200);
    createdVehicleIds.add((firstDetails.cabecalho as { veiculo: { id: string } }).veiculo.id);

    const equivalentNote = await callRpc(client, 'nova_nota', {
      p_payload: {
        tipo_nota: 'Serviço',
        numero_nota: `OS-${osNumber}`,
        fk_clientes: clientId,
        defeito: 'Tentativa numericamente equivalente',
        total_servicos: 0,
        total_produtos: 0,
        total: 0,
        veiculo: {
          modelo: 'Motor equivalente',
          placa: null,
          km: 0,
          motor: 'Gasolina',
        },
        itens: [],
      },
    });

    expect(equivalentNote.status).toBe(400);
    expect(equivalentNote.code).toBe('duplicate_os');
    expect(equivalentNote.mensagem).toContain('Já existe uma O.S.');

    await client.auth.signOut();
  });
});
