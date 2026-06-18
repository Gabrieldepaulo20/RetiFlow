-- Padroniza variações conhecidas de Sertãozinho e evita novas gravações inconsistentes.

create or replace function "RetificaPremium".normalize_cidade_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when regexp_replace(
      lower(translate(
        btrim(p_value),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      )),
      '[^a-z0-9]',
      '',
      'g'
    ) in ('sertaozinho', 'sertazinho') then 'Sertãozinho'
    else btrim(p_value)
  end;
$$;

create or replace function "RetificaPremium".normalize_enderecos_cidade_trigger()
returns trigger
language plpgsql
set search_path = '"RetificaPremium"', public
as $$
begin
  new.cidade := "RetificaPremium".normalize_cidade_text(new.cidade);
  return new;
end;
$$;

create or replace function "RetificaPremium".normalize_configuracoes_empresa_cidade_trigger()
returns trigger
language plpgsql
set search_path = '"RetificaPremium"', public
as $$
begin
  new.cidade := "RetificaPremium".normalize_cidade_text(new.cidade);
  return new;
end;
$$;

create or replace function "RetificaPremium".normalize_marketing_site_eventos_city_trigger()
returns trigger
language plpgsql
set search_path = '"RetificaPremium"', public
as $$
begin
  new.city := "RetificaPremium".normalize_cidade_text(new.city);
  return new;
end;
$$;

drop trigger if exists trg_normalize_enderecos_cidade on "RetificaPremium"."Enderecos";
create trigger trg_normalize_enderecos_cidade
before insert or update of cidade on "RetificaPremium"."Enderecos"
for each row execute function "RetificaPremium".normalize_enderecos_cidade_trigger();

drop trigger if exists trg_normalize_configuracoes_empresa_cidade on "RetificaPremium"."Configuracoes_Empresa_Usuario";
create trigger trg_normalize_configuracoes_empresa_cidade
before insert or update of cidade on "RetificaPremium"."Configuracoes_Empresa_Usuario"
for each row execute function "RetificaPremium".normalize_configuracoes_empresa_cidade_trigger();

drop trigger if exists trg_normalize_marketing_site_eventos_city on "RetificaPremium"."Marketing_Site_Eventos";
create trigger trg_normalize_marketing_site_eventos_city
before insert or update of city on "RetificaPremium"."Marketing_Site_Eventos"
for each row execute function "RetificaPremium".normalize_marketing_site_eventos_city_trigger();

update "RetificaPremium"."Enderecos"
set cidade = "RetificaPremium".normalize_cidade_text(cidade)
where cidade is not null
  and cidade is distinct from "RetificaPremium".normalize_cidade_text(cidade);

update "RetificaPremium"."Configuracoes_Empresa_Usuario"
set cidade = "RetificaPremium".normalize_cidade_text(cidade)
where cidade is not null
  and cidade is distinct from "RetificaPremium".normalize_cidade_text(cidade);

update "RetificaPremium"."Marketing_Site_Eventos"
set city = "RetificaPremium".normalize_cidade_text(city)
where city is not null
  and city is distinct from "RetificaPremium".normalize_cidade_text(city);
