# Transferencia - Crescimento Privado E Piloto De 90 Dias

Use este documento como prompt/contexto para continuar o trabalho sem redescobrir contratos ou colocar o
Retiflow operacional em risco.

## Objetivo

Manter uma trilha auditavel:

`impressao -> clique -> contato -> cliente atribuido -> O.S. aprovada -> servicos -> comissao de 20%`

O painel e privado do Mega Master configurado em `SUPER_ADMIN_EMAILS`. Nao exponha leads, origens ou
comissoes a usuarios operacionais.

## Arquivos principais

- `src/pages/MarketingGrowth.tsx`
- `src/api/supabase/marketing.ts`
- `src/api/supabase/marketingCache.ts`
- `src/components/auth/ProtectedRoute.tsx`
- `src/services/auth/defaultRedirect.ts`
- `supabase/functions/marketing-dashboard/index.ts`
- `supabase/functions/marketing-events/index.ts`
- `supabase/migrations/20260723220000_private_marketing_growth_pilot.sql`
- `supabase/migrations/20260723225500_correct_marketing_production_domain.sql`
- `supabase/migrations/20260723232000_index_and_lock_private_marketing.sql`
- `src/test/integration/marketing-privacy.test.ts`

## Contratos e regras

- Atualizacao do frontend: polling e cache de 10 minutos.
- GA4 e Search Console sao consultados sob demanda e cacheados por 10 minutos. A atualizacao do painel nao
  elimina a defasagem propria do Google.
- Periodo aceito: 1 a 365 dias, com comparacao ao periodo anterior de mesmo tamanho.
- Dominio/propriedade correta: `premiumretifica.com.br` /
  `sc-domain:premiumretifica.com.br`.
- Google Ads oficial: `313-260-4995`. Nao usar a conta antiga como fonte oficial.
- Clique de WhatsApp e telefone cria `Marketing_Leads.status='intencao'`.
- Formulario enviado cria lead com nome/telefone/e-mail; nada digitado fica persistido antes do envio.
- Deduplicacao do WhatsApp: mesma sessao/anonymous id durante 30 minutos incrementa `duplicate_count`,
  nao cria segundo evento e nao dispara segundo alerta.
- Atribuicao automatica exige correspondencia unica por telefone ou e-mail normalizado.
- Vinculo manual ocorre apenas no painel privado, pela acao `link_client` da Edge Function.
- Comissao nasce na primeira transicao para status cujo nome normalizado e `APROVADO`.
- Base congelada: `total_servicos`; `total_produtos` apenas registra o valor excluido.
- Taxa padrao: `0.2000`. `ON CONFLICT (fk_criado_por, fk_notas_servico)` impede duplicidade.
- Cancelamento, recusa, exclusao ou edicao posterior nao apagam o snapshot.
- Service role nunca vai para o frontend.

## Seguranca

- Menu: `canUserAccessModule` recusa `marketing` para nao Mega Master em auth real.
- Rota: `/crescimento` usa `megaMasterOnly`.
- Backend: valida o JWT, o e-mail em `SUPER_ADMIN_EMAILS`, o tenant alvo ativo e o modulo habilitado.
- Banco: tabelas de marketing revogadas de `authenticated`; atribuicoes/comissoes usam RLS com politica
  explicita de negacao. Apenas Edge Functions com service role acessam.
- Eventos do site usam chave aleatoria no ambiente do Amplify; o Supabase guarda apenas SHA-256.

## Validacoes obrigatorias

Rodar antes de qualquer release:

```bash
npx --yes deno-bin check supabase/functions/marketing-dashboard/index.ts supabase/functions/marketing-events/index.ts
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:integration
```

O lint possui oito warnings antigos de Fast Refresh. Nao os confundir com erro deste modulo.

## Estado externo em 23/07/2026

- Banco e Edge Functions do backend ja aplicados/publicados.
- Site de producao ja envia eventos ao Supabase.
- Search Console ja autorizou a conta tecnica leitora usada no GA4.
- Frontend do Retiflow ainda depende de commit/push e deploy do Amplify.
- Google Ads oficial ainda depende de acesso real a conta `313-260-4995`.
- Planilha e Looker Studio devem permanecer ate o painel publicado ser validado pela conta Mega Master.

## Proximo aceite

1. Publicar o frontend do Retiflow.
2. Entrar como Mega Master e abrir `/crescimento`.
3. Confirmar GA4 e Search Console como conectados, testar 7/30/90 dias e periodo customizado.
4. Conferir um formulario real, um clique WhatsApp, vinculo a cliente, O.S. aprovada e comissao.
5. Comparar os totais com as fontes antigas.
6. Somente depois, excluir a planilha e o Looker Studio.
