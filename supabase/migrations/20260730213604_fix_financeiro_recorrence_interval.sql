-- Corrige o cálculo do último dia do mês nos modelos recorrentes.
-- O literal composto anterior não é aceito pelo PostgreSQL; a subtração
-- explícita preserva a mesma regra sem depender do parser de intervalos.

create or replace function "RetificaPremium".salvar_modelo_recorrente(
  p_id_modelo_recorrente uuid,p_titulo text,p_fk_categorias uuid,p_fk_fornecedores uuid,
  p_nome_fornecedor text,p_valor numeric,p_recorrencia text,p_dia_vencimento integer,
  p_competencia_inicial date,p_forma_pagamento_prevista text,p_observacoes text,p_ativa boolean
)
returns json language plpgsql security definer set search_path=''
as $$
declare v_usuario uuid:="RetificaPremium".require_financeiro_usuario_id(); v_id uuid;
begin
  if p_valor<=0 or p_competencia_inicial is null or p_dia_vencimento not between 1 and 31
     or p_recorrencia not in ('SEMANAL','QUINZENAL','MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')
     or char_length(btrim(coalesce(p_titulo,'')))<2 then
    raise exception 'Dados do modelo recorrente invalidos.' using errcode='P0602';
  end if;
  if not exists(select 1 from "RetificaPremium"."Categorias_Contas_Pagar" c
    where c.id_categorias=p_fk_categorias and c.ativo) then
    raise exception 'Categoria de saida invalida.' using errcode='P0602';
  end if;
  if p_id_modelo_recorrente is null then
    insert into "RetificaPremium"."Financeiro_Modelos_Recorrentes"(
      fk_criado_por,fk_categorias,fk_fornecedores,titulo,nome_fornecedor,valor_original,
      forma_pagamento_prevista,recorrencia,dia_vencimento,proxima_competencia,observacoes,ativo
    ) values(v_usuario,p_fk_categorias,p_fk_fornecedores,btrim(p_titulo),nullif(btrim(p_nome_fornecedor),''),
      p_valor,nullif(btrim(p_forma_pagamento_prevista),''),p_recorrencia,p_dia_vencimento,
      date_trunc('month',p_competencia_inicial)::date,p_observacoes,coalesce(p_ativa,true))
    returning id_financeiro_modelos_recorrentes into v_id;
  else
    update "RetificaPremium"."Financeiro_Modelos_Recorrentes"
    set fk_categorias=p_fk_categorias,fk_fornecedores=p_fk_fornecedores,titulo=btrim(p_titulo),
      nome_fornecedor=nullif(btrim(p_nome_fornecedor),''),valor_original=p_valor,
      forma_pagamento_prevista=nullif(btrim(p_forma_pagamento_prevista),''),
      recorrencia=p_recorrencia,dia_vencimento=p_dia_vencimento,
      proxima_competencia=date_trunc('month',p_competencia_inicial)::date,
      observacoes=p_observacoes,ativo=coalesce(p_ativa,true),updated_at=now()
    where id_financeiro_modelos_recorrentes=p_id_modelo_recorrente and fk_criado_por=v_usuario
    returning id_financeiro_modelos_recorrentes into v_id;
    if v_id is null then raise exception 'Modelo recorrente nao encontrado.' using errcode='P0404'; end if;
    update "RetificaPremium"."Contas_Pagar" cp
       set titulo=btrim(p_titulo),fk_categorias=p_fk_categorias,
           fk_fornecedores=p_fk_fornecedores,
           nome_fornecedor=nullif(btrim(p_nome_fornecedor),''),
           valor_original=p_valor,juros=0,desconto=0,valor_final=p_valor,
           forma_pagamento_prevista=nullif(btrim(p_forma_pagamento_prevista),'')
             ::"RetificaPremium".forma_pagamento,
           data_vencimento=(case
             when p_recorrencia in ('SEMANAL','QUINZENAL') then cp.competencia_recorrencia
             else date_trunc('month',cp.competencia_recorrencia)::date+
               (least(p_dia_vencimento,extract(day from (
                 date_trunc('month',cp.competencia_recorrencia)
                   + interval '1 month' - interval '1 day'
               )))::int-1) end)::timestamp,
           observacoes=p_observacoes,updated_at=now()
     where cp.fk_modelo_recorrente=v_id
       and cp.competencia_recorrencia>=(now() at time zone 'America/Sao_Paulo')::date
       and cp.status::text in ('PENDENTE','AGENDADO')
       and coalesce(cp.valor_pago,0)=0
       and cp.excluido_em is null;
  end if;
  return json_build_object('status',200,'mensagem','Modelo recorrente salvo.',
    'dados',json_build_object('id_modelo',v_id,'id',v_id));
