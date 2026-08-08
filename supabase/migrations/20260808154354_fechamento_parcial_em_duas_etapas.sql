-- Fechamentos em ate duas parcelas.
-- Versao registrada na producao: 20260808154354.
--
-- Objetivos desta migration:
--   * finalizar cabecalho, snapshot, vinculos de O.S. e recebimento inicial em
--     uma unica transacao;
--   * aceitar no maximo duas parcelas ativas, sendo a segunda exatamente o
--     saldo restante;
--   * proteger repeticoes por idempotencia e concorrencia entre abas;
--   * manter historico auditavel, comprovantes privados e estorno LIFO;
--   * retirar o acesso REST direto a Fechamentos, preservando as RPCs legadas.
--
-- O PDF e propositalmente posterior a transacao principal. O frontend cria o
-- fechamento primeiro, faz o upload privado e chama atualizar_pdf_fechamento.
-- Assim uma falha de Storage deixa um PDF pendente recuperavel, nunca uma
-- cobranca ou vinculo de O.S. parcialmente gravado.

-- ---------------------------------------------------------------------------
-- 1. Idempotencia do fechamento e pre-condicoes de implantacao
-- ---------------------------------------------------------------------------

alter table "RetificaPremium"."Fechamentos"
  add column if not exists chave_idempotencia text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = '"RetificaPremium"."Fechamentos"'::regclass
      and c.conname = 'fechamentos_chave_idempotencia_chk'
  ) then
    alter table "RetificaPremium"."Fechamentos"
      add constraint fechamentos_chave_idempotencia_chk
      check (
        chave_idempotencia is null
        or char_length(btrim(chave_idempotencia)) between 8 and 200
      );
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from "RetificaPremium"."Fechamentos" f
    left join lateral (
      select greatest(
        coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0),
        0
      ) realizado
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_fechamentos = f.id_fechamentos
        and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
    ) razao on true
    where abs(
      least(razao.realizado, greatest(f.valor_total, 0))
      - coalesce(f.valor_recebido, 0)
    ) > 0.004
  ) then
    raise exception
      'Ha divergencia entre o razao e o resumo de fechamentos; concilie antes da migration.';
  end if;
end;
$$;

create unique index if not exists fechamentos_chave_idempotencia_uidx
  on "RetificaPremium"."Fechamentos" (chave_idempotencia)
  where chave_idempotencia is not null;

-- Nao ativar silenciosamente a regra sobre um estado que ja a viole. O
-- levantamento anterior encontrou no maximo uma parcela ativa por fechamento.
do $$
begin
  if exists (
    select 1
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.estornado_em is null
      and m.fk_fechamentos is not null
    group by m.fk_fechamentos
    having count(*) > 2
  ) then
    raise exception
      'Existem fechamentos com mais de duas parcelas ativas; concilie-os antes da migration.';
  end if;
end;
$$;

-- O acesso ao cadastro do tenant nao substitui o entitlement do modulo. As
-- RPCs de fechamento usam este guard no servidor, inclusive quando chamadas
-- diretamente fora da interface.
create or replace function "RetificaPremium".assert_fechamento_target_access(
  p_usuario_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_usuario_id is null or not exists (
    select 1
    from "RetificaPremium"."Usuarios" u
    join "RetificaPremium"."Modulos" m
      on m.fk_usuarios = u.id_usuarios
    where u.id_usuarios = p_usuario_id
      and u.status = true
      and m.fechamento = true
  ) then
    raise exception 'Modulo Fechamento nao habilitado para este usuario.'
      using errcode = 'P0403';
  end if;
end;
$$;

create or replace function "RetificaPremium".require_fechamento_usuario_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_current_usuario_id();
begin
  perform "RetificaPremium".assert_fechamento_target_access(v_usuario);
  return v_usuario;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Resumos financeiros: data e forma devem vir do ultimo movimento ativo
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".financeiro_recalcular_origem(
  p_nota_id uuid default null,
  p_fechamento_id uuid default null,
  p_conta_pagar_id uuid default null,
  p_recebivel_manual_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(14,2);
  v_realizado numeric(14,2);
  v_status text;
  v_data timestamptz;
  v_forma text;
begin
  perform set_config('retiflow.financeiro_internal', 'on', true);

  if p_nota_id is not null then
    select greatest(coalesce(n.total, 0), 0)
      into v_total
    from "RetificaPremium"."Notas_de_Servico" n
    where n.id_notas_servico = p_nota_id
    for update;

    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (
             where m.direcao = 'ENTRADA' and m.estornado_em is null
           )
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_notas_servico = p_nota_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_notas_servico = p_nota_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'ENTRADA'
      and m.estornado_em is null
    order by m.data_efetiva desc, m.created_at desc, m.id_financeiro_movimentos desc
    limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Notas_de_Servico"
       set valor_recebido = least(v_realizado, v_total),
           payment_status = v_status,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case when v_realizado > 0 then v_forma else null end
     where id_notas_servico = p_nota_id;
  end if;

  if p_fechamento_id is not null then
    select greatest(coalesce(f.valor_total, 0), 0)
      into v_total
    from "RetificaPremium"."Fechamentos" f
    where f.id_fechamentos = p_fechamento_id
    for update;

    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (
             where m.direcao = 'ENTRADA' and m.estornado_em is null
           )
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = p_fechamento_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = p_fechamento_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'ENTRADA'
      and m.estornado_em is null
    order by m.data_efetiva desc, m.created_at desc, m.id_financeiro_movimentos desc
    limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Fechamentos"
       set valor_recebido = least(v_realizado, v_total),
           status_pagamento = v_status,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case when v_realizado > 0 then v_forma else null end,
           updated_at = now()
     where id_fechamentos = p_fechamento_id;

    -- Compatibilidade visual: as filhas refletem o fechamento, mas nunca
    -- recebem lancamentos proprios no razao.
    with independentes as (
      select n2.id_notas_servico,
             coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0) valor,
             max(m.data_efetiva) filter (
               where m.direcao = 'ENTRADA' and m.estornado_em is null
             ) at time zone 'America/Sao_Paulo' data_efetiva,
             (array_agg(
                m.forma_pagamento
                order by m.data_efetiva desc, m.created_at desc, m.id_financeiro_movimentos desc
              ) filter (
                where m.forma_pagamento is not null
                  and m.direcao = 'ENTRADA'
                  and m.estornado_em is null
              ))[1] forma_pagamento
      from "RetificaPremium"."Notas_de_Servico" n2
      left join "RetificaPremium"."Financeiro_Movimentos" m
        on m.fk_notas_servico = n2.id_notas_servico
       and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      where n2.fk_fechamentos = p_fechamento_id
      group by n2.id_notas_servico
    )
    update "RetificaPremium"."Notas_de_Servico" n
       set valor_recebido = case when v_status = 'PAGO' then n.total
             else least(n.total, greatest(coalesce(ind.valor, 0), 0)) end,
           payment_status = case
             when v_status = 'PAGO' or coalesce(ind.valor, 0) + 0.004 >= n.total then 'PAGO'
             when coalesce(ind.valor, 0) > 0.004 then 'PARCIAL' else 'PENDENTE' end,
           pago_em = case
             when v_status = 'PAGO' then v_data at time zone 'America/Sao_Paulo'
             when coalesce(ind.valor, 0) > 0.004 then ind.data_efetiva else null end,
           pago_com = case
             when v_status = 'PAGO' then v_forma
             when coalesce(ind.valor, 0) > 0.004 then ind.forma_pagamento else null end
      from independentes ind
     where n.id_notas_servico = ind.id_notas_servico;
  end if;

  if p_conta_pagar_id is not null then
    select greatest(coalesce(c.valor_final, 0), 0)
      into v_total
    from "RetificaPremium"."Contas_Pagar" c
    where c.id_contas_pagar = p_conta_pagar_id
    for update;

    select coalesce(sum(case when m.direcao = 'SAIDA' then m.valor else -m.valor end), 0),
           max(m.data_efetiva) filter (
             where m.direcao = 'SAIDA' and m.estornado_em is null
           )
      into v_realizado, v_data
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_contas_pagar = p_conta_pagar_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');

    select m.forma_pagamento into v_forma
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_contas_pagar = p_conta_pagar_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.direcao = 'SAIDA'
      and m.estornado_em is null
    order by m.data_efetiva desc, m.created_at desc, m.id_financeiro_movimentos desc
    limit 1;

    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    v_status := case
      when v_realizado <= 0.004 then 'PENDENTE'
      when v_realizado + 0.004 >= v_total then 'PAGO'
      else 'PARCIAL'
    end;
    update "RetificaPremium"."Contas_Pagar"
       set valor_pago = least(v_realizado, v_total),
           status = v_status::"RetificaPremium".status_conta_pagar,
           pago_em = case when v_realizado > 0
             then v_data at time zone 'America/Sao_Paulo' else null end,
           pago_com = case
             when v_realizado > 0 and v_forma is not null
               then v_forma::"RetificaPremium".forma_pagamento
             else null
           end,
           updated_at = now()
     where id_contas_pagar = p_conta_pagar_id;
  end if;

  if p_recebivel_manual_id is not null then
    select r.valor_previsto into v_total
    from "RetificaPremium"."Financeiro_Recebiveis_Manuais" r
    where r.id_financeiro_recebiveis_manuais = p_recebivel_manual_id
    for update;
    select coalesce(sum(case when m.direcao = 'ENTRADA' then m.valor else -m.valor end), 0)
      into v_realizado
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_recebivel_manual = p_recebivel_manual_id
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR');
    v_realizado := greatest(coalesce(v_realizado, 0), 0);
    update "RetificaPremium"."Financeiro_Recebiveis_Manuais"
       set valor_recebido = least(v_realizado, v_total),
           status = case
             when v_realizado <= 0.004 then 'PENDENTE'
             when v_realizado + 0.004 >= v_total then 'PAGO'
             else 'PARCIAL'
           end,
           updated_at = now()
     where id_financeiro_recebiveis_manuais = p_recebivel_manual_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Core unico de recebimento e wrappers compativeis
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text,
  p_observacoes text,
  p_idempotency_key text,
  p_valor_recebido_esperado numeric
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_item record;
  v_conta uuid;
  v_mov uuid;
  v_competencia date;
  v_forma text := nullif(btrim(p_forma_pagamento), '');
  v_observacoes text := nullif(btrim(p_observacoes), '');
  v_valor numeric(14,2);
  v_esperado numeric(14,2);
  v_recebido numeric(14,2);
  v_saldo numeric(14,2);
  v_status text;
  v_ativas integer;
  v_inserido boolean := false;
