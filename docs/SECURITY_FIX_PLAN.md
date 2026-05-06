# Retiflow - Security Fix Plan

Objetivo: corrigir os riscos confirmados da auditoria com patches pequenos, reversiveis e testaveis, sem mascarar falhas e sem depender de seguranca no frontend.

## P0 - Antes de producao ampla

### 1. Isolamento real de Storage por usuario/tenant

Problema:
- Buckets estao privados, mas policies permitem qualquer `authenticated` por bucket.
- Paths atuais nao carregam owner/tenant de forma uniforme.

Plano seguro:
1. Inventariar todos os registros que gravam `pdf_url`, anexos de contas e fechamentos.
2. Criar helpers de path novo:
   - `notas/{auth_user_id}/YYYY/MM/OS-n.pdf`
   - `fechamentos/{auth_user_id}/{idFechamento}.pdf`
   - `contas-pagar/{auth_user_id}/{contaPagarId}/arquivo`
3. Criar migration nao destrutiva:
   - manter bucket privado;
   - trocar policies para exigir `(storage.foldername(name))[1] = auth.uid()::text` para novos paths;
   - manter compatibilidade legada somente via Edge Function/RPC que valida dono no banco antes de gerar signed URL.
4. Atualizar wrappers:
   - upload sempre usa path com owner;
   - leitura sempre passa por signed URL;
   - nunca expor signed URL em WhatsApp.
5. Testes:
   - unitarios de extracao/normalizacao de path;
   - integracao com usuario A/B: A nao consegue signed URL de B;
   - regressao para PDF legado.

Risco:
- Medio, porque pode quebrar PDFs existentes se migration nao preservar legado.

Validacoes:
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `npm run test:integration`

### 2. Confirmar grants/RPCs no Supabase remoto

Problema:
- Repo contem migrations de hardening, mas seguranca real depende de estarem aplicadas no projeto remoto.

Plano seguro:
1. Rodar introspeccao somente leitura no Supabase/staging:
   - grants de `anon/public/authenticated/service_role`;
   - policies de `storage.objects`;
   - RLS habilitado nas tabelas sensiveis;
   - functions admin restritas a `service_role`.
2. Registrar resultado em `docs/contexto-sessao.md`.
3. Adicionar teste de integracao que falha se anon conseguir chamar RPC sensivel.

Risco:
- Baixo se somente leitura.

## P1 - Alta prioridade

### 3. Remover ou substituir `xlsx`

Problema:
- `npm audit` reporta vulnerabilidade high sem fix disponivel.

Plano seguro:
1. Concluido: uso atual era exportacao em `src/pages/IntakeNotes.tsx`.
2. Concluido: XLSX foi substituido por CSV com escape correto.
3. Concluido: helper protege contra CSV/spreadsheet formula injection.
4. Concluido: `xlsx` foi removido de `package.json` e `package-lock.json`.

Risco:
- Baixo/medio, concentrado em exportacao.

Status:
- Mitigado. Validar manualmente download CSV no navegador apos deploy.

### 4. Security headers/CSP no Amplify

Problema:
- Burp Suite apontou CSP com permissoes amplas para script/style/object/frame.

Plano seguro:
1. Aplicado hardening minimo em `customHttp.yml`.
2. Manter `frame-src blob:` por uso real de PDF/print.
3. Manter `style-src 'unsafe-inline'` temporariamente para nao quebrar componentes/inline styles.
4. Validar no Amplify publicado que o header novo esta ativo.
5. Em uma fase posterior, avaliar remover `style-src 'unsafe-inline'` com nonces/hashes ou refactor de estilos.

Headers sugeridos:
- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `frame-ancestors 'none'`

Risco:
- Medio, porque CSP pode quebrar PDF, Supabase, Google OAuth ou AWS RUM se restritiva demais.

Status:
- Parcialmente mitigado. Falta teste manual no dominio publicado apos deploy.

### 5. Rate limit server-side para IA e Gmail

Problema:
- IA e Gmail possuem auth e limites parciais, mas nao quota por usuario.

Plano seguro:
1. Criar tabela/RPC de uso por usuario/dia para actions caras.
2. `analisar-conta-pagar`: limitar arquivos por minuto/dia e tamanho total.
3. `gmail-scan-payables`: limitar scan manual por intervalo; cron separado.
4. Retornar 429 com mensagem clara.

Risco:
- Baixo se bem isolado.

### 6. Revisar `verify_jwt=false` em `analisar-conta-pagar`

Problema:
- Auth depende de validacao manual no codigo.

Plano seguro:
1. Testar em staging com `verify_jwt=true`.
2. Se `supabase.functions.invoke` continuar enviando Bearer corretamente, ativar platform check.
3. Manter validacao manual como segunda camada.
4. Adicionar teste negativo sem Authorization.

Risco:
- Baixo/medio, pode quebrar chamada se env/token estiverem errados.

## P2 - Hardening importante

### 7. Reduzir PII em localStorage/telemetria

Plano:
1. Listar chaves localStorage em runtime.
2. Remover dados operacionais de localStorage quando houver persistencia real no banco.
3. Limpar rascunhos sensiveis no logout.
4. Revisar AWS RUM para nao coletar bodies, tokens, signed URLs ou PII.

### 8. Testes sentinela de autorizacao

Plano:
1. E2E mock para rotas e acesso negado.
2. Integracao real para:
   - anon nao chama RPC sensivel;
   - usuario comum nao chama admin;
   - usuario A nao acessa detalhe de B;
   - usuario A nao acessa storage de B apos P0.

### 9. Auditoria de payload/mass assignment por RPC

Plano:
1. Revisar cada RPC que aceita `jsonb` ou payload amplo.
2. Garantir allowlist de campos server-side.
3. Testar tentativa de enviar campos sensiveis (`auth_id`, `role`, `fk_usuarios`, `status`, `admin`).

## P3 - Melhorias preventivas

1. Substituir `document.write` por DOM API no helper de impressao.
2. Validar cores em `ChartConfig` antes de CSS injection.
3. Documentar threat model multi-tenant.
4. Rodar `npm audit` em CI.
5. Rodar `gitleaks detect --source . --redact=100` em CI.

## Ordem recomendada

1. P0 Storage owner isolation.
2. P0 Confirmar grants/policies no Supabase remoto.
3. P1 `xlsx` removido; validar exportacao CSV em staging.
4. P1 validar CSP/security headers no Amplify publicado.
5. P1 Rate limits IA/Gmail.
6. P1 `verify_jwt=true` em `analisar-conta-pagar`, se staging confirmar.
7. P2 Mass assignment tests.

## Criterio de aceite para producao ampla

- Anon key nao chama RPC/table operacional.
- Usuario A nao le, altera, baixa ou assina arquivo/dado do usuario B.
- Mega Master/Admin continua funcionando com MFA/timeout.
- Functions sensiveis rejeitam sem Bearer e com usuario comum.
- Gitleaks limpo.
- `npm audit` sem high exploravel em runtime ou com excecao formal documentada.
- CSP/security headers testados em staging sem quebrar PDF/Gmail/Auth.
