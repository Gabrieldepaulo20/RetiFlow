-- Depois do saneamento dos conflitos legados, impede duplicidade numerica de O.S.
-- Exemplos bloqueados por este indice na mesma conta: "3698", "03698" e "OS-3698".

create unique index if not exists idx_notas_servico_owner_os_numeric_unique
  on "RetificaPremium"."Notas_de_Servico" (
    criado_por_usuario,
    (nullif(regexp_replace(coalesce(os, ''), '\D', '', 'g'), '')::numeric)
  )
  where criado_por_usuario is not null
    and nullif(regexp_replace(coalesce(os, ''), '\D', '', 'g'), '') is not null;