begin
  perform "RetificaPremium".assert_fechamento_target_access(v_usuario);

  if p_valor is null or p_valor <= 0 or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key), '') is null
     or char_length(p_idempotency_key) > 200 then
    raise exception 'Valor, data e chave de idempotencia sao obrigatorios.'
      using errcode = 'P0602';
  end if;
  if char_length(coalesce(p_observacoes, '')) > 1000 then
    raise exception 'As observacoes devem ter no maximo 1000 caracteres.'
      using errcode = 'P0602';
  end if;
  if v_forma is not null and v_forma not in (
    'PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO_CREDITO',
    'CARTAO_DEBITO', 'DINHEIRO', 'CHEQUE', 'DEBITO_AUTOMATICO'
  ) then
    raise exception 'Forma de pagamento invalida.' using errcode = 'P0602';
  end if;

  v_valor := round(p_valor, 2);
  if abs(p_valor - v_valor) > 0.004 then
    raise exception 'O valor da parcela deve ter no maximo duas casas decimais.'
      using errcode = 'P0602';
  end if;

  if p_valor_recebido_esperado is not null then
    if p_valor_recebido_esperado < 0 then
      raise exception 'O valor recebido esperado nao pode ser negativo.'
        using errcode = 'P0602';
    end if;
    v_esperado := round(p_valor_recebido_esperado, 2);
    if abs(p_valor_recebido_esperado - v_esperado) > 0.004 then
      raise exception 'O valor recebido esperado deve ter no maximo duas casas decimais.'
        using errcode = 'P0602';
    end if;
  end if;

  -- Ordem global de concorrencia: fechamento -> idempotencia -> row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario, p_idempotency_key
  );

  select f.*, c.fk_criado_por owner_id, c.nome cliente_nome
    into v_item
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos
  for update of f;

  if not found then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if v_item.owner_id is distinct from v_usuario then
    raise exception 'Sem permissao.' using errcode = 'P0403';
  end if;

  v_competencia := coalesce(v_item.vencimento_em, v_item.data_fechamento::date);

  -- Clientes legados podem omitir a conta. Em retry, reutilizar a conta que a
  -- primeira chamada efetivamente gravou; em operacao nova, a conta padrao so
  -- e resolvida depois de confirmar que a chave ainda nao existe. Isso mantem
  -- retries validos mesmo se a conta tiver sido inativada posteriormente.
  v_conta := p_fk_conta_financeira;
  if v_conta is null then
    select m.fk_financeiro_contas
      into v_conta
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por = v_usuario
      and m.chave_idempotencia = p_idempotency_key;
  end if;

  -- A repeticao da mesma chave vem antes das regras de estado. Assim um retry
  -- continua idempotente mesmo se a primeira chamada ja mudou o saldo.
  v_mov := "RetificaPremium".financeiro_movimento_por_idempotencia(
    v_usuario, p_idempotency_key, 'ENTRADA', 'RECEBIMENTO_FECHAMENTO', v_valor,
    p_data_efetiva, v_competencia, v_conta, v_forma, 'CONFIRMADO', false,
    null, null, null, p_id_fechamentos, null, null, null, null
  );

  if v_mov is not null then
    if exists (
      select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.id_financeiro_movimentos = v_mov
        and m.observacoes is distinct from v_observacoes
    ) then
      raise exception 'Chave de idempotencia usada com observacoes diferentes.'
        using errcode = 'P0602';
    end if;
  else
    v_conta := "RetificaPremium".financeiro_validar_conta(
      v_usuario, v_conta
    );
    perform "RetificaPremium".financeiro_validar_data_conta(v_conta, p_data_efetiva);

    v_recebido := round(coalesce(v_item.valor_recebido, 0), 2);
    if v_esperado is not null and v_recebido is distinct from v_esperado then
      raise exception
        'O fechamento foi alterado em outra aba. Recarregue antes de registrar a parcela.'
        using errcode = 'P4094';
    end if;

    select count(*)::integer
      into v_ativas
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = p_id_fechamentos
      and m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.estornado_em is null;

    if v_ativas >= 2 then
      raise exception 'O fechamento ja possui as duas parcelas permitidas.'
        using errcode = 'P0602';
    end if;

    v_saldo := round(greatest(v_item.valor_total - v_recebido, 0), 2);
    if v_saldo <= 0.004 then
      raise exception 'O fechamento ja esta integralmente recebido.'
        using errcode = 'P0602';
    end if;
    if v_valor > v_saldo then
      raise exception 'Recebimento excede o valor liquido em aberto.'
        using errcode = 'P0602';
    end if;
    if (v_ativas = 1 or v_recebido > 0.004) and v_valor is distinct from v_saldo then
      raise exception 'A segunda parcela deve quitar exatamente o saldo restante.'
        using errcode = 'P0602';
    end if;

    insert into "RetificaPremium"."Financeiro_Movimentos" (
      fk_criado_por, fk_financeiro_contas, direcao, tipo_movimento, valor,
      data_efetiva, data_competencia, forma_pagamento, descricao, observacoes,
      impacta_dre, fk_fechamentos, chave_idempotencia, fk_registrado_por, metadata
    ) values (
      v_usuario, v_conta, 'ENTRADA', 'RECEBIMENTO_FECHAMENTO', v_valor,
      p_data_efetiva, v_competencia, v_forma,
      'Recebimento de fechamento - ' || coalesce(v_item.cliente_nome, v_item.label, 'Cliente'),
      v_observacoes, false, p_id_fechamentos, p_idempotency_key, v_usuario,
      jsonb_build_object('parcela_fechamento', v_ativas + 1)
    )
    on conflict (fk_criado_por, chave_idempotencia)
      where chave_idempotencia is not null do nothing
    returning id_financeiro_movimentos into v_mov;

    v_inserido := v_mov is not null;
    if v_mov is null then
      v_mov := "RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario, p_idempotency_key, 'ENTRADA', 'RECEBIMENTO_FECHAMENTO', v_valor,
        p_data_efetiva, v_competencia, v_conta, v_forma, 'CONFIRMADO', false,
        null, null, null, p_id_fechamentos, null, null, null, null
      );
    end if;
    if v_mov is null then
      raise exception 'Falha ao confirmar idempotencia do fechamento.'
        using errcode = 'P0602';
    end if;
    if v_inserido then
      perform "RetificaPremium".financeiro_recalcular_origem(
        null, p_id_fechamentos, null, null
      );
    end if;
  end if;

  select f.valor_recebido, f.status_pagamento,
         greatest(f.valor_total - f.valor_recebido, 0)
    into v_recebido, v_status, v_saldo
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = p_id_fechamentos;

  return json_build_object(
    'status', 200,
    'mensagem', 'Recebimento do fechamento registrado.',
    'dados', json_build_object(
      'id_movimento', v_mov,
      'movimento_id', v_mov,
      'status', v_status,
      'valor_realizado', v_recebido,
      'valor_recebido', v_recebido,
      'valor_aberto', v_saldo,
      'idempotent_retry', not v_inserido
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Estorno de parcela: somente administrador e sempre em ordem LIFO
-- ---------------------------------------------------------------------------

-- A regra tambem e aplicada na RPC generica. Sem isso, um cliente poderia
-- ignorar estornar_parcela_fechamento e chamar a funcao generica diretamente.
create or replace function "RetificaPremium".estornar_movimento_financeiro(
  p_id_financeiro_movimentos uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_original record;
  v_previa record;
  v_alvo record;
  v_mov uuid;
  v_primeiro uuid;
  v_mais_recente uuid;
  v_direcao text;
  v_status text;
  v_data timestamptz;
  v_competencia date;
  v_chave text;
  v_inserido boolean;
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 5
     or char_length(p_motivo) > 1000
     or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key), '') is null
     or char_length(p_idempotency_key) > 200 then
    raise exception 'Motivo, data e idempotencia sao obrigatorios.'
      using errcode = 'P0602';
  end if;

  -- Descobre os agrupadores sem tomar row lock. A ordem global abaixo e:
  -- fechamento/transferencia -> idempotencias -> row de fechamento ->
  -- movimentos em UUID crescente.
  select m.tipo_movimento, m.fk_fechamentos, m.fk_transferencia
    into v_previa
  from "RetificaPremium"."Financeiro_Movimentos" m
  where m.id_financeiro_movimentos = p_id_financeiro_movimentos
    and m.fk_criado_por = v_usuario;

  if not found then
    raise exception 'Movimento nao encontrado.' using errcode = 'P0404';
  end if;

  if v_previa.fk_fechamentos is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'financeiro:fechamento:' || v_previa.fk_fechamentos::text,
        0
      )
    );
  end if;
  if v_previa.fk_transferencia is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'financeiro:transferencia:' || v_previa.fk_transferencia::text,
        0
      )
    );
  end if;
  perform "RetificaPremium".financeiro_bloquear_idempotencia(
    v_usuario, p_idempotency_key
  );

  -- As chaves derivadas sao conhecidas antes dos row locks e a transferencia
  -- advisory serializa duas pontas concorrentes do mesmo par.
  if v_previa.fk_transferencia is not null then
    for v_alvo in
      select m.id_financeiro_movimentos
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_criado_por = v_usuario
        and m.tipo_movimento <> 'ESTORNO'
        and m.fk_transferencia = v_previa.fk_transferencia
        and m.id_financeiro_movimentos <> p_id_financeiro_movimentos
      order by m.id_financeiro_movimentos
    loop
      perform "RetificaPremium".financeiro_bloquear_idempotencia(
        v_usuario,
        'estorno-vinculado:' || pg_catalog.md5(p_idempotency_key)
          || ':' || v_alvo.id_financeiro_movimentos
      );
    end loop;
  end if;

  if v_previa.tipo_movimento = 'RECEBIMENTO_FECHAMENTO' then
    perform "RetificaPremium".assert_fechamento_target_access(v_usuario);

    perform 1
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
    where f.id_fechamentos = v_previa.fk_fechamentos
      and c.fk_criado_por = v_usuario
    for update of f;

    if not found then
      raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
    end if;

    if not exists (
      select 1
      from "RetificaPremium"."Usuarios" u
      where u.id_usuarios = v_usuario
        and u.status
        and lower(u.acesso::text) = 'administrador'
    ) then
      raise exception 'Somente administrador pode estornar parcela de fechamento.'
        using errcode = 'P0403';
    end if;
  end if;

  perform 1
  from "RetificaPremium"."Financeiro_Movimentos" m
  where m.fk_criado_por = v_usuario
    and m.tipo_movimento <> 'ESTORNO'
    and (
      m.id_financeiro_movimentos = p_id_financeiro_movimentos
      or (
        v_previa.fk_transferencia is not null
        and m.fk_transferencia = v_previa.fk_transferencia
      )
    )
  order by m.id_financeiro_movimentos
  for update;

  select * into v_original
  from "RetificaPremium"."Financeiro_Movimentos"
  where id_financeiro_movimentos = p_id_financeiro_movimentos
    and fk_criado_por = v_usuario;

  if not found then
    raise exception 'Movimento nao encontrado.' using errcode = 'P0404';
  end if;
  if v_original.tipo_movimento = 'ESTORNO' then
    raise exception 'Um estorno nao pode ser estornado diretamente.'
      using errcode = 'P0602';
  end if;

  if v_original.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
     and v_original.estornado_em is null then
    select m.id_financeiro_movimentos
      into v_mais_recente
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_fechamentos = v_original.fk_fechamentos
      and m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.estornado_em is null
    order by m.created_at desc, m.id_financeiro_movimentos desc
    limit 1;

    if v_mais_recente is distinct from v_original.id_financeiro_movimentos then
      raise exception 'Estorne primeiro a parcela ativa mais recente.'
        using errcode = 'P0602';
    end if;
  end if;

  if v_original.estornado_em is not null then
    v_direcao := case when v_original.direcao = 'ENTRADA' then 'SAIDA' else 'ENTRADA' end;
    v_status := case when v_original.status in ('ESTIMADO', 'REVISAR')
      then v_original.status else 'CONFIRMADO' end;
    v_data := case when v_original.status = 'REVISAR' then null else p_data_efetiva end;
    v_competencia := (p_data_efetiva at time zone 'America/Sao_Paulo')::date;
    v_chave := p_idempotency_key;
    v_primeiro := "RetificaPremium".financeiro_movimento_por_idempotencia(
      v_usuario, v_chave, v_direcao, 'ESTORNO', v_original.valor, v_data,
      v_competencia, v_original.fk_financeiro_contas, v_original.forma_pagamento,
      v_status, false, v_original.fk_categorias_entradas,
      v_original.fk_categorias_saidas, v_original.fk_notas_servico,
      v_original.fk_fechamentos, v_original.fk_contas_pagar,
      v_original.fk_recebivel_manual, v_original.id_financeiro_movimentos,
      v_original.fk_transferencia
    );
    if v_primeiro is null then
      raise exception 'Movimento ja estornado por outra operacao.'
        using errcode = 'P0602';
    end if;
    if exists (
      select 1
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.id_financeiro_movimentos = v_primeiro
        and m.motivo_estorno is distinct from p_motivo
    ) then
      raise exception 'Chave de idempotencia usada com motivo de estorno diferente.'
        using errcode = 'P0602';
    end if;
  else
    for v_alvo in
      select m.*
      from "RetificaPremium"."Financeiro_Movimentos" m
      where m.fk_criado_por = v_usuario
        and m.tipo_movimento <> 'ESTORNO'
        and m.estornado_em is null
        and (
          m.id_financeiro_movimentos = p_id_financeiro_movimentos
          or (
            v_original.fk_transferencia is not null
            and m.fk_transferencia = v_original.fk_transferencia
          )
        )
      order by m.id_financeiro_movimentos
    loop
      v_direcao := case when v_alvo.direcao = 'ENTRADA' then 'SAIDA' else 'ENTRADA' end;
      v_status := case when v_alvo.status in ('ESTIMADO', 'REVISAR')
        then v_alvo.status else 'CONFIRMADO' end;
      v_data := case when v_alvo.status = 'REVISAR' then null else p_data_efetiva end;
      v_competencia := (p_data_efetiva at time zone 'America/Sao_Paulo')::date;
      v_chave := case
        when v_alvo.id_financeiro_movimentos = p_id_financeiro_movimentos
          then p_idempotency_key
        else 'estorno-vinculado:' || pg_catalog.md5(p_idempotency_key)
          || ':' || v_alvo.id_financeiro_movimentos
      end;

      if v_alvo.status = 'CONFIRMADO' then
        perform "RetificaPremium".financeiro_validar_data_conta(
          v_alvo.fk_financeiro_contas, p_data_efetiva
        );
      end if;

      v_mov := "RetificaPremium".financeiro_movimento_por_idempotencia(
        v_usuario, v_chave, v_direcao, 'ESTORNO', v_alvo.valor, v_data,
        v_competencia, v_alvo.fk_financeiro_contas, v_alvo.forma_pagamento,
        v_status, false, v_alvo.fk_categorias_entradas,
        v_alvo.fk_categorias_saidas, v_alvo.fk_notas_servico,
        v_alvo.fk_fechamentos, v_alvo.fk_contas_pagar,
        v_alvo.fk_recebivel_manual, v_alvo.id_financeiro_movimentos,
        v_alvo.fk_transferencia
      );
      v_inserido := false;

      if v_mov is null then
        insert into "RetificaPremium"."Financeiro_Movimentos" (
          fk_criado_por, fk_financeiro_contas, direcao, tipo_movimento, valor,
          data_efetiva, data_competencia, forma_pagamento, descricao, observacoes,
          status, impacta_dre, fk_categorias_entradas, fk_categorias_saidas,
          fk_notas_servico, fk_fechamentos, fk_contas_pagar, fk_recebivel_manual,
          fk_movimento_origem, fk_transferencia, chave_idempotencia,
          fk_registrado_por, motivo_estorno
        ) values (
          v_usuario, v_alvo.fk_financeiro_contas, v_direcao, 'ESTORNO',
          v_alvo.valor, v_data, v_competencia, v_alvo.forma_pagamento,
          'Estorno - ' || v_alvo.descricao, p_motivo, v_status, false,
          v_alvo.fk_categorias_entradas, v_alvo.fk_categorias_saidas,
          v_alvo.fk_notas_servico, v_alvo.fk_fechamentos,
          v_alvo.fk_contas_pagar, v_alvo.fk_recebivel_manual,
          v_alvo.id_financeiro_movimentos, v_alvo.fk_transferencia,
          v_chave, v_usuario, p_motivo
        )
        on conflict do nothing
        returning id_financeiro_movimentos into v_mov;

        v_inserido := v_mov is not null;
        if v_mov is null then
          v_mov := "RetificaPremium".financeiro_movimento_por_idempotencia(
            v_usuario, v_chave, v_direcao, 'ESTORNO', v_alvo.valor, v_data,
            v_competencia, v_alvo.fk_financeiro_contas, v_alvo.forma_pagamento,
            v_status, false, v_alvo.fk_categorias_entradas,
            v_alvo.fk_categorias_saidas, v_alvo.fk_notas_servico,
            v_alvo.fk_fechamentos, v_alvo.fk_contas_pagar,
            v_alvo.fk_recebivel_manual, v_alvo.id_financeiro_movimentos,
            v_alvo.fk_transferencia
          );
        end if;
        if v_mov is null then
          raise exception 'Movimento ja estornado por outra operacao.'
            using errcode = 'P0602';
        end if;
      end if;

      if exists (
        select 1
        from "RetificaPremium"."Financeiro_Movimentos" m
        where m.id_financeiro_movimentos = v_mov
          and m.motivo_estorno is distinct from p_motivo
      ) then
        raise exception 'Chave de idempotencia usada com motivo de estorno diferente.'
          using errcode = 'P0602';
      end if;

      v_primeiro := coalesce(v_primeiro, v_mov);
      if v_inserido then
        update "RetificaPremium"."Financeiro_Movimentos"
           set estornado_em = now(),
               motivo_estorno = p_motivo,
               fk_estornado_por = v_usuario
         where id_financeiro_movimentos = v_alvo.id_financeiro_movimentos;

        perform "RetificaPremium".financeiro_recalcular_origem(
          v_alvo.fk_notas_servico, v_alvo.fk_fechamentos,
          v_alvo.fk_contas_pagar, v_alvo.fk_recebivel_manual
        );
      end if;
    end loop;
  end if;

  return json_build_object(
    'status', 200,
    'mensagem', 'Movimento estornado.',
    'dados', json_build_object(
      'id_movimento', v_primeiro,
      'movimento_id', v_primeiro,
      'status', 'PAGO'
    )
  );
