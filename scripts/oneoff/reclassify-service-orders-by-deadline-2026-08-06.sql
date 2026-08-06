-- One-off versionado (não é migration de schema): reclassifica as sete O.S.
-- históricas que ficaram presas ao fechamento do
-- mês da criação, embora o prazo pertença ao mês seguinte.
--
-- Autorização operacional: a Retífica Premium confirmou em 2026-08-06 que
-- nenhuma das sete O.S. foi recebida. Três delas aparecem como PAGO apenas
-- pela cascata de um fechamento pago; por isso o lançamento antigo é
-- estornado integralmente e recriado pelo valor das O.S. que permanecem.
--
-- Segurança/rollback:
-- - falha diante de qualquer drift nos sete registros, quatro fechamentos ou
--   movimento financeiro esperado;
-- - salva o estado integral anterior de cada fechamento, das O.S. removidas e
--   dos movimentos vinculados em Fechamento_Logs antes de escrever;
-- - preserva o lançamento original e cria movimentos explícitos de estorno e
--   correção, em vez de apagar histórico financeiro.
--
-- Execução segura:
--   dry-run: BEGIN; <este arquivo>; SELECT ...; ROLLBACK;
--   produção: executar o arquivo inteiro uma vez e validar as pós-condições.

do $migration$
declare
  v_total_notas integer;
  v_total_fechamentos integer;
  v_total_pagas integer;
  v_total_nominal numeric(14,2);
  v_fechamento record;
  v_movimento record;
  v_fechamento_pago uuid;
  v_json_novo jsonb;
  v_notas_json jsonb;
  v_total_original_removido numeric(14,2);
  v_total_liquido_removido numeric(14,2);
  v_total_novo numeric(14,2);
  v_inseridos integer;
