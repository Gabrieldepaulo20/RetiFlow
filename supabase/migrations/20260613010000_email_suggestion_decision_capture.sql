-- #2 — Captura de decisões das sugestões de e-mail.
-- Base para medir assertividade e para o aprendizado por remetente/fornecedor (#3).
--
-- Aditivo e de baixo risco:
--   - novas colunas nullable (não alteram contrato existente);
--   - trigger que só preenche decidido_em na transição PENDING -> decisão terminal
--     (não interfere na reconciliação, que altera status_sugerido, não status);
--   - RPC pequena e tenant-scoped para gravar o motivo do descarte;
--   - NÃO altera aceitar_sugestao_email / ignorar_sugestao_email (caminho crítico).
--
-- Aplicado em produção via `supabase db query -f` (migrations do projeto estão
-- fora de sync com db push; este arquivo é o registro versionado).

alter table "RetificaPremium"."Sugestoes_Email"
  add column if not exists decidido_em timestamptz,
  add column if not exists motivo_descarte text;

-- Marca quando a sugestão saiu de PENDING para uma decisão terminal.
create or replace function "RetificaPremium".set_sugestao_decidido_em()
returns trigger
language plpgsql
set search_path = 'RetificaPremium', 'public'
as $$
begin
  if NEW.status is distinct from OLD.status
     and OLD.status = 'PENDING'
     and NEW.status in ('ACCEPTED', 'DISMISSED')
     and NEW.decidido_em is null then
    NEW.decidido_em := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sugestao_decidido_em on "RetificaPremium"."Sugestoes_Email";
create trigger trg_sugestao_decidido_em
  before update on "RetificaPremium"."Sugestoes_Email"
  for each row
  execute function "RetificaPremium".set_sugestao_decidido_em();

-- Registra o motivo do descarte (chamada pelo front após ignorar; best-effort).
-- Conjunto conhecido de motivos; qualquer outro valor cai em OUTRO.
create or replace function "RetificaPremium".definir_motivo_descarte_sugestao(
  p_id_sugestao uuid,
  p_motivo text
)
returns json
language plpgsql
security definer
set search_path = 'RetificaPremium', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_motivo text;
begin
  if v_uid is null then
    return json_build_object('status', 401, 'code', 'unauthorized', 'mensagem', 'Autenticação obrigatória.');
  end if;

  v_motivo := upper(coalesce(nullif(btrim(p_motivo), ''), 'OUTRO'));
  if v_motivo not in ('SPAM', 'DUPLICADO', 'NAO_E_CONTA', 'OUTRO') then
    v_motivo := 'OUTRO';
  end if;

  update "RetificaPremium"."Sugestoes_Email"
     set motivo_descarte = v_motivo
   where id_sugestoes_email = p_id_sugestao
     and fk_auth_user = v_uid;

  if not found then
    return json_build_object('status', 404, 'code', 'not_found', 'mensagem', 'Sugestão não encontrada.');
  end if;

  return json_build_object('status', 200, 'mensagem', 'Motivo registrado.');
end;
$$;

revoke all on function "RetificaPremium".definir_motivo_descarte_sugestao(uuid, text) from public;
grant execute on function "RetificaPremium".definir_motivo_descarte_sugestao(uuid, text) to authenticated;