end;
$$;

create or replace function "RetificaPremium".estornar_parcela_fechamento(
  p_id_fechamentos uuid,
  p_id_financeiro_movimentos uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_item record;
  v_result json;
  v_movimento_estorno uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );

  select f.*, c.fk_criado_por owner_id
    into v_item
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos;

  if not found or v_item.owner_id is distinct from v_usuario then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if not exists (
    select 1
    from "RetificaPremium"."Usuarios" u
    where u.id_usuarios = v_usuario
      and u.status
      and lower(u.acesso::text) = 'administrador'
  ) then
    raise exception 'Somente administrador pode estornar parcela de fechamento.'
      using errcode = 'P0403';
  end if;
  if not exists (
    select 1
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.id_financeiro_movimentos = p_id_financeiro_movimentos
      and m.fk_criado_por = v_usuario
      and m.fk_fechamentos = p_id_fechamentos
      and m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
  ) then
    raise exception 'Parcela do fechamento nao encontrada.' using errcode = 'P0404';
  end if;

  v_result := "RetificaPremium".estornar_movimento_financeiro(
    p_id_financeiro_movimentos, p_motivo, p_data_efetiva, p_idempotency_key
  );
  v_movimento_estorno := (v_result -> 'dados' ->> 'movimento_id')::uuid;

  select f.* into v_item
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = p_id_fechamentos;

  return json_build_object(
    'status', 200,
    'mensagem', 'Parcela estornada.',
    'dados', json_build_object(
      'id_movimento', v_movimento_estorno,
      'movimento_id', v_movimento_estorno,
      'status', v_item.status_pagamento,
      'valor_realizado', v_item.valor_recebido,
      'valor_recebido', v_item.valor_recebido,
      'valor_aberto', greatest(v_item.valor_total - v_item.valor_recebido, 0)
    )
  );
end;
$$;

-- A assinatura legada continua estornando todo o fechamento, agora do mais
-- recente para o mais antigo para respeitar a mesma regra LIFO.
create or replace function "RetificaPremium".estornar_recebimento_fechamento(
  p_id_fechamentos uuid,
  p_motivo text,
  p_data_efetiva timestamptz,
  p_idempotency_key text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_item record;
  v_mov record;
  v_result json;
  v_primeiro uuid;
  v_count integer := 0;
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 5
     or char_length(coalesce(p_motivo, '')) > 1000
     or p_data_efetiva is null
     or nullif(btrim(p_idempotency_key), '') is null
     or char_length(p_idempotency_key) > 200 then
    raise exception 'Motivo, data ou chave de idempotencia invalida.'
      using errcode = 'P0602';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );

  select f.*, c.fk_criado_por owner_id
    into v_item
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos;

  if not found or v_item.owner_id is distinct from v_usuario then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if not exists (
    select 1
    from "RetificaPremium"."Usuarios" u
    where u.id_usuarios = v_usuario
      and u.status
      and lower(u.acesso::text) = 'administrador'
  ) then
    raise exception 'Somente administrador pode estornar parcela de fechamento.'
      using errcode = 'P0403';
  end if;

  for v_mov in
    select m.id_financeiro_movimentos
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por = v_usuario
      and m.fk_fechamentos = p_id_fechamentos
      and m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
      and m.estornado_em is null
    order by m.created_at desc, m.id_financeiro_movimentos desc
  loop
    v_result := "RetificaPremium".estornar_movimento_financeiro(
      v_mov.id_financeiro_movimentos,
      p_motivo,
      p_data_efetiva,
      'estorno-fechamento:' || pg_catalog.md5(p_idempotency_key)
        || ':' || v_mov.id_financeiro_movimentos
    );
    v_primeiro := coalesce(
      v_primeiro,
      (v_result -> 'dados' ->> 'movimento_id')::uuid
    );
    v_count := v_count + 1;
  end loop;

  select f.* into v_item
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = p_id_fechamentos;

  return json_build_object(
    'status', 200,
    'mensagem', 'Recebimento estornado.',
    'dados', json_build_object(
      'id_movimento', v_primeiro,
      'movimento_id', v_primeiro,
      'status', v_item.status_pagamento,
      'movimentos_estornados', v_count,
      'valor_realizado', v_item.valor_recebido,
      'valor_recebido', v_item.valor_recebido,
      'valor_aberto', greatest(v_item.valor_total - v_item.valor_recebido, 0)
    )
  );
end;
$$;

-- Assinatura legada preservada. Ela recebe as novas regras de duas parcelas,
-- mas nao possui a pre-condicao otimista porque clientes antigos nao a enviam.
create or replace function "RetificaPremium".registrar_recebimento_fechamento(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_idempotency_key text default null
)
returns json
language sql
security definer
set search_path = ''
as $$
  select "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
    p_id_fechamentos, p_valor, p_data_efetiva, p_fk_conta_financeira,
    p_forma_pagamento, p_observacoes, p_idempotency_key, null
  )
