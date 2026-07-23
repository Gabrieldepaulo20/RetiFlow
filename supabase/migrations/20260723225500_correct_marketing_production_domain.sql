-- Corrige a configuracao inicial para o dominio efetivamente publicado e para
-- a propriedade existente no Google Search Console.

update "RetificaPremium"."Marketing_Config" c
set
  allowed_origins = array[
    'https://premiumretifica.com.br',
    'https://www.premiumretifica.com.br'
  ],
  search_console_site_url = 'sc-domain:premiumretifica.com.br',
  search_console_status = 'not_connected',
  updated_at = now()
from "RetificaPremium"."Usuarios" u
where u.id_usuarios = c.fk_criado_por
  and lower(u.email) = lower('retificapremium5@gmail.com');
