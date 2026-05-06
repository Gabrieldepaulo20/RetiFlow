# Retiflow - Security Audit Report

Data da auditoria: 2026-05-05  
Escopo: analise estatica defensiva do repositorio Retiflow, configuracoes versionadas, Supabase migrations/functions, frontend React/Vite e testes locais.  
Fora de escopo nesta rodada: ataque a producao, brute force, DoS, exploracao destrutiva, exfiltracao, testes contra terceiros e alteracao de dados reais.

## 1. Stack e mapa tecnico

| Area | Evidencia no repo | Observacao de seguranca |
| --- | --- | --- |
| Frontend | `React`, `Vite`, `TypeScript`, `react-router-dom`, `@supabase/supabase-js` em `package.json` | SPA com chave anon publica por design; seguranca real precisa estar em grants/RLS/RPCs/Storage/Edge Functions. |
| Auth | `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `src/services/auth/*` | Supabase Auth real em producao, MFA TOTP habilitado no config local, timeout de inatividade no frontend. |
| Rotas | `src/App.tsx`, `src/components/auth/ProtectedRoute.tsx` | Controle visual/UX de rotas no frontend; backend precisa reforcar permissoes. |
| Banco | `supabase/migrations/*`, schema `RetificaPremium`, wrappers `src/api/supabase/*` | Front chama RPCs no schema `RetificaPremium`; migrations recentes revogam anon/public em RPCs operacionais. |
| Storage | buckets `notas`, `fechamentos`, `contas-pagar` | Buckets privados, mas policies atuais permitem qualquer `authenticated` por bucket, sem isolamento por owner/tenant no Storage. |
| Edge Functions | `supabase/functions/*` | Funcoes sensiveis validam `Authorization: Bearer <jwt>` no codigo e usam service role somente server-side. |
| IA/LLM | `supabase/functions/analisar-conta-pagar/index.ts` | Upload de documentos para OpenAI Files, resposta JSON validada/sanitizada e arquivo removido em `finally`. Falta rate limit por usuario/cota. |
| Email/AWS SES | `support-ticket`, `admin-users` | Segredos ficam server-side em Supabase Function env. Chamado tem rollback se email falha. |
| Gmail OAuth | `gmail-oauth-start`, `gmail-oauth-callback`, `gmail-scan-payables` | Refresh token criptografado com `GOOGLE_TOKEN_ENCRYPTION_KEY`; falta rate limit de scan por usuario. |
| Deploy | `amplify.yml`, `customHttp.yml` | Build no Amplify e headers versionados em `customHttp.yml`. CSP foi endurecida nesta rodada apos achado do Burp. |
| Observabilidade | `src/lib/monitoring.ts` | AWS RUM opcional, com envs publicas de monitor/identity pool; cuidado com PII em telemetria HTTP. |

Referencias usadas para criterio:
- OWASP API Security Top 10 2023: Broken Object Level Authorization, Broken Authentication, Broken Object Property Level Authorization, Unrestricted Resource Consumption e Security Misconfiguration.
- OWASP Top 10 Web Application Security Risks.
- Supabase RLS: dados acessados pelo browser exigem RLS/policies server-side, nao apenas protecao de UI.
- Supabase Edge Functions Auth: `verify_jwt` e validacao de `Authorization: Bearer <user-jwt>`.
- Supabase Storage Access Control: policies devem restringir bucket e owner/folder quando aplicavel.

## 2. Ferramentas e comandos executados

| Comando | Resultado |
| --- | --- |
| `git status --short` | Sem alteracoes antes da criacao destes documentos. |
| `git log -1 --oneline` | `0dc2893 chore: add gitleaks secret scanning` |
| `gitleaks detect --source . --redact=100 --exit-code 2` | Passou, sem leaks no historico local. |
| `gitleaks detect --source . --no-git --redact=100 --exit-code 2` | Passou, sem leaks no working tree. |
| `npm audit --audit-level=low --json` | 7 vulnerabilidades: 1 high (`xlsx`), 3 moderate, 3 low. |
| Buscas `rg` por secrets, direct table access, `dangerouslySetInnerHTML`, `getPublicUrl`, `service_role`, `localStorage`, RPCs e policies | Achados detalhados abaixo. |

## [HIGH] Storage privado sem isolamento por usuario/tenant

Categoria: Broken Access Control / IDOR / Multi-tenant isolation; File Upload, Storage, SSRF and Path Traversal  
Status: CONFIRMED  
Arquivos envolvidos:
- `supabase/migrations/20260505201000_harden_anon_surface.sql`
- `src/api/supabase/notas.ts`
- `src/api/supabase/fechamentos.ts`
- `src/api/supabase/contas-pagar.ts`

Evidencia:
- As policies de `notas`, `fechamentos` e `contas-pagar` usam somente `bucket_id = ... and auth.uid() is not null`.
- `uploadNotaPDF` salva em `notas/YYYY/MM/OS-numero.pdf`, sem prefixo de usuario/tenant.
- `uploadFechamentoPDF` salva em `${idFechamento}.pdf`, sem prefixo de usuario/tenant.
- `uploadAnexoContaPagar` salva em `${contaPagarId}/...`; o UUID reduz adivinhacao, mas a policy nao valida dono da conta.

Risco:
Um usuario autenticado que obtenha ou adivinhe um path pode gerar signed URL, sobrescrever ou apagar arquivos de outro usuario, dependendo das permissoes de Storage e do path.

Como poderia impactar o SaaS:
Vazamento de PDFs de O.S., fechamentos e anexos financeiros entre clientes/tenants. Isso e P0 para SaaS multi-tenant.

Correcao recomendada:
- Migrar paths para prefixo com owner/tenant: `auth_user_id/...` ou `tenant_id/...`.
- Alterar policies usando `storage.foldername(name)` e/ou ownership derivado de tabelas relacionais.
- Para objetos legados sem prefixo, gerar signed URL por Edge Function/RPC que primeiro valida permissao no banco.
- Adicionar teste de integracao: usuario A nao consegue criar signed URL/baixar arquivo do usuario B.

Correcao aplicada:
Nao aplicada nesta fase porque exige migration/policy de compatibilidade e pode quebrar PDFs existentes se feita sem plano.

Teste/validacao:
Confirmado por leitura de migrations e wrappers. Requer teste negativo real apos migration.

Status final:
Aberto. P0 antes de producao ampla.

## [HIGH] Dependencia `xlsx` com vulnerabilidade sem fix oficial no audit

Categoria: Vulnerable Dependencies and Supply Chain  
Status: CONFIRMED  
Arquivos envolvidos:
- `package.json`
- `package-lock.json`
- `src/pages/IntakeNotes.tsx`

Evidencia:
- `npm audit` reportou `xlsx` como high, range `*`, `fixAvailable: false`.
- Uso no frontend via import dinamico para exportacao Excel: `const XLSX = await import('xlsx')`.

Risco:
Mesmo que o uso atual pareca exportacao, manter uma dependencia high sem fix aumenta superficie de supply chain e risco futuro se ela passar a processar arquivo de usuario.

Como poderia impactar o SaaS:
Possivel exploracao em processamento de planilhas, poluicao de prototipo/ReDoS ou bugs conhecidos da lib, dependendo do vetor exato do advisory.

Correcao recomendada:
- Confirmar se `xlsx` e usado apenas para exportar dados controlados.
- Se for apenas exportacao simples, substituir por CSV gerado manualmente ou biblioteca mantida.
- Se manter temporariamente, nao aceitar `.xlsx` de usuario com essa lib e documentar excecao com prazo.

Correcao aplicada:
Nao aplicada nesta fase para nao alterar funcionalidade de exportacao sem teste visual/manual.

Teste/validacao:
`npm audit --audit-level=low --json`.

Status final:
Aberto. P1 alto.

## [MEDIUM] CSP permitia fontes amplas para script/style/object/frame

Categoria: Security Misconfiguration; Injection/XSS defense-in-depth  
Status: CONFIRMED MITIGATED  
Arquivos envolvidos:
- `customHttp.yml`
- `src/lib/printPdf.ts`
- `src/components/notes/LazyNotaPDFViewer.tsx`

Evidencia:
- Burp Suite apontou a CSP anterior como permitindo fontes nao confiaveis para script/style/object/frame.
- Header anterior tinha `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`, `connect-src ... data: blob:`, `frame-src 'self' blob: data:` e `object-src 'self' blob: data:`.
- O app usa PDF/print com blob em iframe (`openPdfPrintDialog` e `PDFViewer`), portanto `blob:` em `frame-src` tem uso real.

Risco:
CSP permissiva aumenta impacto de XSS e permite superficies desnecessarias como `object-src` e `data:`/`blob:` em `connect-src`.

Como poderia impactar o SaaS:
Se algum componente futuramente introduzir XSS, o atacante pode operar com o JWT do usuario autenticado dentro da janela da sessao. `object-src` aberto tambem aumenta risco com plugins/embeds legados.

Correcao recomendada:
- Remover `unsafe-inline` de `script-src`.
- Manter `unsafe-inline` em `style-src` temporariamente por uso de estilos inline/componentes.
- Remover `data:` e `blob:` de `connect-src`.
- Trocar `object-src` para `'none'`.
- Remover `data:` de `frame-src`, mantendo `blob:` por uso real em PDF/print.
- Adicionar `upgrade-insecure-requests`.

Correcao aplicada:
Aplicada em `customHttp.yml`:
- Antes: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`; depois: `script-src 'self' 'wasm-unsafe-eval'`.
- Antes: `connect-src ... data: blob:`; depois: somente app, Supabase, ViaCEP e BrasilAPI.
- Antes: `frame-src 'self' blob: data:`; depois: `frame-src 'self' blob:`.
- Antes: `object-src 'self' blob: data:`; depois: `object-src 'none'`.
- Adicionado `upgrade-insecure-requests`.

Teste/validacao:
- `npm run build`, `npx tsc --noEmit`, `npm run lint` e `npm test -- --run` passaram apos a mudanca.
- Validacao manual recomendada no Amplify: login, dashboard, preview de O.S., abrir para imprimir, baixar PDF, fechamento e importacao IA.

Status final:
Mitigado no repo; pendente confirmar que o Amplify esta servindo `customHttp.yml` atualizado apos deploy.

## [MEDIUM] `analisar-conta-pagar` usa `verify_jwt=false`

Categoria: Authentication, Session, JWT and Cookies; Security Misconfiguration  
Status: LIKELY  
Arquivos envolvidos:
- `supabase/config.toml`
- `supabase/functions/analisar-conta-pagar/index.ts`

Evidencia:
- `supabase/config.toml` define `[functions.analisar-conta-pagar] verify_jwt = false`.
- A function valida manualmente Bearer token via `auth.getUser(token)`.

Risco:
A implementacao atual bloqueia chamadas sem token, mas a seguranca depende 100% do codigo da function. Uma refatoracao futura poderia remover/ver enfraquecer a validacao sem a barreira de plataforma.

Como poderia impactar o SaaS:
Uso anonimo de IA, custo alto e processamento indevido de documentos.

Correcao recomendada:
- Avaliar ativar `verify_jwt=true` para functions client-authenticated.
- Se mantiver `false`, preservar testes negativos sem Authorization e documentar o motivo.

Correcao aplicada:
Nao aplicada nesta fase; mudanca pode exigir redeploy e teste com `supabase.functions.invoke`.

Teste/validacao:
Leitura do config e codigo. Ha validacao manual no codigo.

Status final:
Aberto como hardening.

## [MEDIUM] Falta rate limit/cota server-side para IA de documentos

Categoria: Rate Limit, Abuse Protection and Resource Consumption; AI/LLM-Specific Security Issues  
Status: LIKELY  
Arquivos envolvidos:
- `supabase/functions/analisar-conta-pagar/index.ts`
- `src/api/supabase/contas-pagar.ts`

Evidencia:
- Function exige auth, limita MIME e tamanho a 15MB.
- Nao foi encontrado contador/cota por usuario, tenant, dia ou minuto antes da chamada para OpenAI.

Risco:
Conta comprometida ou usuario malicioso pode gerar custo alto via chamadas repetidas, mesmo sem DoS volumetrico.

Como poderia impactar o SaaS:
Custo inesperado com OpenAI, lentidao operacional e possivel bloqueio por limite do provedor.

Correcao recomendada:
- Criar tabela/RPC de `ai_usage_limits` por `auth.uid()`.
- Limitar arquivos por janela, tamanho total diario e tentativas com erro.
- Registrar uso minimo sem armazenar conteudo sensivel do documento.

Correcao aplicada:
Nao aplicada nesta fase.

Teste/validacao:
Confirmado por leitura do fluxo.

Status final:
Aberto. P1.

## [MEDIUM] Gmail scan possui limite de lote, mas nao rate limit por usuario

Categoria: Rate Limit, Abuse Protection and Resource Consumption; Unsafe Consumption of APIs  
Status: LIKELY  
Arquivos envolvidos:
- `supabase/functions/gmail-scan-payables/index.ts`

Evidencia:
- `maxResults` do Gmail esta limitado a 10.
- Nao foi encontrado bloqueio por intervalo de scan por usuario.

Risco:
Usuario pode repetir busca manual muitas vezes e consumir Google API/CPU/DB.

Como poderia impactar o SaaS:
Custo operacional e lentidao; tambem pode gerar muitas sugestoes se a deduplicacao falhar.

Correcao recomendada:
- Rejeitar scan manual se `last_sync_at` for recente, salvo Mega Master/debug.
- Registrar e limitar erros repetidos.

Correcao aplicada:
Nao aplicada nesta fase.

Teste/validacao:
Leitura da function.

Status final:
Aberto. P2/P1 conforme uso real.

## [MEDIUM] Persistencia de sessao no browser aumenta impacto de XSS

Categoria: Authentication, Session, JWT and Cookies  
Status: CONFIRMED / ACCEPTED_RISK  
Arquivos envolvidos:
- `src/lib/supabase.ts`
- `src/contexts/AuthContext.tsx`

Evidencia:
- Supabase client usa `persistSession: true`, `autoRefreshToken: true`.
- O app remove o espelho legado `auth.session` em modo real; tokens ficam no storage gerenciado pelo SDK.

Risco:
Em SPA, se houver XSS, o atacante pode operar como usuario ate expiracao/revogacao. Isso nao e bug isolado da anon key; e arquitetura comum de SPA com Supabase Auth.

Como poderia impactar o SaaS:
Tomada de sessao de usuario, especialmente grave para Mega Master/Admin.

Correcao recomendada:
- CSP forte.
- MFA obrigatorio para Mega Master/Admin.
- Timeout de inatividade ja existe; manter e testar.
- Evitar `dangerouslySetInnerHTML` com dados de usuario.
- Considerar arquitetura BFF/httpOnly cookies no futuro se o risco exigir.

Correcao aplicada:
Mitigacoes existentes: timeout de inatividade, MFA TOTP configurado, remocao de `auth.session` em modo real.

Teste/validacao:
Leitura de `AuthContext` e `supabase.ts`.

Status final:
Mitigado parcialmente.

## [LOW] `dangerouslySetInnerHTML` em chart precisa manter entrada controlada

Categoria: Injection / XSS  
Status: LIKELY  
Arquivos envolvidos:
- `src/components/ui/chart.tsx`

Evidencia:
- `ChartStyle` injeta CSS via `dangerouslySetInnerHTML` com cores de `ChartConfig`.

Risco:
Se `config.color` ou keys passarem a vir de usuario/banco sem validacao, pode haver injecao CSS/HTML contextual.

Como poderia impactar o SaaS:
Baixo no estado atual, porque configs parecem internas. Pode virar medio se dashboards customizaveis por cliente forem implementados.

Correcao recomendada:
- Validar cores com allowlist/regex (`#hex`, `rgb`, `hsl`, CSS var interna).
- Nao aceitar keys livres de usuario.

Correcao aplicada:
Nao aplicada nesta fase.

Teste/validacao:
Leitura de `chart.tsx`.

Status final:
Monitorar.

## [LOW] Impressao de PDF usa `document.write`, mas escapa atributos

Categoria: Injection / XSS  
Status: CONFIRMED MITIGATED  
Arquivos envolvidos:
- `src/lib/printPdf.ts`

Evidencia:
- `openPdfPrintDialog` usa `popup.document.write`.
- `title` e `url` passam por `escapeHtmlAttribute`.

Risco:
Baixo no estado atual. O risco principal seria chamar esse helper com URL nao confiavel ou HTML nao escapado.

Como poderia impactar o SaaS:
XSS em popup/print ou navegacao indesejada se futuramente removerem escape.

Correcao recomendada:
- Manter escape.
- Preferir DOM API em refactor futuro.

Correcao aplicada:
Ja mitigado no codigo atual.

Teste/validacao:
Leitura de `printPdf.ts`.

Status final:
Aceitavel.

## [MEDIUM] CORS depende de secrets corretos em producao

Categoria: Security Misconfiguration  
Status: LIKELY  
Arquivos envolvidos:
- `supabase/functions/admin-users/index.ts`
- `supabase/functions/support-ticket/index.ts`
- `supabase/functions/gmail-*`
- `supabase/functions/analisar-conta-pagar/index.ts`

Evidencia:
- Funcoes implementam fail-closed local: sem env, apenas local origins ou `null`.
- Com `CORS_ALLOWED_ORIGINS='*'`, o codigo so permite localDevOrigins.

Risco:
Se env de producao estiver ausente ou incorreto, browser pode falhar; se for alterado futuramente para `*` de verdade, aumenta superficie.

Como poderia impactar o SaaS:
Falhas de integracao no frontend ou exposicao de functions a origins nao desejadas.

Correcao recomendada:
- Confirmar no Supabase: `CORS_ALLOWED_ORIGINS=https://main.d2uhqgjfktej3l.amplifyapp.com`.
- Teste automatizado de CORS para origin permitido e origin negado.

Correcao aplicada:
Codigo ja esta fail-closed; precisa validar env runtime.

Teste/validacao:
Leitura das functions.

Status final:
Mitigado no codigo, pendente runtime.

## [LOW] CloudWatch RUM pode capturar telemetria HTTP com PII se configurado sem cuidado

Categoria: Logging and Monitoring; Sensitive Data Exposure  
Status: LIKELY  
Arquivos envolvidos:
- `src/lib/monitoring.ts`

Evidencia:
- `telemetries: ['performance', 'errors', 'http']`.
- `sessionSampleRate: 1`.

Risco:
Dependendo da configuracao AWS RUM, URLs, erros e metadados de requisicoes podem conter PII operacional.

Como poderia impactar o SaaS:
Dados de cliente em logs/telemetria desnecessarios.

Correcao recomendada:
- Revisar redaction/allowlist do RUM.
- Reduzir sample rate em producao se necessario.
- Nao logar bodies, tokens ou signed URLs.

Correcao aplicada:
Nao aplicada nesta fase.

Teste/validacao:
Leitura do arquivo.

Status final:
Monitorar.

## [LOW] Dados locais legados ainda usam localStorage em modo mock/rascunho/UI

Categoria: Authentication; Sensitive Data Exposure  
Status: CONFIRMED  
Arquivos envolvidos:
- `src/services/storage/dataPersistence.ts`
- `src/pages/MonthlyClosing.tsx`
- `src/pages/Kanban.tsx`
- `src/services/auth/moduleAccess.ts`
- `src/services/auth/systemUsers.ts`

Evidencia:
- Uso de `localStorage` para estado legado, rascunhos de fechamento e preferencias visuais.
- Em modo real, `AuthContext` remove `auth.session`, reduzindo risco de token duplicado.

Risco:
PII ou dados operacionais podem permanecer no navegador local se rascunhos/dados legados forem usados em producao.

Como poderia impactar o SaaS:
Exposicao local no dispositivo compartilhado e confusao de tenant se dados locais forem usados indevidamente.

Correcao recomendada:
- Auditar cada chave localStorage e limpar ao logout quando contiver dado operacional.
- Manter em localStorage apenas preferencias visuais nao sensiveis.

Correcao aplicada:
Nao aplicada nesta fase.

Teste/validacao:
Busca estatica por `localStorage`.

Status final:
Parcialmente mitigado.

## [LOW] `developmentAuthService` tem senha demo hardcoded, mas fora de producao real

Categoria: Authentication, Session, JWT and Cookies  
Status: CONFIRMED MITIGATED  
Arquivos envolvidos:
- `src/services/auth/developmentAuthService.ts`
- `src/services/auth/authProvider.ts`

Evidencia:
- Senha `demo123` para modo de desenvolvimento.
- Contexto do projeto exige `VITE_AUTH_MODE=real` em producao.

Risco:
Se Amplify/producao usar `VITE_AUTH_MODE` incorreto, login mock pode expor ambiente.

Como poderia impactar o SaaS:
Acesso indevido em ambiente real se modo mock for publicado.

Correcao recomendada:
- Manter teste que bloqueia mock em producao.
- Conferir env Amplify antes de release.

Correcao aplicada:
Ja existem hardenings/testes no historico do projeto segundo contexto.

Teste/validacao:
Leitura estatica.

Status final:
Aceitavel com checklist de release.

## [NOT_APPLICABLE] CSRF tradicional

Categoria: CSRF  
Status: NOT_APPLICABLE / LOW  
Arquivos envolvidos:
- `src/lib/supabase.ts`
- `src/api/supabase/*`

Evidencia:
- Requisicoes Supabase/Functions usam Bearer token/API key em headers via JS, nao cookies ambient authority para endpoints app-owned.

Risco:
CSRF classico e menos aplicavel. XSS/session theft continua sendo risco relevante.

Como poderia impactar o SaaS:
Baixo no desenho atual.

Correcao recomendada:
- Se futuramente usar cookies httpOnly/BFF, adicionar CSRF token/SameSite.

Correcao aplicada:
Nao aplicavel.

Teste/validacao:
Analise de arquitetura.

Status final:
Nao aplicavel no estado atual.

## [CONFIRMED GOOD] Admin sensivel passa por Edge Function com service role server-side

Categoria: API Authorization, Mass Assignment and Excessive Data Exposure  
Status: CONFIRMED  
Arquivos envolvidos:
- `supabase/functions/admin-users/index.ts`
- `supabase/migrations/20260505203000_restrict_admin_rpcs_to_service_role.sql`
- `src/api/supabase/admin-users.ts`

Evidencia:
- Function exige Bearer token, valida `auth.getUser(token)`, exige perfil interno administrador ativo e allowlist `SUPER_ADMIN_EMAILS`.
- RPCs admin foram restritas a `service_role`.
- Service role aparece apenas em Edge Functions/testes de integracao, nao no frontend.

Risco:
Risco residual depende de env correto e ausencia de bug na function.

Como poderia impactar o SaaS:
Se quebrado, escalacao de privilegio. No codigo atual, esta bem melhor que chamada direta do frontend.

Correcao recomendada:
- Manter testes negativos.
- Logar auditoria de acoes admin sem tokens/secrets.

Correcao aplicada:
Ja implementado antes desta auditoria.

Teste/validacao:
Leitura estatica e existencia de teste `admin-escalation-hardening`.

Status final:
Aceitavel, com monitoramento.

## [CONFIRMED GOOD] Anon/public foram revogados do schema operacional

Categoria: Broken Access Control; API Authorization  
Status: CONFIRMED  
Arquivos envolvidos:
- `supabase/migrations/20260505201000_harden_anon_surface.sql`
- `supabase/migrations/20260504123000_revoke_public_rpc_execute.sql`

Evidencia:
- Revoga `usage`, table privileges, sequence privileges e execute de `anon/public` no schema `RetificaPremium`.
- Grants de functions foram ajustados para `authenticated/service_role`.

Risco:
Reduz muito o problema relatado de anon key funcionando como API aberta.

Como poderia impactar o SaaS:
Sem essa protecao, qualquer anon key poderia chamar RPCs/tabelas. Com ela, anon key so deve servir como identificador publico do projeto, nao permissao de dados.

Correcao recomendada:
- Rodar testes negativos periodicamente contra Supabase real.
- Garantir migrations aplicadas no projeto remoto.

Correcao aplicada:
Ja aplicada em migrations anteriores.

Teste/validacao:
Leitura estatica; testes de integracao existentes citados no contexto.

Status final:
Bom, pendente monitoramento.

## 3. Cobertura das 10 categorias obrigatorias

| Categoria | Estado |
| --- | --- |
| 1. Broken Access Control / IDOR / Multi-tenant | Parcialmente mitigado em RPCs; Storage ainda tem gap confirmado. |
| 2. Auth, Session, JWT, Cookies | Supabase Auth real, MFA/timeout; risco residual SPA/localStorage e `verify_jwt=false` em uma function. |
| 3. API Authorization / Mass Assignment | RPCs/Edge Functions melhoraram; admin sensivel server-side. Precisa continuar testando payloads sensiveis. |
| 4. Injection | Sem SQL string concat/shell/eval relevante encontrado. `dangerouslySetInnerHTML` em chart e `document.write` mitigado merecem cuidado. |
| 5. Security Misconfiguration | CORS fail-closed no codigo; CSP endurecida no `customHttp.yml`; env/runtime ainda precisam verificacao. |
| 6. Secrets/Keys Leakage | Gitleaks limpo; service role nao no frontend. Exemplos usam placeholders. |
| 7. Vulnerable Dependencies | `xlsx` high sem fix; Vite/esbuild/PostCSS/jsdom advisories. |
| 8. Upload/Storage/SSRF/Path Traversal | MIME/tamanho na IA; storage owner isolation insuficiente; filename sanitizado em anexos. |
| 9. Rate Limit/Abuse | Chamados tem rate limit; IA/Gmail precisam cota/limite server-side. |
| 10. AI/LLM-specific | Prompt/output estruturados e arquivo OpenAI deletado; falta rate limit/custo e politica de privacidade/retencao clara. |

## 4. Validacao manual ainda necessaria

1. Confirmar no Supabase Dashboard que as migrations de grants e storage foram aplicadas ao projeto remoto.
2. Testar, com dois usuarios reais de teste, que usuario A nao acessa dados/RPCs do usuario B.
3. Testar especificamente Storage: usuario A nao deve conseguir signed URL de arquivo de usuario B apos a correcao futura.
4. Verificar headers reais no Amplify publicado.
5. Confirmar `VITE_AUTH_MODE=real` e `VITE_SUPABASE_ANON_KEY` correta no Amplify.
6. Confirmar `CORS_ALLOWED_ORIGINS` nas Supabase Functions.
7. Confirmar MFA exigido para Mega Master/Admin no fluxo real.

## 5. Riscos residuais principais

1. Storage multi-tenant e o risco mais importante encontrado nesta rodada.
2. Dependencia `xlsx` high deve ser removida/substituida ou formalmente aceita com restricao de uso.
3. CSP foi endurecida, mas ainda precisa validacao no Amplify publicado e revisao futura para remover `style-src 'unsafe-inline'`.
4. IA/Gmail precisam rate limit server-side para evitar abuso/custo.

## 6. Proximos passos com Burp Suite Professional/OWASP ZAP em staging

1. Usar apenas staging com dados fake e usuarios de teste.
2. Rodar baseline crawl autenticado como usuario comum e como admin.
3. Testar IDOR manual com troca de UUIDs em RPC params: clientes, notas, contas, fechamentos, anexos.
4. Testar Edge Functions sem Bearer, com Bearer invalido, com usuario comum e com admin.
5. Testar CORS com origins nao permitidas.
6. Testar upload de arquivos invalidos/grandes em IA e anexos.
7. Confirmar que respostas nao retornam stack trace, secrets, tokens ou dados de outro tenant.