$$;

create or replace function "RetificaPremium".registrar_parcela_fechamento(
  p_id_fechamentos uuid,
  p_valor numeric,
  p_data_efetiva timestamptz,
  p_fk_conta_financeira uuid,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_idempotency_key text default null,
  p_valor_recebido_esperado numeric default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_valor_recebido_esperado is null then
    raise exception 'O valor recebido esperado e obrigatorio.' using errcode = 'P0602';
  end if;
  return "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
    p_id_fechamentos, p_valor, p_data_efetiva, p_fk_conta_financeira,
    p_forma_pagamento, p_observacoes, p_idempotency_key,
    p_valor_recebido_esperado
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Historico das parcelas e lembrete de saldos (normal + suporte leitura)
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".financeiro_parcelas_fechamento_usuario(
  p_usuario uuid,
  p_id_fechamentos uuid
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fechamento record;
  v_parcelas json;
  v_ativas integer;
  v_pode_estornar boolean;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  perform "RetificaPremium".assert_fechamento_target_access(p_usuario);

  select lower(u.acesso::text) = 'administrador'
    into v_pode_estornar
  from "RetificaPremium"."Usuarios" u
  where u.id_usuarios = p_usuario
    and u.status;

  select f.* into v_fechamento
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos
    and c.fk_criado_por = p_usuario;

  if not found then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;

  with parcelas_base as (
    select
      m.*,
      row_number() over (
        order by m.created_at, m.id_financeiro_movimentos
      )::integer as numero
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.fk_criado_por = p_usuario
      and m.fk_fechamentos = p_id_fechamentos
      and m.direcao = 'ENTRADA'
      and m.tipo_movimento = 'RECEBIMENTO_FECHAMENTO'
      and m.status in ('CONFIRMADO', 'ESTIMADO', 'REVISAR')
  ),
  ultima_ativa as (
    select b.id_financeiro_movimentos
    from parcelas_base b
    where b.estornado_em is null
    order by b.created_at desc, b.id_financeiro_movimentos desc
    limit 1
  )
  select
    coalesce(
      json_agg(
        json_build_object(
          'id', b.id_financeiro_movimentos,
          'id_movimento', b.id_financeiro_movimentos,
          'numero', b.numero,
          'valor', b.valor,
          'data_efetiva', b.data_efetiva,
          'conta_id', b.fk_financeiro_contas,
          'conta_nome', fc.nome,
          'forma_pagamento', b.forma_pagamento,
          'observacoes', b.observacoes,
          'usuario_nome', u.nome,
          'created_at', b.created_at,
          'ativa', b.estornado_em is null,
          'estornada_em', b.estornado_em,
          'motivo_estorno', coalesce(b.motivo_estorno, rev.motivo_estorno),
          'estorno_movimento_id', rev.id_financeiro_movimentos,
          'pode_estornar',
            coalesce(v_pode_estornar, false)
            and b.estornado_em is null
            and b.id_financeiro_movimentos = ua.id_financeiro_movimentos,
          'anexos', coalesce(ax.anexos, '[]'::json)
        )
        order by b.numero
      ),
      '[]'::json
    ),
    count(*) filter (where b.estornado_em is null)::integer
    into v_parcelas, v_ativas
  from parcelas_base b
  left join ultima_ativa ua on true
  left join "RetificaPremium"."Financeiro_Contas" fc
    on fc.id_financeiro_contas = b.fk_financeiro_contas
  left join "RetificaPremium"."Usuarios" u
    on u.id_usuarios = b.fk_registrado_por
  left join "RetificaPremium"."Financeiro_Movimentos" rev
    on rev.fk_movimento_origem = b.id_financeiro_movimentos
   and rev.tipo_movimento = 'ESTORNO'
  left join lateral (
    select coalesce(
      json_agg(
        json_build_object(
          'id', a.id_financeiro_anexos,
          'movimento_id', a.fk_financeiro_movimentos,
          'nome_arquivo', a.nome_arquivo,
          'caminho', a.storage_path,
          'mime_type', a.tipo_mime,
          'tamanho_bytes', a.tamanho_bytes,
          'created_at', a.created_at,
          'usuario_nome', au.nome
        )
        order by a.created_at desc, a.id_financeiro_anexos desc
      ),
      '[]'::json
    ) as anexos
    from "RetificaPremium"."Financeiro_Anexos" a
    left join "RetificaPremium"."Usuarios" au
      on au.id_usuarios = a.fk_registrado_por
    where a.fk_criado_por = p_usuario
      and a.fk_financeiro_movimentos = b.id_financeiro_movimentos
  ) ax on true;

  return json_build_object(
    'fechamento_id', v_fechamento.id_fechamentos,
    'cliente_id', v_fechamento.fk_clientes,
    'chave_idempotencia', v_fechamento.chave_idempotencia,
    'recebimento_inicial_chave',
      v_fechamento.dados_json #>> '{recebimento_inicial,chave_idempotencia}',
    'valor_total', v_fechamento.valor_total,
    'valor_recebido', v_fechamento.valor_recebido,
    'valor_aberto', greatest(
      v_fechamento.valor_total - v_fechamento.valor_recebido,
      0
    ),
    'status', v_fechamento.status_pagamento,
    'status_pagamento', v_fechamento.status_pagamento,
    'parcelas_ativas', coalesce(v_ativas, 0),
    'parcelas', coalesce(v_parcelas, '[]'::json)
  );
end;
$$;

create or replace function "RetificaPremium".get_parcelas_fechamento(
  p_id_fechamentos uuid
)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'status', 200,
    'mensagem', 'Parcelas do fechamento.',
    'dados', "RetificaPremium".financeiro_parcelas_fechamento_usuario(
      "RetificaPremium".require_financeiro_usuario_id(),
      p_id_fechamentos
    )
  )
$$;

create or replace function "RetificaPremium".get_parcelas_fechamento_contexto_suporte(
  p_id_fechamentos uuid,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'status', 200,
    'mensagem', 'Parcelas do fechamento.',
    'dados', "RetificaPremium".financeiro_parcelas_fechamento_usuario(
      "RetificaPremium".financeiro_contexto_leitura(
        p_contexto_usuario_id,
        p_sessao_suporte
      ),
      p_id_fechamentos
    )
  )
$$;

create or replace function "RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(
  p_usuario uuid,
  p_fk_clientes uuid
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fechamentos json;
  v_quantidade integer;
  v_saldo_total numeric(14,2);
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario);
  perform "RetificaPremium".assert_fechamento_target_access(p_usuario);

  if p_fk_clientes is null or not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_fk_clientes
      and c.fk_criado_por = p_usuario
  ) then
    raise exception 'Cliente nao encontrado.' using errcode = 'P0404';
  end if;

  select
    coalesce(
      json_agg(
        json_build_object(
          'id', x.id_fechamentos,
          'id_fechamentos', x.id_fechamentos,
          'periodo', x.periodo,
          'label', x.label,
          'valor_total', x.valor_total,
          'valor_recebido', x.valor_recebido,
          'saldo', x.saldo,
          'valor_aberto', x.saldo,
          'status', x.status_pagamento,
          'status_pagamento', x.status_pagamento,
          'created_at', x.created_at
        )
        order by x.created_at desc, x.id_fechamentos desc
      ),
      '[]'::json
    ),
    count(*)::integer,
    coalesce(sum(x.saldo), 0)::numeric(14,2)
    into v_fechamentos, v_quantidade, v_saldo_total
  from (
    select
      f.id_fechamentos,
      f.periodo,
      f.label,
      round(greatest(f.valor_total, 0), 2) valor_total,
      round(greatest(coalesce(f.valor_recebido, 0), 0), 2) valor_recebido,
      round(greatest(f.valor_total - coalesce(f.valor_recebido, 0), 0), 2) saldo,
      f.status_pagamento,
      f.created_at
    from "RetificaPremium"."Fechamentos" f
    where f.fk_clientes = p_fk_clientes
      and f.status_pagamento in ('PENDENTE', 'PARCIAL')
      and f.valor_total - coalesce(f.valor_recebido, 0) > 0.004
  ) x;

  return json_build_object(
    'cliente_id', p_fk_clientes,
    'quantidade', coalesce(v_quantidade, 0),
    'saldo_total', coalesce(v_saldo_total, 0),
    'fechamentos', coalesce(v_fechamentos, '[]'::json)
  );
end;
$$;

create or replace function "RetificaPremium".get_fechamentos_abertos_cliente(
  p_fk_clientes uuid
)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'status', 200,
    'mensagem', 'Fechamentos em aberto do cliente.',
    'dados', "RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(
      "RetificaPremium".require_financeiro_usuario_id(),
      p_fk_clientes
    )
  )
$$;

create or replace function "RetificaPremium".get_fechamentos_abertos_cliente_contexto_suporte(
  p_fk_clientes uuid,
  p_contexto_usuario_id uuid default null,
  p_sessao_suporte uuid default null
)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'status', 200,
    'mensagem', 'Fechamentos em aberto do cliente.',
    'dados', "RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(
      "RetificaPremium".financeiro_contexto_leitura(
        p_contexto_usuario_id,
        p_sessao_suporte
      ),
      p_fk_clientes
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Finalizacao atomica e vinculacao posterior do PDF privado
-- ---------------------------------------------------------------------------

