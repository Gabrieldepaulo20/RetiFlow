# Retiflow - Guia Para Agentes

Este arquivo orienta agentes que forem trabalhar no Retiflow. Ele deve ser lido junto com `docs/contexto-sessao.md` antes de qualquer mudança.

## Escopo Do Projeto

- Stack principal: React, Vite, TypeScript, Tailwind, Supabase Auth, Supabase RPCs, Supabase Storage e Edge Functions.
- Primeira versão/piloto: clientes, notas de serviço/O.S., fechamento mensal, contas a pagar, anexos, dashboard, kanban, usuários/admin e configurações parciais.
- Fora da v1: Nota Fiscal. Não implementar, simular ou religar fluxos fiscais sem autorização explícita.

## Comandos Confirmados

- Instalar dependências: `npm install`
- Rodar ambiente local: `npm run dev`
- Build de produção: `npm run build`
- Build de desenvolvimento: `npm run build:dev`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Testes unitários: `npm test -- --run`
- Testes em watch: `npm run test:watch`
- Testes de integração: `npm run test:integration`
- Todos os testes configurados: `npm run test:all`
- Preview local do build: `npm run preview`

## Testes De Integração

- Os testes de integração usam `vitest.integration.config.ts`.
- O ambiente pode depender de `.env.integration`; se ele não existir, o harness deve pular de forma limpa, sem falhas confusas.
- Nunca versionar `.env.integration`, tokens, service role, access key, secret key ou senhas.
- Não criar dados permanentes no Supabase real sem cleanup claro.
- Ao mexer em Supabase, Storage, RPCs ou Edge Functions, rode `npm run test:integration` se o ambiente estiver configurado.

## Validações Obrigatórias

Antes de entregar uma alteração normal:

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test -- --run`
4. `npm run build`

Quando a mudança tocar integração real:

1. Rodar os quatro comandos acima.
2. Rodar `npm run test:integration` se `.env.integration` estiver configurado.
3. Relatar claramente se integração real foi executada ou pulada por falta de ambiente.

## Convenções De Código

- Fazer patches pequenos, reversíveis e focados.
- Preferir `src/api/supabase/*` para acesso ao Supabase; não acessar tabelas diretamente em componentes.
- Manter regras de negócio fora de componentes quando o fluxo crescer.
- Não reescrever `DataContext.tsx` inteiro em uma única rodada; ele ainda é legado e precisa de migração incremental.
- Reutilizar componentes existentes de UI antes de criar padrões novos.
- Evitar comportamento enganoso: se algo é parcial, local, mock ou fora da v1, a UI deve dizer isso claramente.
- Não adicionar dependência sem motivo forte e sem explicar impacto no bundle.
- Não mascarar warning/falha com fallback bonito.

## Segurança

- Nunca colocar service role no frontend.
- Operações de Auth Admin, convite, reset de senha e alteração sensível de usuários devem passar por Edge Function server-side.
- O Super Admin autorizado é configurado por `SUPER_ADMIN_EMAILS` na Function; no piloto o e-mail operacional esperado é `gabrielwilliam208@gmail.com`.
- Senhas iniciais/reset nunca devem ser hardcoded, commitadas, logadas ou exibidas permanentemente.
- A anon key do Supabase pode existir no frontend, mas ela não é autorização real. Segurança precisa estar em RLS, RPCs, policies, Storage e Edge Functions.
- `ProtectedRoute` protege UX/navegação, mas não é barreira de segurança contra atacante.
- Não expor access token, refresh token, secret key, OpenAI key, AWS key ou qualquer credencial em commit, log ou chat.
- Edge Functions sensíveis devem exigir `Authorization: Bearer <token>`.
- Edge Functions administrativas devem validar novamente o usuário autenticado no backend; esconder botão no frontend é apenas UX.
- CORS deve ser configurável por ambiente e não deve ser afrouxado sem justificativa.
- Buckets privados devem usar signed URL com expiração adequada.
- Blobs e `URL.createObjectURL` precisam de cleanup.
- Inputs vindos de IA, OCR, upload e usuário devem ser tratados como não confiáveis.

## Banco, RPCs E Storage

- O frontend consome principalmente RPCs no schema `RetificaPremium`.
- Prefira RPC existente quando ela já representa o contrato de negócio.
- Não criar migration destrutiva sem plano, rollback e aprovação.
- Não mudar policy, RLS ou bucket privacy sem plano de compatibilidade.
- Buckets sensíveis como `contas-pagar` e `fechamentos` devem permanecer privados.
- O bucket `notas` ainda requer atenção de segurança quando houver plano para migrar de URL pública para signed URL.

## Performance E Bundle

- Rotas principais já usam `React.lazy` via `src/routes/routeModules.ts`.
- `xlsx` deve continuar carregado por `import('xlsx')` apenas em importação/exportação.
- `recharts` está separado em `charts-vendor` no `vite.config.ts`; evite importar charts fora das telas que realmente usam gráficos.
- `@react-pdf/renderer` é pesado. Evite import estático em telas quando o PDF só é necessário ao gerar, baixar ou imprimir.
- Não aumentar `chunkSizeWarningLimit` só para esconder alerta.
- Se um chunk crescer, primeiro investigue imports estáticos e componentes pesados.

## Nunca Fazer Sem Autorização

- Rodar comandos destrutivos de git, como `git reset --hard` ou checkout descartando mudanças.
- Criar, alterar ou aplicar migrations destrutivas.
- Alterar RLS, policies ou privacidade de buckets sem plano.
- Expor credenciais ou pedir que o usuário cole segredo no chat.
- Colocar service role no frontend.
- Usar Supabase Auth Admin API diretamente no browser.
- Permitir que admin comum crie admin, crie usuário, resete senha ou altere módulos sem validação server-side.
- Colocar senha temporária em README, migration, teste, fixture ou código.
- Reativar mocks em produção.
- Implementar Nota Fiscal fora do escopo aprovado.
- Trocar stack, roteador, provider de auth ou arquitetura de dados em refactor amplo.
- Adicionar dependências grandes sem medir impacto.

## Fluxo Recomendado Para Mudanças

1. Ler `docs/contexto-sessao.md`.
2. Rodar `git status --short`.
3. Inspecionar arquivos relevantes antes de editar.
4. Fazer patch pequeno.
5. Rodar validações obrigatórias.
6. Revisar `git diff`.
7. Commitar com mensagem objetiva.
8. Push somente depois de validações passarem.

## Áreas De Maior Risco

- `src/contexts/DataContext.tsx`: grande, legado e central para múltiplos fluxos.
- `src/api/supabase/*`: contratos de persistência e integração.
- `supabase/functions/*`: segurança, CORS, uso de IA e validação server-side.
- PDF/preview de O.S. e fechamento: performance, blob cleanup, impressão e fidelidade visual.
- Contas a pagar com IA: uploads, anexos, OCR/IA, dados financeiros e Storage.
- Auth/admin/permissões: UX no front não substitui segurança real no backend.