begin
  -- Evita que os gatilhos de compatibilidade tentem criar lançamentos a
  -- partir dos campos-resumo enquanto a correção transacional está em curso.
  perform set_config('retiflow.financeiro_internal', 'on', true);

  -- Permite que o roteiro seja versionado/aplicado novamente depois da
  -- execução one-off, sem duplicar movimentos ou logs.
  if exists (
    select 1
    from "RetificaPremium"."Fechamento_Logs" l
    where l.tipo = 'competencia_prazo_backup_20260806'
  ) then
    if (
      select count(*)
      from "RetificaPremium"."Notas_de_Servico" n
      where n.os in (
        'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
        'OS-5950', 'OS-6407', 'OS-6355'
      )
        and n.fk_fechamentos is null
        and n.payment_status = 'PENDENTE'
        and coalesce(n.valor_recebido, 0) = 0
        and n.pago_em is null
    ) = 7
       and (
         select count(*)
         from "RetificaPremium"."Fechamento_Logs" l
         where l.tipo = 'competencia_prazo_backup_20260806'
       ) = 4
       and (
         select count(*)
         from "RetificaPremium"."Financeiro_Movimentos" m
         where m.chave_idempotencia like 'correcao:competencia-prazo:%'
       ) = 2
       and not exists (
         select 1
         from "RetificaPremium"."Fechamentos" f
         cross join lateral jsonb_array_elements(f.dados_json->'notas') e(item)
         join "RetificaPremium"."Notas_de_Servico" n
           on e.item->>'id' = n.id_notas_servico::text
         where n.os in (
           'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
           'OS-5950', 'OS-6407', 'OS-6355'
         )
       ) then
      return;
    end if;
    raise exception 'A correção possui backup, mas o estado aplicado está incompleto.';
  end if;

  perform 1
  from "RetificaPremium"."Notas_de_Servico" n
  where n.os in (
    'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
    'OS-5950', 'OS-6407', 'OS-6355'
  )
  for update;

  select count(*), count(distinct n.fk_fechamentos),
         count(*) filter (where n.payment_status = 'PAGO'),
         coalesce(sum(n.total), 0)
    into v_total_notas, v_total_fechamentos, v_total_pagas, v_total_nominal
  from "RetificaPremium"."Notas_de_Servico" n
  where n.os in (
    'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
    'OS-5950', 'OS-6407', 'OS-6355'
  );

  if v_total_notas <> 7
     or v_total_fechamentos <> 4
     or v_total_pagas <> 3
     or v_total_nominal <> 2850.00 then
    raise exception
      'Drift nas O.S. de competência: notas %, fechamentos %, pagas %, total %.',
      v_total_notas, v_total_fechamentos, v_total_pagas, v_total_nominal;
  end if;

  if exists (
    select 1
    from "RetificaPremium"."Notas_de_Servico" n
    join "RetificaPremium"."Fechamentos" f
      on f.id_fechamentos = n.fk_fechamentos
    where n.os in (
      'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
      'OS-5950', 'OS-6407', 'OS-6355'
    )
      and (
        n.prazo is null
        or date_trunc('month', n.created_at) = date_trunc('month', n.prazo)
        or extract(year from n.created_at) <> extract(year from n.prazo)
        or extract(month from n.created_at)::integer <> case lower(f.mes)
          when 'janeiro' then 1
          when 'fevereiro' then 2
          when 'março' then 3
          when 'abril' then 4
          when 'maio' then 5
          when 'junho' then 6
          when 'julho' then 7
          when 'agosto' then 8
          when 'setembro' then 9
          when 'outubro' then 10
          when 'novembro' then 11
          when 'dezembro' then 12
          else 0
        end
      )
  ) then
    raise exception 'Uma O.S. não corresponde mais ao cenário criação -> prazo auditado.';
  end if;

  if exists (
    select 1
    from "RetificaPremium"."Financeiro_Movimentos" m
    join "RetificaPremium"."Notas_de_Servico" n
      on n.id_notas_servico = m.fk_notas_servico
    where n.os in (
      'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
      'OS-5950', 'OS-6407', 'OS-6355'
    )
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
  ) then
    raise exception 'Uma O.S. possui recebimento financeiro individual; correção abortada.';
  end if;

  select f.id_fechamentos
    into strict v_fechamento_pago
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos in (
    select distinct n.fk_fechamentos
    from "RetificaPremium"."Notas_de_Servico" n
    where n.os in (
      'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
      'OS-5950', 'OS-6407', 'OS-6355'
    )
  )
    and f.status_pagamento = 'PAGO';

  for v_fechamento in
    select f.*
    from "RetificaPremium"."Fechamentos" f
    where f.id_fechamentos in (
      select distinct n.fk_fechamentos
      from "RetificaPremium"."Notas_de_Servico" n
      where n.os in (
        'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
        'OS-5950', 'OS-6407', 'OS-6355'
      )
    )
    order by f.id_fechamentos
    for update
  loop
    if v_fechamento.dados_json is null
       or jsonb_typeof(v_fechamento.dados_json->'notas') <> 'array' then
      raise exception 'Fechamento % sem snapshot de notas válido.',
        v_fechamento.id_fechamentos;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(
        coalesce(v_fechamento.dados_json->'recebidas', '[]'::jsonb)
      ) r(item)
      join "RetificaPremium"."Notas_de_Servico" n
        on r.item->>'id' = n.id_notas_servico::text
      where n.fk_fechamentos = v_fechamento.id_fechamentos
        and n.os in (
          'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
          'OS-5950', 'OS-6407', 'OS-6355'
        )
    ) then
      raise exception 'Fechamento % registra uma O.S. afetada como recebida no snapshot.',
        v_fechamento.id_fechamentos;
    end if;

    insert into "RetificaPremium"."Fechamento_Logs"(
      fk_fechamentos, tipo, mensagem, fk_usuarios
    )
    select
      v_fechamento.id_fechamentos,
      'competencia_prazo_backup_20260806',
      jsonb_build_object(
        'migration', '20260806192531',
        'motivo', 'Reclassificação pelo mês do prazo confirmada pela Retífica Premium',
        'fechamento', to_jsonb(v_fechamento),
        'notas', coalesce((
          select jsonb_agg(to_jsonb(n) order by n.os)
          from "RetificaPremium"."Notas_de_Servico" n
          where n.fk_fechamentos = v_fechamento.id_fechamentos
            and n.os in (
              'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
              'OS-5950', 'OS-6407', 'OS-6355'
            )
        ), '[]'::jsonb),
        'movimentos', coalesce((
          select jsonb_agg(to_jsonb(m) order by m.created_at)
          from "RetificaPremium"."Financeiro_Movimentos" m
          where m.fk_fechamentos = v_fechamento.id_fechamentos
        ), '[]'::jsonb)
      )::text,
      null;

    select
      coalesce(sum((item->>'total_original')::numeric), 0),
      coalesce(sum((item->>'total_com_desconto')::numeric), 0)
      into v_total_original_removido, v_total_liquido_removido
    from jsonb_array_elements(v_fechamento.dados_json->'notas') e(item)
    join "RetificaPremium"."Notas_de_Servico" n
      on e.item->>'id' = n.id_notas_servico::text
    where n.fk_fechamentos = v_fechamento.id_fechamentos
      and n.os in (
        'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
        'OS-5950', 'OS-6407', 'OS-6355'
      );

    if v_total_liquido_removido <= 0 then
      raise exception 'Fechamento % não contém as O.S. esperadas no snapshot.',
        v_fechamento.id_fechamentos;
    end if;

    select coalesce(jsonb_agg(e.item order by e.ordinalidade), '[]'::jsonb)
      into v_notas_json
    from jsonb_array_elements(v_fechamento.dados_json->'notas')
      with ordinality e(item, ordinalidade)
    where not exists (
      select 1
      from "RetificaPremium"."Notas_de_Servico" n
      where n.fk_fechamentos = v_fechamento.id_fechamentos
        and n.os in (
          'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
          'OS-5950', 'OS-6407', 'OS-6355'
        )
        and e.item->>'id' = n.id_notas_servico::text
    );

    if jsonb_array_length(v_notas_json) = 0 then
      raise exception 'A correção deixaria o fechamento % vazio.',
        v_fechamento.id_fechamentos;
    end if;

    v_total_novo := round(
      (v_fechamento.dados_json->>'total_com_desconto')::numeric
        - v_total_liquido_removido,
      2
    );
    if v_total_novo <= 0 then
      raise exception 'Total inválido após correção do fechamento %.',
        v_fechamento.id_fechamentos;
    end if;

    v_json_novo := jsonb_set(
      jsonb_set(
        jsonb_set(
          v_fechamento.dados_json,
          '{notas}',
          v_notas_json,
          false
        ),
        '{total_original}',
        to_jsonb(round(
          (v_fechamento.dados_json->>'total_original')::numeric
            - v_total_original_removido,
          2
        )),
        false
      ),
      '{total_com_desconto}',
      to_jsonb(v_total_novo),
      false
    );

    update "RetificaPremium"."Fechamentos"
       set valor_total = v_total_novo,
           dados_json = v_json_novo,
           versao = coalesce(versao, 1) + 1,
           total_edicoes = coalesce(total_edicoes, 0) + 1,
           updated_at = now()
     where id_fechamentos = v_fechamento.id_fechamentos;

    insert into "RetificaPremium"."Fechamento_Logs"(
      fk_fechamentos, tipo, mensagem, fk_usuarios
    ) values (
      v_fechamento.id_fechamentos,
      'competencia_prazo_corrigida',
      jsonb_build_object(
        'migration', '20260806192531',
        'total_anterior', v_fechamento.valor_total,
        'total_removido', v_total_liquido_removido,
        'total_corrigido', v_total_novo,
        'pdf_regeneracao_necessaria', true
      )::text,
      null
    );
  end loop;

  -- As sete voltam a ficar disponíveis para um fechamento pelo prazo. As três
  -- PAGO não tinham lançamento individual; o status veio somente da cascata.
  update "RetificaPremium"."Notas_de_Servico"
     set fk_fechamentos = null,
         payment_status = 'PENDENTE',
         valor_recebido = 0,
         pago_em = null,
         pago_com = null,
         updated_at = now()
   where os in (
     'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
     'OS-5950', 'OS-6407', 'OS-6355'
   );

  -- O fechamento pago teve R$ 902,00 de O.S. removidas. Preservamos o
  -- movimento original, criamos o estorno integral auditável e registramos um
  -- novo recebimento pelo total corrigido das dez O.S. que permaneceram.
  select m.*
    into strict v_movimento
  from "RetificaPremium"."Financeiro_Movimentos" m
  where m.fk_fechamentos = v_fechamento_pago
    and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
    and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
    and m.estornado_em is null
  for update;

  update "RetificaPremium"."Financeiro_Movimentos"
     set estornado_em = now(),
         motivo_estorno = 'Correção de competência: O.S. movidas para o mês do prazo',
         fk_estornado_por = v_movimento.fk_criado_por
   where id_financeiro_movimentos = v_movimento.id_financeiro_movimentos;

  insert into "RetificaPremium"."Financeiro_Movimentos"(
    fk_criado_por, fk_financeiro_contas, direcao, tipo_movimento, valor,
    data_efetiva, data_competencia, forma_pagamento, descricao, observacoes,
    status, impacta_dre, fk_fechamentos, fk_movimento_origem,
    chave_idempotencia, fk_registrado_por, motivo_estorno, metadata
  ) values (
    v_movimento.fk_criado_por,
    v_movimento.fk_financeiro_contas,
    'SAIDA',
    'ESTORNO',
    v_movimento.valor,
    v_movimento.data_efetiva,
    v_movimento.data_competencia,
    v_movimento.forma_pagamento,
    'Estorno técnico - correção de competência do fechamento',
    'Preserva o lançamento original antes de retirar as O.S. cujo prazo pertence ao mês seguinte.',
    v_movimento.status,
    false,
    v_fechamento_pago,
    v_movimento.id_financeiro_movimentos,
    'correcao:competencia-prazo:estorno:' || v_fechamento_pago::text,
    v_movimento.fk_criado_por,
    'Correção de competência: O.S. movidas para o mês do prazo',
    jsonb_build_object(
      'correcao_competencia', true,
      'migration', '20260806192531',
      'movimento_original', v_movimento.id_financeiro_movimentos
    )
  )
  on conflict do nothing;
  get diagnostics v_inseridos = row_count;
  if v_inseridos <> 1 then
    raise exception 'Não foi possível registrar o estorno auditável do fechamento pago.';
  end if;

  select f.valor_total
    into strict v_total_novo
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = v_fechamento_pago;

  insert into "RetificaPremium"."Financeiro_Movimentos"(
    fk_criado_por, fk_financeiro_contas, direcao, tipo_movimento, valor,
    data_efetiva, data_competencia, forma_pagamento, descricao, observacoes,
    status, impacta_dre, fk_fechamentos, chave_idempotencia,
    fk_registrado_por, metadata
  ) values (
    v_movimento.fk_criado_por,
    v_movimento.fk_financeiro_contas,
    'ENTRADA',
    'RECEBIMENTO_FECHAMENTO',
    v_total_novo,
    v_movimento.data_efetiva,
    v_movimento.data_competencia,
    v_movimento.forma_pagamento,
    'Recebimento corrigido após reclassificação por prazo',
    'Mantém somente as O.S. que permaneceram no fechamento de origem.',
    v_movimento.status,
    false,
    v_fechamento_pago,
    'correcao:competencia-prazo:recebimento:' || v_fechamento_pago::text,
    v_movimento.fk_criado_por,
    jsonb_build_object(
      'correcao_competencia', true,
      'migration', '20260806192531',
      'substitui_movimento', v_movimento.id_financeiro_movimentos
    )
  )
  on conflict do nothing;
  get diagnostics v_inseridos = row_count;
  if v_inseridos <> 1 then
    raise exception 'Não foi possível registrar o recebimento corrigido.';
  end if;

  perform "RetificaPremium".financeiro_recalcular_origem(
    null, v_fechamento_pago, null, null
  );

  if (
    select count(*)
    from "RetificaPremium"."Notas_de_Servico" n
    where n.os in (
      'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
      'OS-5950', 'OS-6407', 'OS-6355'
    )
      and n.fk_fechamentos is null
      and n.payment_status = 'PENDENTE'
      and coalesce(n.valor_recebido, 0) = 0
      and n.pago_em is null
  ) <> 7 then
    raise exception 'Pós-condição falhou: as sete O.S. não ficaram pendentes e sem fechamento.';
  end if;

  if exists (
    select 1
    from "RetificaPremium"."Fechamentos" f
    cross join lateral jsonb_array_elements(f.dados_json->'notas') e(item)
    join "RetificaPremium"."Notas_de_Servico" n
      on e.item->>'id' = n.id_notas_servico::text
    where n.os in (
      'OS-5937', 'OS-5948', 'OS-6035', 'OS-8242',
      'OS-5950', 'OS-6407', 'OS-6355'
    )
  ) then
    raise exception 'Pós-condição falhou: uma O.S. ainda aparece em snapshot de fechamento.';
  end if;

  if exists (
    select 1
    from "RetificaPremium"."Fechamentos" f
    where f.id_fechamentos in (
      select distinct l.fk_fechamentos
      from "RetificaPremium"."Fechamento_Logs" l
      where l.tipo = 'competencia_prazo_backup_20260806'
    )
      and round(f.valor_total, 2)
        <> round((f.dados_json->>'total_com_desconto')::numeric, 2)
  ) then
    raise exception 'Pós-condição falhou: total e snapshot de fechamento divergiram.';
  end if;

  if (
    select round(coalesce(sum(case
      when m.direcao = 'ENTRADA' then m.valor else -m.valor
    end), 0), 2)
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = v_fechamento_pago
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
  ) <> (
    select round(f.valor_total, 2)
    from "RetificaPremium"."Fechamentos" f
    where f.id_fechamentos = v_fechamento_pago
  ) then
    raise exception 'Pós-condição falhou: recebimento líquido do fechamento pago está divergente.';
  end if;
end;
$migration$;

-- Rollback manual, se necessário:
-- 1. Ler os quatro logs tipo competencia_prazo_backup_20260806.
-- 2. Restaurar Fechamentos a partir de mensagem::jsonb->'fechamento'.
-- 3. Restaurar as sete Notas_de_Servico a partir de mensagem::jsonb->'notas'.
-- 4. Remover os dois movimentos com chave correcao:competencia-prazo:* e
--    limpar estornado_em/motivo_estorno/fk_estornado_por do movimento original
--    guardado no backup.
-- 5. Executar financeiro_recalcular_origem para o fechamento pago e regenerar
--    os quatro PDFs. Nunca apagar os logs de backup/auditoria.
