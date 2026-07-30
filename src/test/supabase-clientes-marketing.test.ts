import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@/types';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
}));

vi.mock('@/api/supabase/_base', () => ({
  callRPC: mocks.callRPC,
}));

import {
  clientToNovoClientePayload,
  novoCliente,
} from '@/api/supabase/clientes';

const client: Omit<Client, 'id' | 'createdAt'> = {
  name: 'Cliente Teste',
  docType: 'CPF',
  docNumber: '123.456.789-09',
  phone: '(16) 99999-9999',
  email: '',
  address: 'Rua Teste',
  city: 'Sertãozinho',
  state: 'SP',
  notes: '',
  isActive: true,
  marketingOrigin: 'GOOGLE_ADS_ROUTE',
  marketingCustomerType: 'NEW',
};

describe('atribuição confirmada ao cadastrar cliente', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
  });

  it('transporta a origem confirmada sem colocá-la no payload operacional do cliente', async () => {
    const payload = clientToNovoClientePayload(client);
    mocks.callRPC
      .mockResolvedValueOnce({ status: 200, mensagem: 'ok', id_cliente: 'client-1' })
      .mockResolvedValueOnce({ status: 200, mensagem: 'ok', atribuido: true });

    await novoCliente(payload);

    expect(mocks.callRPC).toHaveBeenNthCalledWith(1, 'novo_cliente', {
      p_payload: expect.not.objectContaining({
        marketing_origin: expect.anything(),
        marketing_customer_type: expect.anything(),
      }),
    });
    expect(mocks.callRPC).toHaveBeenNthCalledWith(2, 'record_marketing_client_origin', {
      p_client_id: 'client-1',
      p_origin: 'GOOGLE_ADS_ROUTE',
      p_customer_type: 'NEW',
    });
  });

  it('não cria confirmação manual quando a origem não foi informada', async () => {
    const payload = clientToNovoClientePayload({
      ...client,
      marketingOrigin: undefined,
    });
    mocks.callRPC.mockResolvedValueOnce({ status: 200, mensagem: 'ok', id_cliente: 'client-2' });

    await novoCliente(payload);

    expect(mocks.callRPC).toHaveBeenCalledTimes(1);
  });
});