create or replace function "RetificaPremium".fechamento_validar_pdf_path(
  p_id_fechamentos uuid,
  p_pdf_url text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_id uuid := (select auth.uid());
  v_path text := btrim(p_pdf_url);
  v_mime text;
begin
  if v_auth_id is null then
    raise exception 'Autenticacao necessaria.' using errcode = 'P0401';
  end if;
  if nullif(v_path, '') is null
     or (
       v_path is distinct from v_auth_id::text || '/' || p_id_fechamentos::text || '.pdf'
       and v_path !~ (
         '^' || v_auth_id::text || '/' || p_id_fechamentos::text
         || '-[0-9]{1,18}\.pdf$'
       )
     )
     or v_path like '%..%'
     or v_path ~* '^https?://'
     or v_path like '/%' then
    raise exception 'Caminho do PDF do fechamento invalido.' using errcode = 'P0602';
  end if;

  select lower(nullif(o.metadata ->> 'mimetype', ''))
    into v_mime
  from storage.objects o
  where o.bucket_id = 'fechamentos'
    and o.name = v_path
    and (
      o.owner_id = v_auth_id::text
      or o.owner = v_auth_id
    );

  if not found then
    raise exception 'PDF privado nao encontrado no Storage.' using errcode = 'P0404';
  end if;
  if v_mime is distinct from 'application/pdf' then
    raise exception 'O arquivo vinculado ao fechamento precisa ser PDF.'
      using errcode = 'P0602';
  end if;

  return v_path;
end;
$$;

create or replace function "RetificaPremium".finalizar_fechamento(
  p_id_fechamentos uuid,
  p_fk_clientes uuid,
  p_mes text,
  p_ano smallint,
  p_periodo text,
  p_label text,
  p_valor_total numeric,
  p_dados_json jsonb,
  p_pdf_url text,
  p_chave_idempotencia text,
  p_fk_template_documento uuid,
  p_documento_tema_snapshot jsonb,
  p_documento_config_snapshot jsonb,
  p_recebimento_valor numeric,
  p_recebimento_data timestamptz,
  p_recebimento_conta uuid,
  p_recebimento_forma text,
  p_recebimento_observacoes text,
  p_recebimento_idempotencia text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_fechamento_usuario_id();
  v_total numeric(14,2);
  v_total_json numeric(14,2);
  v_total_notas numeric(14,2);
  v_competencia_modo text;
  v_competencia_inicio_text text;
  v_competencia_fim_text text;
  v_competencia_inicio date;
  v_competencia_fim date;
  v_mes_esperado text;
  v_chave text := btrim(p_chave_idempotencia);
  v_pdf_path text;
  v_note_ids uuid[];
  v_note_count integer;
  v_note_distinct_count integer;
  v_valid_count integer;
  v_linked_count integer;
  v_matching_link_count integer;
  v_rows integer;
  v_id_por_id uuid;
  v_id_por_chave uuid;
  v_existente record;
  v_fechamento record;
  v_result_recebimento json;
  v_movimento uuid;
  v_idempotent_retry boolean := false;
  v_tem_recebimento boolean := p_recebimento_valor is not null;
begin
  if p_id_fechamentos is null or p_fk_clientes is null then
    raise exception 'Fechamento e cliente sao obrigatorios.' using errcode = 'P0602';
  end if;
  if nullif(btrim(p_mes), '') is null or char_length(btrim(p_mes)) > 40
     or p_ano is null or not (p_ano between 2000 and 9999)
     or nullif(btrim(p_periodo), '') is null or char_length(btrim(p_periodo)) > 160
     or nullif(btrim(p_label), '') is null or char_length(btrim(p_label)) > 240 then
    raise exception 'Mes, ano, periodo ou titulo do fechamento invalido.'
      using errcode = 'P0602';
  end if;
  if nullif(v_chave, '') is null or char_length(v_chave) not between 8 and 200 then
    raise exception 'Chave de idempotencia do fechamento invalida.'
      using errcode = 'P0602';
  end if;
  if p_valor_total is null or p_valor_total <= 0 then
    raise exception 'O valor total deve ser maior que zero.'
      using errcode = 'P0602';
  end if;

  v_total := round(p_valor_total, 2);
  if abs(p_valor_total - v_total) > 0.004 then
    raise exception 'O valor total deve ter no maximo duas casas decimais.'
      using errcode = 'P0602';
  end if;

  if jsonb_typeof(p_dados_json) is distinct from 'object'
     or jsonb_typeof(p_dados_json -> 'notas') is distinct from 'array'
     or jsonb_typeof(p_dados_json -> 'cliente') is distinct from 'object'
     or p_dados_json -> 'cliente' ->> 'id' is distinct from p_fk_clientes::text
     or p_dados_json ->> 'periodo' is distinct from btrim(p_periodo)
     or jsonb_typeof(p_dados_json -> 'competencia') is distinct from 'object'
     or jsonb_typeof(p_dados_json -> 'total_com_desconto') is distinct from 'number' then
    raise exception 'Snapshot do fechamento invalido.' using errcode = 'P0602';
  end if;

  v_competencia_modo := p_dados_json #>> '{competencia,modo}';
  v_competencia_inicio_text := p_dados_json #>> '{competencia,inicio}';
  v_competencia_fim_text := p_dados_json #>> '{competencia,fim}';
  if v_competencia_modo not in ('MENSAL', 'PERSONALIZADO')
     or coalesce(v_competencia_inicio_text, '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(v_competencia_fim_text, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Competencia do fechamento invalida.' using errcode = 'P0602';
  end if;
  begin
    v_competencia_inicio := v_competencia_inicio_text::date;
    v_competencia_fim := v_competencia_fim_text::date;
  exception when others then
    raise exception 'Competencia do fechamento invalida.' using errcode = 'P0602';
  end;
  if v_competencia_inicio::text is distinct from v_competencia_inicio_text
     or v_competencia_fim::text is distinct from v_competencia_fim_text
     or v_competencia_inicio > v_competencia_fim then
    raise exception 'Intervalo de competencia invalido.' using errcode = 'P0602';
  end if;

  v_mes_esperado := case extract(month from v_competencia_inicio)::integer
    when 1 then 'janeiro' when 2 then 'fevereiro' when 3 then 'março'
    when 4 then 'abril' when 5 then 'maio' when 6 then 'junho'
    when 7 then 'julho' when 8 then 'agosto' when 9 then 'setembro'
    when 10 then 'outubro' when 11 then 'novembro' when 12 then 'dezembro'
  end;
  if extract(year from v_competencia_inicio)::integer is distinct from p_ano::integer
     or lower(btrim(p_mes)) is distinct from v_mes_esperado then
    raise exception 'Mes/ano divergem do inicio da competencia.' using errcode = 'P0602';
  end if;
  if v_competencia_modo = 'MENSAL'
     and (
       v_competencia_inicio
         is distinct from pg_catalog.make_date(p_ano, extract(month from v_competencia_inicio)::integer, 1)
       or v_competencia_fim
         is distinct from (v_competencia_inicio + interval '1 month - 1 day')::date
     ) then
    raise exception 'A competencia mensal deve cobrir o mes civil completo.'
      using errcode = 'P0602';
  end if;
  if p_documento_tema_snapshot is not null
     and jsonb_typeof(p_documento_tema_snapshot) is distinct from 'object' then
    raise exception 'Snapshot de tema invalido.' using errcode = 'P0602';
  end if;
  if p_documento_config_snapshot is not null
     and jsonb_typeof(p_documento_config_snapshot) is distinct from 'object' then
    raise exception 'Snapshot de configuracao invalido.' using errcode = 'P0602';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_dados_json -> 'notas') e(item)
    where jsonb_typeof(e.item) is distinct from 'object'
       or coalesce(e.item ->> 'id', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e.item -> 'total_original') is distinct from 'number'
       or jsonb_typeof(e.item -> 'total_com_desconto') is distinct from 'number'
       or (
         e.item ? 'saldo_aberto'
         and jsonb_typeof(e.item -> 'saldo_aberto') is distinct from 'number'
       )
       or (
         e.item ? 'valor_total_os'
         and jsonb_typeof(e.item -> 'valor_total_os') is distinct from 'number'
       )
       or (
         e.item ? 'valor_recebido'
         and jsonb_typeof(e.item -> 'valor_recebido') is distinct from 'number'
       )
  ) then
    raise exception 'Uma ou mais O.S. possuem dados financeiros invalidos no snapshot.'
      using errcode = 'P0602';
  end if;

  select
    coalesce(array_agg((e.item ->> 'id')::uuid order by e.item ->> 'id'), array[]::uuid[]),
    count(*)::integer,
    count(distinct e.item ->> 'id')::integer,
    coalesce(sum((e.item ->> 'total_com_desconto')::numeric), 0)::numeric(14,2)
    into v_note_ids, v_note_count, v_note_distinct_count, v_total_notas
  from jsonb_array_elements(p_dados_json -> 'notas') e(item);

  if v_note_count = 0 then
    raise exception 'Selecione pelo menos uma O.S. para o fechamento.'
      using errcode = 'P0602';
  end if;
  if v_note_count is distinct from v_note_distinct_count then
    raise exception 'O snapshot possui O.S. duplicada.' using errcode = 'P0602';
  end if;

  v_total_json := round((p_dados_json ->> 'total_com_desconto')::numeric, 2);
  v_total_notas := round(v_total_notas, 2);
  if v_total_json is distinct from v_total
     or v_total_notas is distinct from v_total then
    raise exception 'O total do fechamento diverge da soma das O.S. no snapshot.'
      using errcode = 'P0602';
  end if;

  if not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_fk_clientes
      and c.fk_criado_por = v_usuario
  ) then
    raise exception 'Cliente nao encontrado para este usuario.' using errcode = 'P0403';
  end if;
  if p_fk_template_documento is not null and not exists (
    select 1
    from "RetificaPremium"."Templates_Documentos_Usuario" t
    where t.id_templates_documentos_usuario = p_fk_template_documento
      and t.fk_usuarios = v_usuario
      and t.document_type = 'closing_report'
  ) then
    raise exception 'Template de fechamento invalido para este usuario.'
      using errcode = 'P0403';
  end if;

  if v_tem_recebimento then
    if p_recebimento_data is null
       or p_recebimento_conta is null
       or nullif(btrim(p_recebimento_idempotencia), '') is null
       or char_length(p_recebimento_idempotencia) > 200 then
      raise exception 'Valor, data, conta e idempotencia do recebimento sao obrigatorios.'
        using errcode = 'P0602';
    end if;
    if jsonb_typeof(p_dados_json -> 'recebimento_inicial') is distinct from 'object'
       or jsonb_typeof(p_dados_json #> '{recebimento_inicial,valor}') is distinct from 'number'
       or p_dados_json #>> '{recebimento_inicial,chave_idempotencia}'
         is distinct from p_recebimento_idempotencia
       or round((p_dados_json #>> '{recebimento_inicial,valor}')::numeric, 2)
         is distinct from round(p_recebimento_valor, 2)
       or (p_dados_json #>> '{recebimento_inicial,data_efetiva}')::timestamptz
         is distinct from p_recebimento_data
       or (p_dados_json #>> '{recebimento_inicial,conta_id}')::uuid
         is distinct from p_recebimento_conta
       or nullif(btrim(p_dados_json #>> '{recebimento_inicial,forma_pagamento}'), '')
         is distinct from nullif(btrim(p_recebimento_forma), '')
       or nullif(btrim(p_dados_json #>> '{recebimento_inicial,observacoes}'), '')
         is distinct from nullif(btrim(p_recebimento_observacoes), '') then
      raise exception 'A intencao do recebimento inicial diverge do snapshot.'
        using errcode = 'P0602';
    end if;
  elsif num_nonnulls(
    p_recebimento_data,
    p_recebimento_conta,
    p_recebimento_forma,
    p_recebimento_observacoes,
    p_recebimento_idempotencia
  ) > 0 then
    raise exception 'Recebimento inicial incompleto.' using errcode = 'P0602';
  elsif jsonb_typeof(p_dados_json -> 'recebimento_inicial') is distinct from 'null' then
    raise exception 'O snapshot informa recebimento inicial sem parametros correspondentes.'
      using errcode = 'P0602';
  end if;
  if char_length(coalesce(p_recebimento_observacoes, '')) > 1000 then
    raise exception 'As observacoes do recebimento devem ter no maximo 1000 caracteres.'
      using errcode = 'P0602';
  end if;

  if p_pdf_url is not null then
    v_pdf_path := "RetificaPremium".fechamento_validar_pdf_path(
      p_id_fechamentos,
      p_pdf_url
    );
  end if;

  -- Ordem global: fechamento -> chave de geracao -> chave do recebimento ->
  -- row do fechamento -> O.S. em UUID crescente. O core de recebimento
  -- readquire os locks de fechamento/pagamento de forma reentrante.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fechamento:' || v_chave, 0)
  );
  if v_tem_recebimento then
    perform "RetificaPremium".financeiro_bloquear_idempotencia(
      v_usuario,
      p_recebimento_idempotencia
    );
  end if;

  select f.id_fechamentos into v_id_por_id
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = p_id_fechamentos;

  select f.id_fechamentos into v_id_por_chave
  from "RetificaPremium"."Fechamentos" f
  where f.chave_idempotencia = v_chave;

  if v_id_por_id is not null
     and v_id_por_chave is not null
     and v_id_por_id is distinct from v_id_por_chave then
    raise exception 'A chave de idempotencia pertence a outro fechamento.'
      using errcode = 'P4095';
  end if;

  if coalesce(v_id_por_id, v_id_por_chave) is not null then
    select f.*, c.fk_criado_por owner_id
      into v_existente
    from "RetificaPremium"."Fechamentos" f
    join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
    where f.id_fechamentos = coalesce(v_id_por_id, v_id_por_chave)
    for update of f;

    if v_existente.owner_id is distinct from v_usuario
       or v_existente.id_fechamentos is distinct from p_id_fechamentos
       or v_existente.chave_idempotencia is distinct from v_chave
       or v_existente.fk_clientes is distinct from p_fk_clientes
       or v_existente.mes is distinct from btrim(p_mes)
       or v_existente.ano is distinct from p_ano
       or v_existente.periodo is distinct from btrim(p_periodo)
       or v_existente.label is distinct from btrim(p_label)
       or round(v_existente.valor_total, 2) is distinct from v_total
       or v_existente.dados_json is distinct from p_dados_json
       or v_existente.fk_template_documento is distinct from p_fk_template_documento
       or v_existente.documento_tema_snapshot is distinct from p_documento_tema_snapshot
       or v_existente.documento_config_snapshot is distinct from p_documento_config_snapshot
       or (v_pdf_path is not null and v_existente.pdf_url is distinct from v_pdf_path) then
      raise exception 'A chave de idempotencia foi usada com dados diferentes.'
        using errcode = 'P4095';
    end if;

    select count(*)::integer into v_linked_count
    from "RetificaPremium"."Notas_de_Servico" n
    where n.fk_fechamentos = p_id_fechamentos;

    select count(*)::integer into v_matching_link_count
    from "RetificaPremium"."Notas_de_Servico" n
    where n.id_notas_servico = any(v_note_ids)
      and n.criado_por_usuario = v_usuario
      and n.fk_clientes = p_fk_clientes
      and n.fk_fechamentos = p_id_fechamentos;

    if v_linked_count is distinct from v_note_count
       or v_matching_link_count is distinct from v_note_count then
      raise exception 'O fechamento idempotente possui vinculos de O.S. diferentes.'
        using errcode = 'P4095';
    end if;

    v_idempotent_retry := true;
  else
    -- Ordem estavel evita deadlock entre dois fechamentos concorrentes que
    -- tentem compartilhar O.S.; o segundo observara o vinculo e sera abortado.
    perform n.id_notas_servico
    from "RetificaPremium"."Notas_de_Servico" n
    where n.id_notas_servico = any(v_note_ids)
    order by n.id_notas_servico
    for update;

    select count(*)::integer
      into v_valid_count
    from jsonb_array_elements(p_dados_json -> 'notas') e(item)
    join "RetificaPremium"."Notas_de_Servico" n
      on n.id_notas_servico = (e.item ->> 'id')::uuid
    join "RetificaPremium"."Status_Notas" s
      on s.id_status_notas = n.fk_status
    where n.criado_por_usuario = v_usuario
      and n.fk_clientes = p_fk_clientes
      and n.fk_fechamentos is null
      and coalesce(n.prazo::date, n.created_at::date)
        between v_competencia_inicio and v_competencia_fim
      and lower(btrim(s.nome)) in (
        'entregue', 'recusada', 'sem conserto', 'finalizado', 'finalizada'
      )
      and round(greatest(n.total - coalesce(n.valor_recebido, 0), 0), 2) > 0
      and round((e.item ->> 'total_original')::numeric, 2)
        = round(greatest(n.total - coalesce(n.valor_recebido, 0), 0), 2)
      and round(coalesce(
        (e.item ->> 'saldo_aberto')::numeric,
        (e.item ->> 'total_original')::numeric
      ), 2) = round(greatest(n.total - coalesce(n.valor_recebido, 0), 0), 2)
      and (
        not (e.item ? 'valor_total_os')
        or round((e.item ->> 'valor_total_os')::numeric, 2) = round(n.total, 2)
      )
      and (
        not (e.item ? 'valor_recebido')
        or round((e.item ->> 'valor_recebido')::numeric, 2)
          = round(coalesce(n.valor_recebido, 0), 2)
      )
      and round((e.item ->> 'total_com_desconto')::numeric, 2) >= 0
      and round((e.item ->> 'total_com_desconto')::numeric, 2)
        <= round(greatest(n.total - coalesce(n.valor_recebido, 0), 0), 2);

    if v_valid_count is distinct from v_note_count then
      raise exception
        'Uma ou mais O.S. mudaram, estao fora da competencia do prazo, nao pertencem ao cliente ou ja foram fechadas.'
        using errcode = 'P4093';
    end if;

    insert into "RetificaPremium"."Fechamentos" (
      id_fechamentos,
      fk_clientes,
      mes,
      ano,
      periodo,
      label,
      valor_total,
      versao,
      dados_json,
      pdf_url,
      fk_template_documento,
      documento_tema_snapshot,
      documento_config_snapshot,
      status_pagamento,
      valor_recebido,
      chave_idempotencia,
      updated_at
    ) values (
      p_id_fechamentos,
      p_fk_clientes,
      btrim(p_mes),
      p_ano,
      btrim(p_periodo),
      btrim(p_label),
      v_total,
      1,
      p_dados_json,
      v_pdf_path,
      p_fk_template_documento,
      p_documento_tema_snapshot,
      p_documento_config_snapshot,
      'PENDENTE',
      0,
      v_chave,
      now()
    )
    on conflict do nothing;

    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'Outro fechamento foi criado simultaneamente. Recarregue a tela.'
        using errcode = 'P4095';
    end if;

    update "RetificaPremium"."Notas_de_Servico" n
       set fk_fechamentos = p_id_fechamentos,
           updated_at = now()
     where n.id_notas_servico = any(v_note_ids)
       and n.criado_por_usuario = v_usuario
       and n.fk_clientes = p_fk_clientes
       and n.fk_fechamentos is null;

    get diagnostics v_rows = row_count;
    if v_rows is distinct from v_note_count then
      raise exception 'Nao foi possivel vincular todas as O.S. ao fechamento.'
        using errcode = 'P4093';
    end if;

    insert into "RetificaPremium"."Fechamento_Logs" (
      fk_fechamentos,
      tipo,
      mensagem,
      fk_usuarios
    ) values (
      p_id_fechamentos,
      'gerado',
      'Fechamento finalizado de forma transacional.',
      v_usuario
    );

    begin
      perform "RetificaPremium".insert_log(
        'fechamento_gerado',
        'Fechamentos',
        p_id_fechamentos::text,
        'Fechamento gerado: ' || btrim(p_label)
      );
    exception when others then
      null;
    end;
  end if;

  if v_tem_recebimento then
    v_result_recebimento :=
      "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
        p_id_fechamentos,
        p_recebimento_valor,
        p_recebimento_data,
        p_recebimento_conta,
        p_recebimento_forma,
        p_recebimento_observacoes,
        p_recebimento_idempotencia,
        0
      );
    v_movimento := (v_result_recebimento -> 'dados' ->> 'movimento_id')::uuid;
  end if;

  select f.* into v_fechamento
  from "RetificaPremium"."Fechamentos" f
  where f.id_fechamentos = p_id_fechamentos;

  return json_build_object(
    'status', 200,
    'mensagem', case
      when v_idempotent_retry then 'Fechamento ja finalizado.'
      else 'Fechamento finalizado com sucesso.'
    end,
    'dados', json_build_object(
      'id', v_fechamento.id_fechamentos,
      'id_fechamentos', v_fechamento.id_fechamentos,
      'id_movimento', v_movimento,
      'movimento_id', v_movimento,
      'status', v_fechamento.status_pagamento,
      'valor_recebido', v_fechamento.valor_recebido,
      'valor_realizado', v_fechamento.valor_recebido,
      'valor_aberto', greatest(
        v_fechamento.valor_total - v_fechamento.valor_recebido,
        0
      ),
      'idempotent_retry', v_idempotent_retry
    )
  );
end;
$$;

create or replace function "RetificaPremium".atualizar_pdf_fechamento(
  p_id_fechamentos uuid,
  p_pdf_url text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_fechamento_usuario_id();
  v_fechamento record;
  v_path text;
  v_retry boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );

  select f.*, c.fk_criado_por owner_id
    into v_fechamento
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos
  for update of f;

  if not found or v_fechamento.owner_id is distinct from v_usuario then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;

  v_path := "RetificaPremium".fechamento_validar_pdf_path(
    p_id_fechamentos,
    p_pdf_url
  );

  if v_fechamento.pdf_url is not null
     and v_fechamento.pdf_url is distinct from v_path then
    raise exception 'O fechamento ja possui outro PDF vinculado.'
      using errcode = 'P4092';
  end if;

  v_retry := v_fechamento.pdf_url is not distinct from v_path;
  if not v_retry then
    update "RetificaPremium"."Fechamentos"
       set pdf_url = v_path,
           updated_at = now()
     where id_fechamentos = p_id_fechamentos;
  end if;

  return json_build_object(
    'status', 200,
    'mensagem', case when v_retry then 'PDF ja vinculado.' else 'PDF vinculado.' end,
    'dados', json_build_object(
      'id', p_id_fechamentos,
      'id_fechamentos', p_id_fechamentos,
      'pdf_url', v_path,
      'idempotent_retry', v_retry
    )
  );
end;
$$;

-- O path versionado evita que uma partilha antiga sobrescreva o PDF de um
-- saldo mais novo. A pre-condicao e comparada sob o mesmo lock do fechamento.
create or replace function "RetificaPremium".atualizar_pdf_fechamento_seguro(
  p_id_fechamentos uuid,
  p_pdf_url text,
  p_valor_recebido_esperado numeric
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_fechamento_usuario_id();
  v_fechamento record;
  v_path text;
  v_esperado numeric(14,2);
  v_retry boolean;
begin
  if p_valor_recebido_esperado is null or p_valor_recebido_esperado < 0 then
    raise exception 'O valor recebido esperado e obrigatorio.' using errcode = 'P0602';
  end if;
  v_esperado := round(p_valor_recebido_esperado, 2);
  if abs(p_valor_recebido_esperado - v_esperado) > 0.004 then
    raise exception 'O valor recebido esperado deve ter no maximo duas casas decimais.'
      using errcode = 'P0602';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );

  select f.*, c.fk_criado_por owner_id
    into v_fechamento
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos
  for update of f;

  if not found or v_fechamento.owner_id is distinct from v_usuario then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if round(coalesce(v_fechamento.valor_recebido, 0), 2) is distinct from v_esperado then
    raise exception
      'O fechamento foi alterado em outra aba. Regenere o PDF com o saldo atual.'
      using errcode = 'P4094';
  end if;

  v_path := "RetificaPremium".fechamento_validar_pdf_path(
    p_id_fechamentos,
    p_pdf_url
  );
  v_retry := v_fechamento.pdf_url is not distinct from v_path;

  if not v_retry then
    update "RetificaPremium"."Fechamentos"
       set pdf_url = v_path,
           updated_at = now()
     where id_fechamentos = p_id_fechamentos;
  end if;

  return json_build_object(
    'status', 200,
    'mensagem', case when v_retry then 'PDF ja atualizado.' else 'PDF atualizado.' end,
    'dados', json_build_object(
      'id', p_id_fechamentos,
      'id_fechamentos', p_id_fechamentos,
      'pdf_url', v_path,
      'valor_recebido', v_esperado,
      'idempotent_retry', v_retry
    )
  );
end;
$$;

-- A assinatura antiga permanece disponivel para clientes ainda nao atualizados,
-- agora com validacao explicita de tenant e search_path vazio.
create or replace function "RetificaPremium".insert_fechamento(
  p_fk_clientes uuid,
  p_mes text,
  p_ano smallint,
  p_periodo text,
  p_label text,
  p_valor_total numeric
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_id_fechamentos uuid;
begin
  v_usuario := "RetificaPremium".require_fechamento_usuario_id();

  if p_fk_clientes is null then
    raise exception 'Erro de parametro' using errcode = 'P0300';
  end if;
  if not exists (
    select 1
    from "RetificaPremium"."Clientes" c
    where c.id_clientes = p_fk_clientes
      and c.fk_criado_por = v_usuario
  ) then
    raise exception 'Cliente fora do escopo do usuario.' using errcode = 'P0403';
  end if;
  if p_mes is null or btrim(p_mes) = '' then
    raise exception 'Erro de parametro' using errcode = 'P0301';
  end if;
  if p_ano is null then
    raise exception 'Erro de parametro' using errcode = 'P0302';
  end if;
  if p_valor_total is null or p_valor_total < 0 then
    raise exception 'Erro de parametro' using errcode = 'P0303';
  end if;

  insert into "RetificaPremium"."Fechamentos" (
    fk_clientes,
    mes,
    ano,
    periodo,
    label,
    valor_total,
    versao
  ) values (
    p_fk_clientes,
    btrim(p_mes),
    p_ano,
    coalesce(nullif(btrim(p_periodo), ''), p_ano::text || '-' || lpad(p_mes, 2, '0')),
    coalesce(nullif(btrim(p_label), ''), 'Fechamento ' || btrim(p_mes) || '/' || p_ano::text),
    round(p_valor_total, 2),
    1
  )
  returning id_fechamentos into v_id_fechamentos;

  insert into "RetificaPremium"."Fechamento_Logs" (
    fk_fechamentos,
    tipo,
    mensagem,
    fk_usuarios
  ) values (
    v_id_fechamentos,
    'gerado',
    'Fechamento gerado.',
    v_usuario
  );

  begin
    perform "RetificaPremium".insert_log(
      'fechamento_gerado',
      'Fechamentos',
      v_id_fechamentos::text,
      'Fechamento gerado: ' || coalesce(nullif(btrim(p_label), ''), btrim(p_mes) || '/' || p_ano::text)
    );
  exception when others then
    null;
  end;

  return json_build_object(
    'status', 200,
    'mensagem', 'Fechamento gerado com sucesso.',
    'id_fechamentos', v_id_fechamentos
  );
exception
  when sqlstate 'P0300' then
    return json_build_object('status', 400, 'code', 'missing_fk_cliente', 'mensagem', 'O cliente e obrigatorio.');
  when sqlstate 'P0301' then
    return json_build_object('status', 400, 'code', 'missing_mes', 'mensagem', 'O mes e obrigatorio.');
  when sqlstate 'P0302' then
    return json_build_object('status', 400, 'code', 'missing_ano', 'mensagem', 'O ano e obrigatorio.');
  when sqlstate 'P0303' then
    return json_build_object('status', 400, 'code', 'invalid_valor_total', 'mensagem', 'O valor total deve ser maior ou igual a zero.');
  when sqlstate 'P0401' then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Autenticacao necessaria.');
  when sqlstate 'P0403' then
    return json_build_object('status', 403, 'code', 'forbidden', 'mensagem', 'Cliente fora do escopo do usuario.');
  when others then
    return json_build_object('status', 500, 'code', 'unknown_error', 'mensagem', 'Nao foi possivel gerar o fechamento.');
end;
$$;

-- Comprovante e enviado depois do movimento. A falha de upload/vinculo nunca
-- desfaz um recebimento valido, mas o banco so aceita um objeto privado do
-- usuario, dentro da pasta do movimento e com MIME permitido pelo bucket.
create or replace function "RetificaPremium".insert_financeiro_anexo(
  p_fk_financeiro_movimentos uuid,
  p_nome_arquivo text,
  p_caminho text,
  p_mime_type text default null,
  p_tamanho_bytes bigint default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_financeiro_usuario_id();
  v_auth_id uuid := (select auth.uid());
  v_id uuid;
  v_path text := btrim(p_caminho);
  v_nome text := btrim(p_nome_arquivo);
  v_storage_mime text;
  v_storage_size bigint;
  v_existente record;
begin
  if v_auth_id is null
     or nullif(v_nome, '') is null
     or char_length(v_nome) > 180
     or nullif(v_path, '') is null
     or char_length(v_path) > 500
     or v_path not like v_auth_id::text || '/' || p_fk_financeiro_movimentos::text || '/%'
     or v_path like '%..%'
     or v_path ~* '^https?://'
     or coalesce(p_tamanho_bytes, 0) < 0
     or coalesce(p_tamanho_bytes, 0) > 15728640
     or (
       p_mime_type is not null
       and lower(btrim(p_mime_type)) not in (
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
       )
     ) then
    raise exception 'Caminho, nome, tipo ou tamanho do comprovante invalido.'
      using errcode = 'P0602';
  end if;

  if not exists (
    select 1
    from "RetificaPremium"."Financeiro_Movimentos" m
    where m.id_financeiro_movimentos = p_fk_financeiro_movimentos
      and m.fk_criado_por = v_usuario
  ) then
    raise exception 'Movimento nao encontrado.' using errcode = 'P0404';
  end if;

  select
    lower(nullif(o.metadata ->> 'mimetype', '')),
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else null
    end
    into v_storage_mime, v_storage_size
  from storage.objects o
  where o.bucket_id = 'financeiro-comprovantes'
    and o.name = v_path
    and (
      o.owner_id = v_auth_id::text
      or o.owner = v_auth_id
    );

  if not found then
    raise exception 'Comprovante privado nao encontrado no Storage.'
      using errcode = 'P0404';
  end if;
  if v_storage_mime not in (
       'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
     )
     or coalesce(v_storage_size, p_tamanho_bytes, 0) > 15728640
     or (
       p_mime_type is not null
       and v_storage_mime is distinct from lower(btrim(p_mime_type))
     ) then
    raise exception 'Tipo ou tamanho do comprovante diverge do objeto armazenado.'
      using errcode = 'P0602';
  end if;

  insert into "RetificaPremium"."Financeiro_Anexos" (
    fk_criado_por,
    fk_financeiro_movimentos,
    storage_path,
    nome_arquivo,
    tipo_mime,
    tamanho_bytes,
    fk_registrado_por
  ) values (
    v_usuario,
    p_fk_financeiro_movimentos,
    v_path,
    v_nome,
    v_storage_mime,
    coalesce(v_storage_size, p_tamanho_bytes),
    v_usuario
  )
  on conflict (fk_criado_por, storage_path) do nothing
  returning id_financeiro_anexos into v_id;

  if v_id is null then
    select a.* into v_existente
    from "RetificaPremium"."Financeiro_Anexos" a
    where a.fk_criado_por = v_usuario
      and a.storage_path = v_path;

    if not found
       or v_existente.fk_financeiro_movimentos is distinct from p_fk_financeiro_movimentos
       or v_existente.nome_arquivo is distinct from v_nome
       or v_existente.tipo_mime is distinct from v_storage_mime then
      raise exception 'O caminho do comprovante ja foi usado com outros dados.'
        using errcode = 'P0602';
    end if;
    v_id := v_existente.id_financeiro_anexos;
  end if;

  return json_build_object(
    'status', 200,
    'mensagem', 'Comprovante vinculado.',
    'dados', json_build_object('id', v_id)
  );
end;
$$;

-- O RPC legado atualizava qualquer fechamento conhecido por UUID. A versao
-- endurecida exige tenant/modulo, limita tipos/tamanho e usa o usuario interno
-- autenticado no log.
create or replace function "RetificaPremium".registrar_acao_fechamento(
  p_id_fechamentos uuid,
  p_tipo text,
  p_mensagem text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_fechamento_usuario_id();
  v_tipo text := lower(btrim(p_tipo));
  v_mensagem text := nullif(btrim(p_mensagem), '');
  v_id uuid;
begin
  if p_id_fechamentos is null
     or v_tipo is null
     or v_tipo not in ('baixado', 'compartilhado', 'regenerado', 'pdf_gerado')
     or char_length(coalesce(v_mensagem, '')) > 1000 then
    raise exception 'Fechamento, tipo ou mensagem da acao invalidos.'
      using errcode = 'P0602';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );

  update "RetificaPremium"."Fechamentos" f
     set total_regeneracoes = case
           when v_tipo = 'regenerado' then f.total_regeneracoes + 1
           else f.total_regeneracoes
         end,
         total_downloads = case
           when v_tipo = 'baixado' then f.total_downloads + 1
           else f.total_downloads
         end,
         versao = case
           when v_tipo = 'regenerado' then f.versao + 1
           else f.versao
         end
    from "RetificaPremium"."Clientes" c
   where f.id_fechamentos = p_id_fechamentos
     and c.id_clientes = f.fk_clientes
     and c.fk_criado_por = v_usuario
  returning f.id_fechamentos into v_id;

  if v_id is null then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;

  insert into "RetificaPremium"."Fechamento_Logs" (
    fk_fechamentos,
    tipo,
    mensagem,
    fk_usuarios
  ) values (
    p_id_fechamentos,
    v_tipo,
    coalesce(v_mensagem, initcap(replace(v_tipo, '_', ' ')) || '.'),
    v_usuario
  );

  return json_build_object(
    'status', 200,
    'mensagem', 'Acao registrada com sucesso.'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. ACLs, search_path e retirada do acesso direto a Fechamentos
-- ---------------------------------------------------------------------------

-- Mantem o contrato legado durante a transicao, mas coloca o entitlement do
-- modulo na frente do corpo antigo sem reimplementar suas validacoes.
alter function "RetificaPremium".update_fechamento(
  uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
) rename to update_fechamento_legacy_core;

alter function "RetificaPremium".update_fechamento_legacy_core(
  uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
) set search_path = '';

create or replace function "RetificaPremium".update_fechamento(
  p_id_fechamentos uuid,
  p_label text default null,
  p_valor_total numeric default null,
  p_dados_json jsonb default null,
  p_pdf_url text default null,
  p_fk_template_documento uuid default null,
  p_documento_tema_snapshot jsonb default null,
  p_documento_config_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := "RetificaPremium".require_fechamento_usuario_id();
  v_chave text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'financeiro:fechamento:' || p_id_fechamentos::text,
      0
    )
  );
  select f.chave_idempotencia
    into v_chave
  from "RetificaPremium"."Fechamentos" f
  join "RetificaPremium"."Clientes" c on c.id_clientes = f.fk_clientes
  where f.id_fechamentos = p_id_fechamentos
    and c.fk_criado_por = v_usuario
  for update of f;

  if not found then
    raise exception 'Fechamento nao encontrado.' using errcode = 'P0404';
  end if;
  if v_chave is not null then
    raise exception 'Fechamento finalizado so pode ser alterado pelas RPCs financeiras.'
      using errcode = 'P0403';
  end if;
  return "RetificaPremium".update_fechamento_legacy_core(
    p_id_fechamentos,
    p_label,
    p_valor_total,
    p_dados_json,
    p_pdf_url,
    p_fk_template_documento,
    p_documento_tema_snapshot,
    p_documento_config_snapshot
  );
end;
$$;

-- O frontend e as Edge Functions usam RPCs; as Functions administrativas usam
-- service_role. Nao ha consumidor autenticado legitimo de .from('Fechamentos').
revoke all privileges on table "RetificaPremium"."Fechamentos"
  from public, anon, authenticated;

revoke execute on function
  "RetificaPremium".assert_fechamento_target_access(uuid),
  "RetificaPremium".require_fechamento_usuario_id(),
  "RetificaPremium".financeiro_recalcular_origem(uuid, uuid, uuid, uuid),
  "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric
  ),
  "RetificaPremium".financeiro_parcelas_fechamento_usuario(uuid, uuid),
  "RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(uuid, uuid),
  "RetificaPremium".fechamento_validar_pdf_path(uuid, text),
  "RetificaPremium".update_fechamento_legacy_core(
    uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
  )
  from public, anon, authenticated;

grant execute on function
  "RetificaPremium".assert_fechamento_target_access(uuid),
  "RetificaPremium".require_fechamento_usuario_id(),
  "RetificaPremium".financeiro_recalcular_origem(uuid, uuid, uuid, uuid),
  "RetificaPremium".financeiro_registrar_recebimento_fechamento_core(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric
  ),
  "RetificaPremium".financeiro_parcelas_fechamento_usuario(uuid, uuid),
  "RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(uuid, uuid),
  "RetificaPremium".fechamento_validar_pdf_path(uuid, text),
  "RetificaPremium".update_fechamento_legacy_core(
    uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
  )
  to service_role;

revoke execute on function
  "RetificaPremium".registrar_recebimento_fechamento(
    uuid, numeric, timestamptz, uuid, text, text, text
  ),
  "RetificaPremium".registrar_parcela_fechamento(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric
  ),
  "RetificaPremium".estornar_movimento_financeiro(uuid, text, timestamptz, text),
  "RetificaPremium".estornar_parcela_fechamento(uuid, uuid, text, timestamptz, text),
  "RetificaPremium".get_parcelas_fechamento(uuid),
  "RetificaPremium".get_parcelas_fechamento_contexto_suporte(uuid, uuid, uuid),
  "RetificaPremium".get_fechamentos_abertos_cliente(uuid),
  "RetificaPremium".get_fechamentos_abertos_cliente_contexto_suporte(uuid, uuid, uuid),
  "RetificaPremium".finalizar_fechamento(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text
  ),
  "RetificaPremium".atualizar_pdf_fechamento_seguro(uuid, text, numeric),
  "RetificaPremium".registrar_acao_fechamento(uuid, text, text),
  "RetificaPremium".insert_financeiro_anexo(uuid, text, text, text, bigint)
  from public, anon;

grant execute on function
  "RetificaPremium".registrar_recebimento_fechamento(
    uuid, numeric, timestamptz, uuid, text, text, text
  ),
  "RetificaPremium".registrar_parcela_fechamento(
    uuid, numeric, timestamptz, uuid, text, text, text, numeric
  ),
  "RetificaPremium".estornar_movimento_financeiro(uuid, text, timestamptz, text),
  "RetificaPremium".estornar_parcela_fechamento(uuid, uuid, text, timestamptz, text),
  "RetificaPremium".get_parcelas_fechamento(uuid),
  "RetificaPremium".get_parcelas_fechamento_contexto_suporte(uuid, uuid, uuid),
  "RetificaPremium".get_fechamentos_abertos_cliente(uuid),
  "RetificaPremium".get_fechamentos_abertos_cliente_contexto_suporte(uuid, uuid, uuid),
  "RetificaPremium".finalizar_fechamento(
    uuid, uuid, text, smallint, text, text, numeric, jsonb, text, text,
    uuid, jsonb, jsonb, numeric, timestamptz, uuid, text, text, text
  ),
  "RetificaPremium".atualizar_pdf_fechamento_seguro(uuid, text, numeric),
  "RetificaPremium".registrar_acao_fechamento(uuid, text, text),
  "RetificaPremium".insert_financeiro_anexo(uuid, text, text, text, bigint)
  to authenticated, service_role;

-- Contratos legados mantidos apenas para automacoes internas durante a
-- transicao. Nenhum deles pode ser uma rota alternativa para o navegador.
revoke execute on function
  "RetificaPremium".estornar_recebimento_fechamento(uuid, text, timestamptz, text),
  "RetificaPremium".marcar_fechamento_pago(uuid, timestamp without time zone, text),
  "RetificaPremium".estornar_fechamento_pago(uuid),
  "RetificaPremium".atualizar_pdf_fechamento(uuid, text),
  "RetificaPremium".insert_fechamento(uuid, text, smallint, text, text, numeric),
  "RetificaPremium".update_fechamento(
    uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
  )
  from public, anon, authenticated;

grant execute on function
  "RetificaPremium".estornar_recebimento_fechamento(uuid, text, timestamptz, text),
  "RetificaPremium".marcar_fechamento_pago(uuid, timestamp without time zone, text),
  "RetificaPremium".estornar_fechamento_pago(uuid),
  "RetificaPremium".atualizar_pdf_fechamento(uuid, text),
  "RetificaPremium".insert_fechamento(uuid, text, smallint, text, text, numeric),
  "RetificaPremium".update_fechamento(
    uuid, text, numeric, jsonb, text, uuid, jsonb, jsonb
  )
  to service_role;

-- Garantias finais de superficie. Se alguma revogacao acima nao surtir efeito,
-- a migration falha em vez de publicar uma API parcialmente endurecida.
do $$
declare
  v_function text;
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = '"RetificaPremium"."Fechamentos"'::regclass
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'PUBLIC ainda possui acesso direto a Fechamentos.';
  end if;
  if has_table_privilege(
    'authenticated',
    '"RetificaPremium"."Fechamentos"',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'authenticated ainda possui acesso direto a Fechamentos.';
  end if;
  if has_table_privilege(
    'anon',
    '"RetificaPremium"."Fechamentos"',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'anon ainda possui acesso direto a Fechamentos.';
  end if;

  foreach v_function in array array[
    '"RetificaPremium".assert_fechamento_target_access(uuid)',
    '"RetificaPremium".require_fechamento_usuario_id()',
    '"RetificaPremium".financeiro_recalcular_origem(uuid,uuid,uuid,uuid)',
    '"RetificaPremium".financeiro_registrar_recebimento_fechamento_core(uuid,numeric,timestamptz,uuid,text,text,text,numeric)',
    '"RetificaPremium".financeiro_parcelas_fechamento_usuario(uuid,uuid)',
    '"RetificaPremium".financeiro_fechamentos_abertos_cliente_usuario(uuid,uuid)',
    '"RetificaPremium".fechamento_validar_pdf_path(uuid,text)',
    '"RetificaPremium".update_fechamento_legacy_core(uuid,text,numeric,jsonb,text,uuid,jsonb,jsonb)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'Helper interno ainda exposto: %', v_function;
    end if;
    if not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role sem acesso ao helper interno: %', v_function;
    end if;
  end loop;

  foreach v_function in array array[
    '"RetificaPremium".estornar_recebimento_fechamento(uuid,text,timestamptz,text)',
    '"RetificaPremium".marcar_fechamento_pago(uuid,timestamp without time zone,text)',
    '"RetificaPremium".estornar_fechamento_pago(uuid)',
    '"RetificaPremium".atualizar_pdf_fechamento(uuid,text)',
    '"RetificaPremium".insert_fechamento(uuid,text,smallint,text,text,numeric)',
    '"RetificaPremium".update_fechamento(uuid,text,numeric,jsonb,text,uuid,jsonb,jsonb)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'RPC legada ainda exposta ao navegador: %', v_function;
    end if;
    if not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role sem acesso a RPC legada: %', v_function;
    end if;
  end loop;

  foreach v_function in array array[
    '"RetificaPremium".registrar_recebimento_fechamento(uuid,numeric,timestamptz,uuid,text,text,text)',
    '"RetificaPremium".registrar_parcela_fechamento(uuid,numeric,timestamptz,uuid,text,text,text,numeric)',
    '"RetificaPremium".estornar_movimento_financeiro(uuid,text,timestamptz,text)',
    '"RetificaPremium".estornar_parcela_fechamento(uuid,uuid,text,timestamptz,text)',
    '"RetificaPremium".get_parcelas_fechamento(uuid)',
    '"RetificaPremium".get_parcelas_fechamento_contexto_suporte(uuid,uuid,uuid)',
    '"RetificaPremium".get_fechamentos_abertos_cliente(uuid)',
    '"RetificaPremium".get_fechamentos_abertos_cliente_contexto_suporte(uuid,uuid,uuid)',
    '"RetificaPremium".finalizar_fechamento(uuid,uuid,text,smallint,text,text,numeric,jsonb,text,text,uuid,jsonb,jsonb,numeric,timestamptz,uuid,text,text,text)',
    '"RetificaPremium".atualizar_pdf_fechamento_seguro(uuid,text,numeric)',
    '"RetificaPremium".registrar_acao_fechamento(uuid,text,text)',
    '"RetificaPremium".insert_financeiro_anexo(uuid,text,text,text,bigint)'
  ] loop
    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'anon ainda pode executar RPC publica: %', v_function;
    end if;
    if not has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'Grant esperado ausente na RPC publica: %', v_function;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK OPERACIONAL (manual; nao executar sem reconciliacao)
-- ---------------------------------------------------------------------------
-- 1. Bloquear temporariamente as telas de fechamento e exportar
--    Fechamentos, Financeiro_Movimentos e Financeiro_Anexos.
-- 2. Nao remover chave_idempotencia enquanto houver valor nao nulo. Para um
--    rollback apenas de aplicacao, mantenha coluna e indice: ambos sao aditivos.
-- 3. Restaurar financeiro_recalcular_origem, estornar_movimento_financeiro,
--    registrar_recebimento_fechamento, estornar_recebimento_fechamento,
--    insert_financeiro_anexo e insert_fechamento a partir das migrations
--    20260730212717_central_financeiro_core.sql e do baseline remoto.
-- 4. Remover somente depois disso as RPCs novas:
--      finalizar_fechamento(...), atualizar_pdf_fechamento(uuid,text),
--      registrar_parcela_fechamento(...), estornar_parcela_fechamento(...),
--      get_parcelas_fechamento* e get_fechamentos_abertos_cliente*.
-- 5. Reabrir SELECT/INSERT/UPDATE/DELETE direto em Fechamentos para
--    authenticated somente se for aceito conscientemente o risco de isolamento
--    que esta migration elimina. O rollback recomendado mantem a revogacao.
-- 6. O estorno de dados financeiros deve ser sempre compensatorio; nunca
--    apagar movimentos ou comprovantes para desfazer esta feature.
