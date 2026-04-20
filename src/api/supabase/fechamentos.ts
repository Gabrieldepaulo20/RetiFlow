import { callRPC } from './_base';

export async function getFechamentos(params?: {
  p_fk_clientes?: string;
  p_periodo?: string;
  p_limite?: number;
  p_offset?: number;
}) {
  const env = await callRPC('get_fechamentos', params);
  return { dados: (env.dados ?? []) as unknown[], total: env.total ?? 0 };
}

export async function getFechamentoDetalhes(idFechamentos: string) {
  const env = await callRPC('get_fechamento_detalhes', { p_id_fechamentos: idFechamentos });
  return env as unknown as Record<string, unknown>;
}

export async function insertFechamento(params: {
  p_fk_clientes: string;
  p_mes: string;
  p_ano: number;
  p_periodo: string;
  p_label: string;
  p_valor_total: number;
}) {
  const env = await callRPC('insert_fechamento', params);
  return env.id_fechamentos as string;
}

export async function updateFechamento(
  idFechamentos: string,
  dados: Partial<{ p_label: string; p_valor_total: number }>,
) {
  await callRPC('update_fechamento', { p_id_fechamentos: idFechamentos, ...dados });
}

export async function registrarAcaoFechamento(params: {
  p_id_fechamentos: string;
  p_tipo: string;
  p_mensagem?: string;
}) {
  await callRPC('registrar_acao_fechamento', params);
}