end $$;

create or replace function "RetificaPremium".financeiro_gerar_recorrencias_usuario(
  p_usuario_id uuid,p_ate date
)
returns json
language plpgsql security definer set search_path=''
as $$
declare v_modelo record; v_comp date; v_due date; v_next date; v_geradas int:=0; v_ignoradas int:=0;
begin
  perform "RetificaPremium".assert_financeiro_target_access(p_usuario_id);
  for v_modelo in
    select * from "RetificaPremium"."Financeiro_Modelos_Recorrentes"
    where fk_criado_por=p_usuario_id and ativo order by proxima_competencia for update
  loop
    v_comp:=v_modelo.proxima_competencia;
    while v_comp<=p_ate and (v_modelo.data_fim is null or v_comp<=v_modelo.data_fim) loop
      v_due:=case
        when v_modelo.recorrencia in ('SEMANAL','QUINZENAL') then v_comp
        else (date_trunc('month',v_comp)::date
          + (least(v_modelo.dia_vencimento,
              extract(day from (
                date_trunc('month',v_comp) + interval '1 month' - interval '1 day'
              )))::int-1))
      end;
      insert into "RetificaPremium"."Contas_Pagar"(
        titulo,fk_fornecedores,nome_fornecedor,fk_categorias,data_vencimento,
        valor_original,juros,desconto,valor_final,status,forma_pagamento_prevista,
        origem_lancamento,data_competencia,recorrencia,observacoes,urgente,
        fk_criado_por,favorecido_tipo,fk_modelo_recorrente,competencia_recorrencia
      ) values(
        v_modelo.titulo,v_modelo.fk_fornecedores,v_modelo.nome_fornecedor,
        v_modelo.fk_categorias,v_due::timestamp,v_modelo.valor_original,v_modelo.juros,
        v_modelo.desconto,greatest(0,v_modelo.valor_original+v_modelo.juros-v_modelo.desconto),
        'PENDENTE',nullif(v_modelo.forma_pagamento_prevista,'')::"RetificaPremium".forma_pagamento,
        'AUTO_SERIES',v_comp::timestamp,'NENHUMA',v_modelo.observacoes,false,
        p_usuario_id,v_modelo.favorecido_tipo,v_modelo.id_financeiro_modelos_recorrentes,v_comp
      ) on conflict (fk_modelo_recorrente,competencia_recorrencia)
        where fk_modelo_recorrente is not null and competencia_recorrencia is not null
        do nothing;
      if found then v_geradas:=v_geradas+1; else v_ignoradas:=v_ignoradas+1; end if;
      v_next:=case v_modelo.recorrencia
        when 'SEMANAL' then v_comp+7
        when 'QUINZENAL' then v_comp+15
        when 'MENSAL' then (v_comp+interval '1 month')::date
        when 'BIMESTRAL' then (v_comp+interval '2 months')::date
        when 'TRIMESTRAL' then (v_comp+interval '3 months')::date
        when 'SEMESTRAL' then (v_comp+interval '6 months')::date
        else (v_comp+interval '1 year')::date end;
      v_comp:=v_next;
    end loop;
    update "RetificaPremium"."Financeiro_Modelos_Recorrentes"
       set proxima_competencia=v_comp,updated_at=now()
     where id_financeiro_modelos_recorrentes=v_modelo.id_financeiro_modelos_recorrentes;
  end loop;
  return json_build_object('geradas',v_geradas,'ignoradas',v_ignoradas);
end $$;

revoke execute on function
  "RetificaPremium".salvar_modelo_recorrente(
    uuid,text,uuid,uuid,text,numeric,text,integer,date,text,text,boolean
  )
  from public,anon;
grant execute on function
  "RetificaPremium".salvar_modelo_recorrente(
    uuid,text,uuid,uuid,text,numeric,text,integer,date,text,text,boolean
  )
  to authenticated,service_role;

revoke execute on function
  "RetificaPremium".financeiro_gerar_recorrencias_usuario(uuid,date)
  from public,anon,authenticated;
grant execute on function
  "RetificaPremium".financeiro_gerar_recorrencias_usuario(uuid,date)
  to service_role;

-- ROLLBACK: restaurar as definições imediatamente anteriores das duas funções.
-- Não há alteração de dados nem de assinaturas nesta correção.
