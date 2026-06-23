# Contexto da Sessao - Retiflow

Atualizado em: 2026-06-22

---

## Auditoria De Estabilidade, Reload E Performance - 2026-06-22

- Pedido: analisar profundamente o sistema para reduzir risco de reload cair em tela de problema, "Algo deu
  errado" ou "Tentar novamente", alem de revisar falhas de navegacao, auth, dependencias e performance.
- Corrigido o maior risco de UX em reload autenticado:
  - `ProtectedRoute` nao mostra mais "Falha ao carregar perfil" / "Tentar novamente" quando a sessao existe
    mas o perfil falha momentaneamente;
  - agora tenta recuperar automaticamente a sessao/perfil ate 3 vezes com estado neutro "Reconectando sessao";
  - se ainda falhar, mantem o usuario fora de login/access-denied e mostra "Conexao instavel" + "Verificar sessao".
- `ErrorBoundary` global tambem deixou de usar a copia vermelha "Algo deu errado" / "Tentar novamente";
  o fallback generico agora e neutro ("Estamos restaurando esta tela" / "Reabrir tela"). O caso de chunk/deploy
  novo continua com recuperacao propria e CTA "Nova versao disponivel / Recarregar agora".
- E2E `route-refresh-access` ficou mais forte:
  - valida `/dashboard`, `/clientes`, `/notas-entrada`, `/kanban`, `/contas-a-pagar`, `/fechamento`,
    `/admin` e `/admin/usuarios` antes/depois de reload;
  - falha se aparecer fallback global, "Falha ao carregar perfil", "Reconectando sessao", "Tentar novamente"
    ou "Reabrir tela".
- E2Es antigos de login/auth foram atualizados para a UI atual:
  - heading atual: "Entrar na sua conta";
  - campo de senha usa seletor exato `textbox` para nao conflitar com botao "Mostrar senha";
  - sentinelas de admin operacional ajustados para comportamento real do menu atual.
- Dependencias:
  - `npm audit fix` sem `--force` atualizou lockfile e removeu vulnerabilidade alta de producao em `ws`,
    alem de atualizar `postcss`, `react-router-dom`/`@remix-run/router` e dependencias relacionadas;
  - `npm audit --omit=dev --audit-level=high` passa;
  - residual conhecido: 2 vulnerabilidades moderadas em `uuid < 11.1.1` via `aws-rum-web <= 2.1.0`.
    O `npm audit fix --force` recomenda `aws-rum-web@3.1.0` (breaking). Foi testado antes e revertido porque
    nao removeu de forma limpa a cadeia do `uuid`; melhor tratar numa etapa separada de observabilidade.
- Performance/build:
  - `react-pdf.browser` segue grande (~1.46 MB), mas isolado em chunk dinamico;
  - `charts-vendor` segue isolado;
  - `index` ainda passa de 500 KB (~540 KB) e merece etapa futura de reducao de imports compartilhados;
  - build ainda alerta sobre `src/lib/supabase.ts` ser importado de forma estatica e dinamica, sem falhar.
- Sem migration, sem RPC nova, sem Storage/Auth/Edge Function nesta etapa.
- Validado:
  - `npm run typecheck`
  - `npx tsc --noEmit`
  - `npm run lint` (apenas 8 avisos antigos de Fast Refresh)
  - `npm test -- --run` (55 arquivos, 415 testes)
  - `npm run build` (passou; avisos conhecidos de Browserslist/dynamic import/chunk size)
  - `npm run test:integration` (17 arquivos, 55 testes; logs de erro em testes negativos esperados)
  - `CI=1 npx playwright test e2e/navigation.spec.ts e2e/route-surface.spec.ts e2e/auth.spec.ts e2e/access-matrix.spec.ts e2e/route-refresh-access.spec.ts` (26 testes)
  - `gitleaks detect --source . --no-git --redact=100` (sem vazamentos)
  - `npm audit --omit=dev --audit-level=high` (sem high/critical de producao)

---

## Clientes - Remocao Do Bloco De Acoes Comerciais - 2026-06-22

- Pedido: remover do modulo de Clientes o bloco/texto "Acoes para trazer dinheiro"; isso nao deve aparecer
  para a cliente.
- `src/pages/Clients.tsx` foi simplificado:
  - removido o card de topo "Oportunidades";
  - removido o bloco "Acoes para trazer dinheiro";
  - removido o filtro "Com oportunidade";
  - removida a coluna/CTA de oportunidade dos cards mobile e da tabela desktop.
- O modulo continua com cadastro/edicao/detalhe/exportacao, busca, filtros por status/CPF-CNPJ/CRM, classe ABC,
  risco, tendencia, faturamento, quantidade de O.S. e ultima O.S.
- Sem migration, sem RPC nova, sem Storage/Auth/Edge Function nesta etapa.

---

## Fechamento Mensal - Periodo Primeiro, Cliente Depois - 2026-06-22

- Bug critico corrigido: selecionar cliente nao chama mais RPC para "carregar periodos", portanto nao aparece
  toast vermelho "Erro ao carregar periodos do cliente" antes de o usuario escolher o periodo.
- Decisao de produto: fluxo correto do fechamento mensal agora e **escolher mes/ano -> escolher cliente com
  O.S. no periodo -> gerar rascunho**. Isso combina melhor com o trabalho real da cliente.
- A lista de clientes e filtrada pelo periodo selecionado e mostra a quantidade de O.S. daquele cliente; se
  nao houver O.S. entregue/sem fechamento no periodo, aparece aviso neutro no card, sem toast destrutivo.
- `MonthlyClosing` nao usa mais `p_apenas_sem_fechamento` para montar periodos ou ao gerar rascunho. Na geracao,
  busca as O.S. do cliente e filtra `fk_fechamentos`/`closingId` no front para evitar duplicidade.
- `IntakeNote` ganhou `closingId?: string | null` e `supabaseToIntakeNote` mapeia `fk_fechamentos`, permitindo
  filtrar O.S. ja fechadas tambem nos dados carregados no contexto.
- E2E `e2e/monthly-closing.spec.ts` atualizado para validar mes -> cliente -> gerar e confirmar que o toast
  vermelho de periodos nao aparece.
- Sem migration, sem RPC nova, sem Storage/Auth/Edge Function nesta etapa.
- Validado:
  - `npm run typecheck`
  - `npx tsc --noEmit`
  - `npm run lint` (apenas 8 avisos antigos de Fast Refresh)
  - `npm test -- --run` (55 arquivos, 413 testes)
  - `npm run build` (avisos conhecidos de Browserslist/dynamic import/chunk size)
  - `npm run test:integration` (17 arquivos, 55 testes; logs de erro em testes negativos esperados)
  - `CI=1 npx playwright test e2e/monthly-closing.spec.ts`

---

## Fechamento Mensal - Competencia Pela Entrada Da O.S. - 2026-06-22

- Bug critico investigado: Junho aparecia como `158` no fechamento porque a tela ainda agrupava por
  `finalizedAt ?? updatedAt`. As O.S. legadas foram finalizadas/atualizadas em lote em junho, inflando o
  contador.
- Regra corrigida: fechamento mensal agora agrupa pela **data de entrada/criacao da O.S.** (`createdAt` /
  `created_at`) e continua incluindo somente O.S. faturaveis (`ENTREGUE`, `RECUSADO`, `SEM_CONSERTO`, com
  legado `Finalizado -> ENTREGUE`) sem `fk_fechamentos`.
- Caminhos alinhados:
  - dropdown de meses/contadores (`availablePeriods`);
  - lista de clientes do periodo;
  - geracao real de rascunho via `getNotasServico`;
  - helper de dominio `getClosingCompetenceDate`;
  - testes unitarios do fechamento.
- A mensagem da tela agora diz "O.S. faturaveis" para explicar por que o numero do fechamento pode ser menor
  que o total de O.S. criadas no modulo de Notas de Entrada.
- Evidencia read-only em PROD para Retifica Premium:
  - regra antiga por finalizacao/update em Junho/2026: `158`;
  - todas O.S. criadas em Junho/2026: `82`;
  - O.S. faturaveis sem fechamento em Junho/2026: `63`;
  - O.S. ainda em fluxo em Junho/2026: `18`;
  - anuladas/canceladas em Junho/2026: `1`.
- Sem migration, sem RPC nova, sem Storage/Auth/Edge Function nesta etapa.
- Validado:
  - `npm run typecheck`
  - `npx tsc --noEmit`
  - `npm run lint` (apenas 8 avisos antigos de Fast Refresh)
  - `npm test -- --run` (55 arquivos, 414 testes)
  - `npm run build` (avisos conhecidos de Browserslist/dynamic import/chunk size)
  - `CI=1 npx playwright test e2e/monthly-closing.spec.ts`
  - `npm run test:integration` (17 arquivos, 55 testes; logs de erro em testes negativos esperados)

---

## Fechamento Mensal - Data De Corte Personalizada - 2026-06-22

- Pedido: a cliente precisa escolher o dia do fechamento, nao apenas mes/ano.
- Implementado no card "Novo rascunho de fechamento":
  - seletor `Mês inteiro` / `Personalizado`;
  - no modo `Personalizado`, campo `Data de corte`;
  - a regra do periodo personalizado e **do primeiro dia do mes da data escolhida ate a data de corte**.
    Exemplo: `20/06/2026` fecha `01/06/2026 a 20/06/2026`.
- O cliente continua sendo escolhido depois do periodo; a lista de clientes e os contadores passam a obedecer
  o corte personalizado.
- Rascunhos novos salvam `periodMode` e `cutoffDate`; rascunhos antigos continuam abrindo como `Mês inteiro`.
- Sem migration, sem RPC nova, sem Storage/Auth/Edge Function nesta etapa.
- Validado:
  - `npm test -- --run src/test/monthly-closing.service.test.ts`
  - `npm run typecheck`
  - `npx tsc --noEmit`
  - `npm run lint` (apenas 8 avisos antigos de Fast Refresh)
  - `npm test -- --run` (55 arquivos, 415 testes)
  - `npm run build` (avisos conhecidos de Browserslist/dynamic import/chunk size)
  - `CI=1 npx playwright test e2e/monthly-closing.spec.ts`
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge
  Function nem migration.

---

## Correcao De Dado: O.S. Anteriores A 01/06 Marcadas Como PAGO - 2026-06-22

- Pedido: toda O.S. de servico ANTERIOR a 01/06/2026 (legado) deve ficar PAGO; as de 01/06 em diante
  (sistema novo) NAO sao tocadas. Motivo: o controle de pagamento so passou a valer no sistema novo.
- Executado em PROD (autorizado) via `supabase db query --linked`:
  `UPDATE "RetificaPremium"."Notas_de_Servico" SET payment_status='PAGO'
   WHERE created_at < '2026-06-01' AND payment_status IS DISTINCT FROM 'PAGO';` (97 linhas).
- `pago_em` deixado NULO de proposito: assim as legadas NAO entram em "Recebido"/caixa de junho
  (que exige paidAt >= 01/06), so saem de "A receber". (NUNCA setar pago_em = finalizado_em: o legado
  foi finalizado em lote em junho e inflaria o caixa do mes.)
- Verificacao remota: antes de 01/06 = 857 todas PAGO (0 pendentes); depois de 01/06 intocado
  (84 pendentes, 0 marcadas por engano). Sem migration (correcao de dado pontual).

---

## Resquicios Lovable + Erro Ao Recarregar (chunk antigo) - 2026-06-21

- Investigado o repo inteiro: NAO ha texto "lovable"/"gpteng" em codigo, index.html, package.json ou
  vite.config. O unico resquicio era `public/favicon.ico` (binario, do commit de scaffold `a772b50`).
  O `favicon.svg` ja era branded (engrenagem laranja Retifica). Acao: removido `favicon.ico` + o link
  `alternate icon` no index.html; agora so o SVG branded (navegadores modernos). Se ainda aparecer o
  icone antigo, e cache do browser — hard refresh resolve.
- Erro "recarrega -> pagina de erro -> recarrega de novo e funciona": causa = chunk antigo apos deploy.
  O `chunkRecovery` so ouvia eventos (`vite:preloadError`/`unhandledrejection`), mas quando o `React.lazy`
  falha ele LANCA no render -> caia no `ErrorBoundary` ("Algo deu errado") sem auto-recuperar. Fix:
  `chunkRecovery` agora exporta `recoverFromChunkLoadError`; o `ErrorBoundary` chama no `componentDidCatch`
  (recarrega 1x/URL via guard em sessionStorage) e mostra CTA "Nova versao disponivel / Recarregar agora"
  quando o erro e de chunk. So frontend. Validado: typecheck (strict), lint, 413 testes, build.
- A VERIFICAR no console do AWS Amplify (NAO da pra resolver no repo): regra de **SPA rewrite**
  (`/<*> -> /index.html 200`) para refresh em rota profunda nao dar 404. `customHttp.yml` ja manda
  `Cache-Control: no-cache, no-store` em tudo (index sempre revalida).

---

## Clientes - CRM Comercial MVP - 2026-06-21

- Pedido: transformar o modulo de Clientes em uma base de CRM mais util para a dona da Retifica Premium
  enxergar onde agir para trazer mais dinheiro.
- Frontend:
  - `src/pages/Clients.tsx` virou uma tela de CRM comercial, mantendo cadastro/edicao/detalhe/exportacao;
  - topo mostra receita mapeada, receita em risco e clientes Classe A;
  - filtros incluem status, CPF/CNPJ e visoes comerciais (`Em risco`, `Crescendo`, `Classe A`,
    `So 1 O.S.`);
  - cards mobile e tabela desktop mostram classe ABC, risco, tendencia, faturamento, quantidade de O.S., ultima O.S.
    e acoes operacionais de ver/editar;
  - CSV de clientes agora exporta campos de CRM.
- Dominio:
  - `src/services/domain/customerCrm.ts` calcula ABC, risco de abandono, tendencia 90d vs 90d anteriores,
    receita total faturavel, ticket medio, run rate mensal, receita em risco e oportunidades ordenadas por prioridade;
  - faturamento do CRM considera apenas `BILLABLE_STATUSES` e ignora `EXCLUIDA`;
  - sem IA, sem banco novo e sem Edge Function nesta fase: tudo derivado dos clientes + notas ja carregados.
- Testes:
  - `src/test/customer-crm.test.ts` cobre ABC, queda de receita, primeira O.S. sem recorrencia e exclusao de O.S.
    anulada da receita;
  - `e2e/helpers.ts` ajustado para o E2E mirar explicitamente o campo `Senha`, porque o botao "Mostrar senha"
    tambem tinha label com "senha" e quebrava o Playwright em modo strict.
- Validacoes executadas:
  - `npm test -- --run src/test/customer-crm.test.ts`: passou, 4 testes;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 55 arquivos e 412 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size;
  - `npx playwright test e2e/clients.spec.ts`: passou, 2 testes no Chromium.
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Recebimento Das Notas (Pago/Pendente) + Plano Do Fechamento B2B - 2026-06-21

### Modelo de pagamento (decidido, profissional)
- Dois eixos JA existem e sao independentes: fluxo (`status`) x pagamento (`paymentStatus` PENDENTE/PAGO
  + `paidAt` + `paidWith`). **Entregue NUNCA significa pago automaticamente** — a O.S. fica Entregue +
  Pendente ate registrar o recebimento. Isso resolve a duvida do cliente.
- Dois cenarios de recebimento:
  - **B2C (paga na entrega):** registra o recebimento na propria nota (1 clique).
  - **B2B (CNPJ, paga no fim do mes):** O.S. ficam Entregue + Pendente o mes todo (contam como "A receber")
    e entram no fechamento; quando o fechamento e pago, TODAS as O.S. dele viram Pago de uma vez (cascata).
- "A receber" (Dashboard) = faturavel (ENTREGUE/RECUSADO/SEM_CONSERTO) + Pendente; snapshot, nao do periodo.

### FEITO — Peca 1 (frontend): recebimento no pop-up
- `NoteDetailModal` (pop-up do Kanban e de Notas de Entrada) ganhou, no card Pagamento, os botoes
  "Registrar recebimento" (faturavel + pendente; escolhe forma + data) e "Estornar recebimento"
  (admin, pago) — mesmo contrato do `IntakeNoteDetail`. Usa `registrarRecebimentoNota`/
  `estornarRecebimentoNota`. So frontend. Validado: npm run typecheck (strict), lint, 408 testes, build.

### Peca 2a FEITA (frontend) — O.S. paga no rascunho/PDF do fechamento
- O rascunho agora considera `paymentStatus`: O.S. ja paga aparece ACINZENTADA, com badge "Ja recebido
  · DD/MM", checkbox desabilitado e FORA do total (nunca entra em includedNoteIds/notas/cascata).
- Resumo do rascunho: "Total a pagar no fechamento" + bloco verde "Ja recebido no periodo: R$ Y (N O.S.)".
- `FechamentoDadosJson` ganhou `recebidas[]` + `total_ja_recebido`; PDF (`ClosingPDFTemplate`) e preview
  (`ClosingHtmlPreview`) mostram a secao "Ja recebido (nao incluso no total a pagar)" e renomeiam o total
  para "TOTAL A PAGAR". `NotaServico` (api) passou a declarar payment_status/pago_em/pago_com.
- So frontend. Validado: npm run typecheck (strict), lint, 412 testes, build.

### Peca 2b FEITA — fechamento pago + cascata - 2026-06-22
- **BACKEND APLICADO (2026-06-22):** migration `20260622120000_fechamento_payment_and_cascade.sql`.
  - `Fechamentos` += `status_pagamento` (CHECK PENDENTE/PAGO, default PENDENTE) + `pago_em` + `pago_com`.
  - RPC `marcar_fechamento_pago(id, pago_em, pago_com)`: valida dono (via `Clientes.fk_criado_por`),
    seta o fechamento PAGO e cascateia `UPDATE Notas_de_Servico SET payment_status='PAGO', pago_em, pago_com
    WHERE fk_fechamentos=id AND payment_status<>'PAGO'`.
  - RPC `estornar_fechamento_pago(id)`: volta o fechamento p/ PENDENTE e reverte SO as O.S. cujo `pago_em`
    == o `pago_em` do fechamento (pagas por esta cascata; nao mexe nas pagas individualmente).
  - `get_fechamentos` (+ variante suporte) retornam `status_pagamento`/`pago_em`/`pago_com`.
  - SECURITY DEFINER, grants authenticated+service_role, idempotente, rollback no .sql. Verificado no
    catalogo (colunas+2 RPCs+get com status); `db lint` sem erros; `test:integration` ok (17 arq, 55).
- Frontend: `fechamentos.ts` (tipo + `marcarFechamentoPago`/`estornarFechamentoPago`), `_base.ts` bloqueia
  as 2 novas RPCs em modo suporte, `MonthlyClosing` mostra badge Pago/A receber no card do fechamento
  gerado + botao "Marcar pago" (forma+data) + "Estornar" (admin), desabilitados em suporte.
- Validado: npm run typecheck (strict), lint, 413 testes, build, test:integration.
- Observacao: O.S. afetadas pela cascata so refletem no Dashboard/Notas apos recarregar (DataContext nao
  refaz fetch automatico). Aceitavel; melhoria futura = refresh apos a acao.

### LICAO DE DEPLOY (importante)
- O Amplify roda `npm run typecheck` = `tsc -p tsconfig.app.json` (**strict: true / strictNullChecks ON**).
  Validar SEMPRE com `npm run typecheck`, NAO com `npx tsc --noEmit` (usa tsconfig.json com
  strictNullChecks:false e nao pega varios erros). Um build do Amplify ja falhou por isso nesta sessao
  (mock de DataCtx sem `updateCategoriaClasse`), corrigido em `e3ce902`.

---

## Fase 2 (DRE) - Classe Contabil Nas Categorias + DRE No Dashboard - 2026-06-21

- Objetivo: padrao profissional (SAP/TOTVS) - separar custo de despesa para existir Lucro Bruto/DRE.
- **BACKEND APLICADO (2026-06-21):** migration `20260621183000_payable_category_accounting_class.sql`.
  - `Categorias_Contas_Pagar` ganhou coluna `classe text` (CHECK: NULL ou CUSTO/DESPESA/IMPOSTO/FINANCEIRO).
  - Backfill por nome aplicado: distribuicao remota confirmada CUSTO=2, DESPESA=5, IMPOSTO=1 (0 nulas).
  - `get_categorias_conta_pagar` agora retorna `classe` (corpo identico ao dump remoto + a coluna; nao ha
    variante de suporte dessa GET). `insert/update_categoria_conta_pagar` NAO foram alterados (write-path).
  - Aditivo, idempotente, reversivel (rollback no .sql). Aplicado via `supabase db query --linked -f` +
    `migration repair --status applied 20260621183000`. `db lint` so com os 4 warnings legados conhecidos.
    `test:integration` passou (17 arquivos, 55 testes).
- Frontend:
  - `PayableCategoryClass` + `classe?` em `PayableCategory` + `PAYABLE_CATEGORY_CLASS_LABELS` (`src/types`).
  - adapter `supabaseToPayableCategory` mapeia `classe` (tolerante a ausencia); seed
    `DEFAULT_PAYABLE_CATEGORIES` classificado.
  - `src/services/domain/dre.ts`: `sumPayablesByClass` + `computeDRE` (puros, testados em `dre.test.ts`).
  - `src/pages/Dashboard.tsx`: card "DRE do periodo" (competencia) - Receita - Impostos = Liquida;
    - Custos = Lucro Bruto; - Despesas = Operacional; - Despesas financeiras = Lucro Liquido; + margens.
    Contas com categoria sem classe entram como despesa com aviso ambar (transparencia).
- **Fase 2 parte 2 APLICADA (2026-06-21):** migration `20260621193000_payable_category_classe_write.sql`.
  `insert_categoria_conta_pagar` e `update_categoria_conta_pagar` ganharam `p_classe` (DROP da assinatura
  antiga + CREATE da nova p/ evitar overload duplicado; re-grant `authenticated`+`service_role`, revoga
  `public`; validacao de classe; rollback no .sql). Catalogo remoto confirmou 1 overload de cada com
  `p_classe` e ACL correto. `db lint` so com os 4 warnings legados; `test:integration` ok (17 arq, 55).
  Variantes `*_contexto_suporte` NAO foram alteradas (follow-up) — UI desabilita reclassificacao em suporte.
  Front: `categorias.ts` (insert/update aceitam `p_classe`), `DataContext.updateCategoriaClasse`
  (otimista + reverte em erro), aba "Plano de contas" em Configuracoes (`PlanoDeContasPanel`) lista as
  categorias e edita a classe; desabilitada em modo suporte.
- Branches: `feat/fase2-dre` (parte 1), `feat/fase2-dre-classify` (parte 2). Validado: tsc, lint, 408
  testes unit, build, test:integration.

---

## Dashboard - Competência Da Receita Por Regra De Corte (Cutover) - 2026-06-21

- SUPERA a regra anterior de faturar por `createdAt`. A cliente pediu padrão profissional
  (SAP/TOTVS): receita reconhecida na entrega (fato gerador). Problema: O.S. legadas (sistema
  antigo) entraram como ABERTO e foram finalizadas em LOTE num único dia, então `finalizedAt`
  delas é o dia do batch e empilharia tudo num mês só.
- Regra implementada em `getDashboardRevenueDate` (`src/services/domain/dashboardFinance.ts`),
  usando o corte contabil `01/06/2026` (`DASHBOARD_ACCOUNTING_START_TIME`):
  - O.S. legada (`createdAt < 01/06/2026`): competência = `deadline` (prazo); sem prazo, `createdAt`.
    NUNCA `finalizedAt` (foi batch).
  - O.S. nova (`createdAt >= 01/06/2026`): competência = `finalizedAt` (entrega real); fallback
    `deadline`, depois `createdAt`.
- Tudo continua limitado a `BILLABLE_STATUSES` (ENTREGUE/RECUSADO/SEM_CONSERTO). Datas "só data"
  (prazo) normalizadas por `toComparableTime` (meia-noite local, evita vazamento de mês em UTC-3).
- Textos/tooltips do Dashboard atualizados de "por entrada da O.S." para "por entrega da O.S.
  (legado: prazo)". Gráfico financeiro e resultado anual usam a mesma data de competência.
- Decisão relacionada: Dashboard (entrega) x Fechamento (finalizedAt) seguem com semântica
  próxima; Fechamento ganhou legenda explicando que agrupa por finalização/entrega.
- Documento de arquitetura financeira (2 regimes, DRE, fluxo de caixa, estoque/CMV futuro,
  roadmap) gerado como artifact para a cliente.
- Sem mudança de banco/RPC/Storage/Auth/Edge Function. Validado: tsc, lint, 399 testes, build.
- Pendente combinado: Fase 1 = bloco Caixa no Dashboard (Recebido x Pago -> Saldo, A receber/A
  pagar). Fase 2 = DRE + plano de contas (custo x despesa). Fase 3 = estoque + CMV (custo médio).

---

## Dashboard - Faturamento Pela Data De Entrada Da O.S. - 2026-06-21

- Pedido/regra final esclarecida:
  - faturamento da O.S. deve pertencer ao mes em que a O.S. foi criada/lancada no sistema;
  - prazo, pagamento, atualizacao ou finalizacao posterior nao podem mover faturamento para outro mes;
  - exemplo: O.S. criada em 29/05 com prazo em 03/06 e finalizada/paga em junho entra no faturamento de maio;
  - fechamento em lote de O.S. legadas/importadas nao pode inflar o dia/mes em que o lote foi finalizado.
- Frontend/dominio:
  - `src/services/domain/dashboardFinance.ts` agora usa somente `createdAt` como data de competencia do faturamento;
  - O.S. faturavel continua limitada aos status `ENTREGUE`, `RECUSADO` e `SEM_CONSERTO`;
  - o corte de `01/06/2026` permanece apenas para contas pagas/lucro, porque as saidas anteriores nao tem base completa;
  - `src/pages/Dashboard.tsx` calcula `Faturamento real`, grafico financeiro e resultado anual pela data de entrada da O.S.;
  - textos/tooltip do Dashboard foram ajustados para explicar que prazo/finalizacao/pagamento nao alteram o mes de faturamento;
  - o atalho do card `Faturamento real` deixou de usar o status antigo `FINALIZADO` e agora abre `ENTREGUE`.
- Teste:
  - `src/test/dashboard-finance.test.ts` cobre O.S. criada em maio com prazo/finalizacao em junho, O.S. criada em junho finalizada em julho e lote legado finalizado em junho.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npm test -- --run src/test/dashboard-finance.test.ts`: passou, 5 testes;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 52 arquivos e 386 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size.
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Notas De Entrada - Filtro Por Valor Da O.S. - 2026-06-21

- Pedido: adicionar filtro para buscar O.S. por valores.
- Frontend:
  - `src/pages/IntakeNotes.tsx` adicionou `Valor minimo` e `Valor maximo` no modal de filtros;
  - o intervalo fica em rascunho e so aplica ao clicar em `Confirmar filtros`, seguindo o contrato dos demais filtros;
  - o filtro aceita formatos brasileiros como `500`, `500,00`, `1.250` e `R$ 1.250,50`;
  - quando minimo e maximo sao informados invertidos, o dominio normaliza o intervalo automaticamente;
  - com filtro de valor ativo, a tela usa a lista local carregada no contexto para evitar totais/paginacao errados, ja que a RPC atual nao filtra por valor;
  - o badge `Valor: ...` aparece nos filtros ativos e pode ser clicado para limpar o intervalo.
- Dominio/testes:
  - `src/services/domain/intakeNotesList.ts` ganhou helpers `parseIntakeNoteValueFilter`, `normalizeIntakeNoteValueRange` e `isIntakeNoteInValueRange`;
  - `src/test/intake-notes-list.test.ts` cobre parsing de moeda BR, normalizacao do intervalo e inclusao/exclusao por valor total da O.S.
- Validacao visual local:
  - ambiente mock abriu `/notas-entrada` e o modal exibiu os campos `Valor minimo` e `Valor maximo`;
  - o navegador local nao registrou erros de console no carregamento/abertura do modal.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run src/test/intake-notes-list.test.ts`: passou, 6 testes;
  - `npm test -- --run`: passou, 52 arquivos e 386 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size.
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Notas De Entrada - Cards Do Dashboard Do Modulo Com Filtro Completo - 2026-06-21

- Pedido: corrigir o dashboard/cards do modulo de Notas de Entrada, porque ao filtrar faturamento por meses os calculos ficavam errados.
- Causa encontrada:
  - em ambiente real, a lista de O.S. usa paginacao server-side de 50 registros;
  - os cards do topo estavam calculando totais em cima da pagina atual (`filtered`) em vez do conjunto completo filtrado;
  - por isso meses com mais de 50 O.S. mostravam contagem e valores parciais.
- Correcoes:
  - `src/services/domain/intakeNotesList.ts` ganhou `calculateIntakeNotesSummary`, centralizando contagem total, O.S. em andamento, O.S. faturaveis, valor total, valor faturavel e data mais recente;
  - `src/pages/IntakeNotes.tsx` agora calcula os cards a partir de todas as O.S. carregadas no contexto com os filtros locais aplicados, enquanto a tabela/lista continua paginada;
  - o card financeiro agora exibe `Faturamento do filtro` usando somente o valor faturavel/finalizado; o total bruto das O.S. filtradas aparece apenas como contexto secundario;
  - quando o filtro nao pode ser completamente resolvido pelo servidor, a tela usa paginacao local para manter lista e totais consistentes;
  - o filtro por cliente tambem passa a ser respeitado nos calculos locais em ambiente real.
- Teste adicionado:
  - `src/test/intake-notes-list.test.ts` cobre o caso de 80 O.S. filtradas no mes, garantindo que os cards somem o conjunto completo e nao apenas a primeira pagina de 50.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run src/test/intake-notes-list.test.ts`: passou, 5 testes;
  - `npm test -- --run`: passou, 52 arquivos e 385 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size.
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## O.S. Legadas - Observacoes Iguais Ao Sistema Antigo - 2026-06-21

- Pedido: as observacoes exibidas/impressas na nota/O.S. nao estavam iguais ao sistema antigo; precisavam vir exatamente do campo `servico.observacoes` do RDS legado.
- Causa encontrada:
  - `scripts/oneoff/import-legacy-notes-company5.mjs` montava `observacoes` com texto extra de auditoria:
    `Solicitante legado...` e `Importado da base antiga...`.
- Correcoes:
  - o importador legado agora grava somente a observacao original do legado, preservando quebras de linha e removendo apenas espacos externos;
  - criado script `scripts/oneoff/sync-legacy-note-observations-company5.mjs`, com dry-run por padrao e `--apply` explicito;
  - o script sincroniza somente O.S. com correspondencia segura entre RDS e Retiflow:
    match exato de O.S. ou match numerico unico dos dois lados;
  - conflitos de numeracao/zero a esquerda e O.S. faltantes no Retiflow ficam fora da alteracao.
- Execucao real aplicada em 2026-06-21:
  - `node scripts/oneoff/sync-legacy-note-observations-company5.mjs --apply`;
  - 866 O.S. da Retifica Premium atualizadas;
  - 864 tinham marcador de importacao;
  - 2 estavam com observacao vazia e receberam a observacao do legado;
  - 0 falhas;
  - dry-run posterior confirmou `866` como `already_equal` e `0` atualizacoes pendentes;
  - consulta remota confirmou `0` notas da Retifica Premium ainda com marcador `Importado da base antiga Retifica Premium` em `observacoes`.
- Relatorios locais gerados em:
  - `outputs/relatorios/2026-06-21T01-43-42-431Z-sync-observacoes-legado-retifica-premium/summary.json`;
  - `outputs/relatorios/2026-06-21T01-43-42-431Z-sync-observacoes-legado-retifica-premium/observacoes-depara.csv`;
  - `outputs/relatorios/2026-06-21T01-44-29-849Z-sync-observacoes-legado-retifica-premium/summary.json`.
- Sem migration, sem mudanca de RLS/Storage/Auth/Edge Function. Foi uma correcao de dados remota e pontual em `Notas_de_Servico.observacoes`.

---

## Auditoria RDS Legado x Retiflow - De/Para De O.S. - 2026-06-21

- Pedido: validar se todas as O.S. da Retifica Premium que ainda estao no sistema antigo AWS/RDS,
  empresa legado `id=5`, existem no Retiflow antes de desligar o antigo.
- Alteracao de suporte/auditoria:
  - criado script read-only `scripts/oneoff/validate-legacy-notes-depara-company5.mjs`;
  - o script consulta RDS legado e Supabase, nao grava dados, nao move PDFs e nao altera Storage;
  - compara O.S. por valor exato e, quando seguro, por numero normalizado;
  - match numerico so e aceito se o numero for unico no legado e unico no Retiflow;
  - se existir conflito de zero a esquerda ou duplicidade numerica, o script separa como conflito,
    sem validar automaticamente.
- Execucao read-only realizada com a conta `retificapremium5@gmail.com`:
  - legado RDS: 904 O.S. totais, sendo 897 ativas e 7 excluidas no legado;
  - Retiflow: 933 O.S. na conta Retifica Premium;
  - 845 matches limpos;
  - 21 matches com alerta, incluindo 2 encontrados por numero normalizado seguro;
  - 10 O.S. ativas do legado nao encontradas no Retiflow;
  - 2 registros com O.S. duplicada exatamente no legado (`3364`);
  - 19 registros com conflito de numeracao/zero a esquerda, nao validados automaticamente;
  - 67 O.S. existem apenas no Retiflow, provavelmente criadas depois da migracao;
  - PDFs do Retiflow: 0 ausentes e 0 paths faltando no bucket `notas` para os registros verificados.
- Relatorios locais gerados em:
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/summary.json`;
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/depara-os.csv`;
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/faltantes-no-retiflow.csv`;
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/duplicidades-e-conflitos.csv`;
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/divergencias.csv`;
  - `outputs/relatorios/2026-06-21T01-37-23-759Z-depara-os-retifica-premium/apenas-no-retiflow.csv`.
- Os relatorios com dados de clientes foram mantidos fora do commit. Proxima etapa segura:
  revisar as 10 faltantes e os 21 conflitos/alertas antes de qualquer importacao complementar.

---

## Notas De Entrada - Entregue Verde Sem Recebido - 2026-06-21

- Pedido: retirar a palavra `Recebido` exibida abaixo de `Entregue`; quando a O.S. estiver entregue/finalizada, o proprio status `Entregue` deve ficar verde.
- Frontend:
  - `src/types/index.ts` alterou `STATUS_COLORS.ENTREGUE` para usar o tom verde de sucesso;
  - `PAYMENT_STATUS_LABELS.PAGO` passou de `Recebido` para `Pago`, evitando a palavra antiga em fluxos de pagamento de O.S.;
  - `src/pages/IntakeNotes.tsx` deixou de renderizar o selo financeiro ao lado do status na listagem mobile e desktop;
  - no card mobile/tablet da O.S., a mini-informacao `Pagamento` foi removida para nao duplicar o status visual.
- Validacao visual local:
  - ambiente mock em mobile 393x873 abriu `/notas-entrada`;
  - badges `Entregue` apareceram verdes (`rgb(41, 163, 122)`) com texto branco;
  - a pagina de Notas de Entrada nao continha `Recebido` nem selo financeiro duplicado.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 52 arquivos e 384 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size;
  - `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Dashboard - Cards Financeiros Mais Compactos - 2026-06-21

- Pedido: reduzir o tamanho visual dos cards do Dashboard, que estavam grandes demais.
- Frontend:
  - `src/pages/Dashboard.tsx` reduziu altura minima, padding, tamanho dos valores, labels e icones dos cards financeiros;
  - grid dos KPIs passou a usar 7 colunas ja em desktop largo (`xl`), deixando os cards menos largos e mais parecidos com painel executivo;
  - subtitulos longos dos KPIs ficaram escondidos para nao inflar altura; detalhes principais continuam nos icones de informacao;
  - card de resultado anual tambem teve padding, icone e escala tipografica reduzidos.
- Validacao visual local:
  - ambiente mock em mobile 393x873 abriu `/dashboard` sem overflow horizontal;
  - cards principais medidos com altura de 64px no mobile;
  - desktop 1440x900 mediu cards em 7 colunas com cerca de 152px de largura e 86px de altura.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 52 arquivos e 384 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size;
  - `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Notas De Entrada - Status Em Dropdown No Filtro - 2026-06-20

- Pedido: dentro do pop-up de filtros, `Status` deve ser apenas um dropdown e o conteudo deve caber sem scroll interno.
- Frontend:
  - `src/pages/IntakeNotes.tsx` trocou a lista multi-selecao de status por um `Select` unico com `Todos os status` + status com contagem;
  - ao abrir o modal, se havia mais de um status ativo por estado antigo, o rascunho volta para `Todos os status`, preservando o novo contrato de selecao unica;
  - o modal foi compactado em espacamentos, header/footer, controles e grade para caber melhor em mobile e desktop;
  - o corpo do dialog nao usa mais container com `overflow-y-auto`; os filtros continuam aplicando somente em `Confirmar filtros`.
- Validacao visual:
  - ambiente mock local em viewport mobile 393x873 abriu Notas de Entrada e o pop-up de filtros;
  - dialog medido com `overflowY: visible`, altura 631px em viewport de 873px e largura 358px;
  - `Status` apareceu como combobox `Todos os status`, e o dropdown abriu com as opcoes e contagens;
  - a lista antiga de botoes de status nao apareceu no corpo do modal.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 52 arquivos e 384 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size;
  - `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Notas De Entrada - Filtro Por Mes - 2026-06-20

- Pedido: adicionar filtro por mes em Notas de Entrada para conseguir combinar facilmente cliente + mes e saber quantas/quanto teve em cada mes.
- Frontend:
  - `src/pages/IntakeNotes.tsx` manteve o modal responsivo de filtros e adicionou `Escolher mes` no campo de periodo;
  - quando `Escolher mes` e selecionado, aparecem dois seletores compactos: mes e ano;
  - o filtro mensal continua sendo rascunho dentro do modal e so aplica depois de `Confirmar filtros`;
  - `Este mes` continua existindo como atalho separado;
  - o selo ativo mostra o mes por extenso, por exemplo `Fevereiro de 2026`;
  - o filtro mensal combina com cliente, pagamento, status e ordenacao ja existentes.
- Dominio/testes:
  - `src/services/domain/intakeNotesList.ts` agora centraliza os nomes dos meses e o calculo do intervalo completo do mes (`YYYY-MM-01` ate ultimo dia);
  - `src/test/intake-notes-list.test.ts` cobre mes atual e intervalo completo, inclusive fevereiro.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function: o front usa `p_data_inicio`/`p_data_fim` ja existentes.
- Validacao visual:
  - ambiente mock local abriu Notas de Entrada, abriu o modal, selecionou `Escolher mes` e exibiu controles de mes/ano dentro do dialog.
  - o seletor de cliente coexistiu no mesmo modal; a interacao completa cliente + mes no in-app browser ficou limitada pela altura do popup do Radix, mas o fluxo usa os mesmos seletores controlados e o filtro so aplica no confirmar.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm test -- --run src/test/intake-notes-list.test.ts`: passou, 4 testes;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run`: passou, 52 arquivos e 384 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size.
- `npm run test:integration` nao foi executado porque nao houve alteracao em Supabase/Auth/Storage/Edge Function.

---

## Notas De Entrada - Filtros Em Modal E Ordenacao - 2026-06-20

- Pedido urgente: filtro de Notas de Entrada deve abrir em pop-up responsivo para computador/celular; filtros so devem aplicar ao clicar em `Confirmar filtros`; adicionar ordenacao por O.S. e por data.
- Frontend:
  - `src/pages/IntakeNotes.tsx` trocou o popover pequeno por `Dialog` responsivo com rascunho de filtros separado dos filtros aplicados;
  - cliente, periodo, pagamento, status e ordenacao agora ficam no modal e so filtram depois de confirmar;
  - ordenacao nova: `Data mais recente`, `Data mais antiga`, `O.S. maior primeiro`, `O.S. menor primeiro`;
  - selo de ordenacao aparece quando foge do padrao e `Limpar tudo` volta para `Data mais recente`;
  - helper `src/services/domain/intakeNotesList.ts` centraliza comparacao natural de O.S. e data.
- Banco/Supabase:
  - migration `20260620124500_order_notas_servico_filters.sql` adiciona parametros opcionais `p_ordem_campo` e `p_ordem_direcao` nas RPCs `get_notas_servico` e `get_notas_servico_contexto_suporte`;
  - valores aceitos sao `data`/`os` e `asc`/`desc`; valor invalido cai para data descendente;
  - aplicada remotamente via `supabase db query --linked -f ...` porque `supabase db push --dry-run` segue bloqueado pelo drift historico antigo;
  - migration marcada como aplicada com `supabase migration repair --status applied 20260620124500`;
  - catalogo remoto confirmou as duas assinaturas novas.
- Validacao visual:
  - desktop mock: modal abriu, confirmou `O.S. menor primeiro`, fechou e lista passou a iniciar por `OS-1`;
  - mobile 393x873: modal ficou dentro da tela, botao `Confirmar filtros` visivel e sem overflow horizontal.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run src/test/intake-notes-list.test.ts`: passou;
  - `npm test -- --run`: passou, 52 arquivos e 383 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size;
  - `npm run test:integration -- --run src/test/integration/notas.test.ts`: passou, 4 testes;
  - `npm run test:integration -- --run`: passou, 17 arquivos e 55 testes.

---

## O.S. / PDF - Documento E CEP Com Pontuacao - 2026-06-20

- Pedido: nos dados da nota/O.S., `Documento` deve sair com pontuacao de CPF/CNPJ e `CEP` deve sair com hifen.
- Alteracao somente de apresentacao:
  - adicionados helpers `formatDocumentForDisplay` e `formatCepForDisplay` em `src/services/domain/customers.ts`;
  - CPF com 11 digitos vira `000.000.000-00`, CNPJ com 14 digitos vira `00.000.000/0000-00`;
  - CEP com 8 digitos vira `00000-000`;
  - valores nao reconhecidos, como RG/texto livre, sao preservados;
  - `NotaPDFTemplate` e `OSPreviewModal` usam os helpers nos campos `Documento` e `CEP`.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 avisos antigos de Fast Refresh;
  - `npm test -- --run src/test/customers-cnpj-lookup.test.ts`: passou;
  - `npm test -- --run`: passou, 51 arquivos e 380 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/dynamic import/chunk size.
- `npm run test:integration` nao foi executado porque nao houve mudanca em Supabase/Auth/Storage/Edge Function.

---

## O.S. / PDF - Branding Retifica Premium E Legibilidade - 2026-06-20

- Pedido critico: nenhuma O.S./nota da Retifica Premium deve sair com nome GAWI; texto `Ordem de Servico` deve manter cedilha; email ausente deve ficar em branco; cabecalho precisava descer um pouco; linhas apenas descritivas precisavam fonte maior.
- Frontend:
  - `buildFallbackCompanySettings` agora usa Retifica Premium como fallback, sem identidade GAWI;
  - helpers `normalizeDocumentCompanyName` e `normalizeServiceOrderText` evitam `GAWI` e corrigem `Servico` -> `Serviço` em renderizacao;
  - `NotaPDFTemplate` e `OSPreviewModal` usam os mesmos helpers, deixam email vazio sem traco, deslocam o nome da empresa 5px para baixo e aumentam fonte das linhas informativas/sem valor.
- Banco/Supabase:
  - migration `20260620233405_fix_retifica_document_branding.sql` aplicada via `supabase db query --linked -f` porque `db push --dry-run` segue bloqueado por drift historico antigo;
  - migration marcada como aplicada com `supabase migration repair --status applied 20260620233405`;
  - defaults de `Configuracoes_Empresa_Usuario` e fallbacks das RPCs `get_configuracao_empresa_usuario`, `get_configuracao_empresa_cliente` e `upsert_configuracao_empresa_usuario` nao retornam mais GAWI;
  - linha da Retifica Premium (`retificapremium5@gmail.com`) normalizada para `Retífica Premium`.
- Validacao remota ja feita:
  - consulta confirmou `retificapremium5@gmail.com` com `razao_social` e `nome_fantasia` = `Retífica Premium`;
  - defaults remotos confirmados como `Retífica Premium`, telefone da retifica e email vazio;
  - historico remoto contem `20260620233405`.
- Validacoes executadas:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run src/test/document-customization.test.ts`: passou;
  - `npm test -- --run`: passou, 51 arquivos e 379 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico/chunks grandes;
  - `npm run test:integration`: primeira execucao teve timeout remoto transiente em `storage.test.ts`; rerun do arquivo passou e rerun completo passou, 17 arquivos e 55 testes.

---

## Dashboard - Corte Real De Faturamento E Ticket Medio - 2026-06-20

- Pedido: corrigir falso positivo em `Faturamento real`, porque O.S. legadas criadas/prazo antes de 01/06/2026 estavam sendo finalizadas agora e inflando o mês atual.
- Regra aplicada em `src/services/domain/dashboardFinance.ts`:
  - faturamento real continua exigindo status faturável (`ENTREGUE`, `RECUSADO`, `SEM_CONSERTO`);
  - data de competência do Dashboard agora prioriza `deadline`/prazo da O.S.; sem prazo, usa `finalizedAt`, depois `updatedAt`, depois `createdAt`;
  - a O.S. só é elegível para faturamento se `deadline >= 01/06/2026`; se não houver prazo, exige `createdAt >= 01/06/2026`;
  - caso esperado: O.S. criada em maio com prazo em junho entra no mês 06; O.S. criada/prazo em maio e finalizada agora fica fora.
- `src/pages/Dashboard.tsx`:
  - filtro do resultado financeiro removeu `30 dias` e `90 dias`;
  - controles ficaram: `Este mês`, dropdown de ano e `Personalizado`;
  - default do Dashboard passou a ser `Este mês`;
  - `Entradas previstas` e `Ticket médio` usam o período normal de criação da O.S. e excluem apenas `EXCLUIDA`;
  - faturamento, contas pagas e lucro continuam usando a base contábil a partir de 01/06/2026;
  - adicionado card `Ticket médio`;
  - card anual agora mostra também O.S. criadas no ano e ticket médio anual.
- Teste novo em `src/test/dashboard-finance.test.ts` cobre legado criado em maio com prazo em junho versus legado antigo com prazo em maio.
- Sem mudança de banco, RPC, Storage, Auth ou Edge Function.
- Validação executada:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 51 arquivos e 378 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico.

---

## Notas De Entrada - Contato Obrigatorio Na O.S. - 2026-06-20

- Pedido: o contato do cliente informado na criação da nota de entrada/O.S. deve ser obrigatório e deve ficar gravado na nota; o telefone continua sendo o telefone cadastrado do cliente/empresa.
- Frontend:
  - `NoteFormCore` agora exige `Contato que trouxe o serviço` para O.S. de serviço;
  - o campo `Telefone do contato` foi removido do formulário para não competir com o telefone oficial do cliente;
  - compartilhamento por WhatsApp voltou a usar somente o telefone do cliente;
  - previews e PDFs exibem `Contato` separado de `Telefone`.
- Backend/Supabase:
  - migration `20260620223410_require_note_contact_on_creation.sql` aplicada no remoto via `supabase db query --linked -f ...` e marcada como aplicada via `supabase migration repair --status applied 20260620223410`;
  - `nova_nota` e `nova_nota_contexto_suporte` rejeitam O.S. de serviço sem `contato_nome`;
  - as mesmas RPCs salvam `contato_nome` em `Notas_de_Servico`;
  - `get_nota_servico_detalhes`, `get_nota_servico_detalhes_contexto_suporte` e `get_notas_servico_contexto_suporte` retornam os campos de contato.
- Validacao executada:
  - catalogo remoto confirmou `contato_nome` nas funcoes afetadas e obrigatoriedade nas RPCs de criacao;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 51 arquivos e 378 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico;
  - `npm run test:integration -- --run`: passou, 17 arquivos e 55 testes;
  - `supabase db lint --linked`: sem erro novo; restaram 4 warnings legados de casts em `update_rel_nota_compra`, `novo_cliente`, `update_veiculo` e `update_rel_nota_servico`.

---

## HANDOFF Atual - 2026-06-16

### Estado Git Confirmado

- Foco atual: Retiflow. Descartar contexto Jira/DPA desta conversa ao continuar neste repositorio.
- Repositorio local: `/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/retiflow`.
- Remote SSH confirmado: `github-gabriel:Gabrieldepaulo20/RetiFlow.git`.
- Branch local observada: `codex/gmail-sync-model-hardening`.
- Estado apos `git fetch --all --prune`:
  - `HEAD` local: `ba151d1 feat: importacao por IA — envio em lote, auto-criacao e analise animada`.
  - `origin/main` e `origin/HEAD` apontam para `ba151d1`.
  - `origin/codex/gmail-sync-model-hardening` aponta para `e4fe0f2`.
  - A branch local esta `ahead 2` da branch remota de feature, porque contem `666f133` e `ba151d1`, que ja aparecem em `origin/main`.
  - Existe `tmp/` como arquivo/pasta untracked. Nao commitar nem apagar sem revisar o conteudo e confirmar que nao ha artefato util.
- Confirmacao importante: `e4fe0f2` (`Adiciona voltar status em notas de entrada`) e ancestral de `origin/main`.

### Ultimas Entregas Confirmadas Por Commit

- `e4fe0f2`: adiciona acao clara de `Voltar status` em Notas de Entrada, alinhada ao botao de avancar.
- `666f133`: importacao com IA em Contas a Pagar com varias contas, perguntas com botoes e parcelas irregulares.
- `ba151d1`: importacao por IA com envio em lote, auto-criacao e analise animada.

### Cuidados Para O Proximo Agente

- Antes de nova mudanca, rodar:
  - `git status --short --branch`
  - `git log --oneline --decorate --graph --max-count=12 --all`
- Ao relatar push/deploy, dizer exatamente o destino: `main`, branch de feature ou ambos. Nao usar apenas "subiu".
- Como o usuario pediu "Sempre de push", apos mudancas aprovadas e validadas commitar e dar push via SSH.
- Nao tocar em banco, RLS, Storage, Auth ou Edge Functions sem plano curto e risco explicado antes.
- Nao usar nem expor secrets. A pasta `tmp/` pode conter dados sensiveis ou artefatos locais, entao tratar com cuidado.

### Contas a Pagar - Remocao De Blocos Bancarios Planejados - 2026-06-17

- Pedido: retirar da conta a parte de "Pagamento via banco", porque ocupava espaco e nao servia no fluxo atual.
- Alteracoes somente de frontend:
  - `PayableDetailsModal` nao mostra mais o card `Pagamento via banco`, botoes desabilitados de API bancaria/agendamento/comprovante nem texto de provedor futuro;
  - a descricao do modal ficou focada em origem, anexos e historico;
  - a coluna lateral do detalhe foi reduzida de 360px para 220px, liberando mais espaco para os dados reais da conta;
  - `PayableQuickForm` tambem perdeu o bloco informativo `Preparacao para financeiro robusto`, removendo a mensagem de futura integracao bancaria.
- Sem mudanca de banco, RPC, Storage, Auth ou Edge Function.
- Validacao executada:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 51 arquivos e 376 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico.

### Contas a Pagar - Exclusao Definitiva Com Anexos - 2026-06-17

- Pedido: ao excluir uma conta, apagar definitivamente a conta e qualquer anexo salvo no Supabase Storage.
- Diagnostico confirmado no remoto:
  - RPCs `excluir_conta_pagar` e `excluir_conta_pagar_contexto_suporte` faziam soft-delete (`excluido_em`);
  - UI tambem dizia "Exclusao logica";
  - bucket `contas-pagar` usa policy por dono (`owner = auth.uid()`), entao suporte nao consegue apagar Storage de outro usuario direto pelo browser.
- Alteracoes:
  - `src/api/supabase/contas-pagar.ts` agora resolve paths/URLs de anexos, remove objetos do bucket `contas-pagar` e so depois chama a RPC;
  - se houver anexo em modo suporte, o front bloqueia a exclusao definitiva com mensagem clara, para nao deixar arquivo orfao;
  - `supabase/migrations/20260617133000_hard_delete_payables.sql` troca as RPCs para `DELETE` real em `Contas_Pagar`; anexos e historico somem por `ON DELETE CASCADE`;
  - modal/toast em `src/pages/ContasAPagar.tsx` agora indicam exclusao definitiva e irreversivel.
- Aplicacao remota:
  - `supabase db push --dry-run` falhou por drift antigo: varias versoes remotas nao existem localmente;
  - para nao reparar historico amplo nesta rodada, a migration idempotente foi aplicada via `supabase db query --linked < ...`;
  - `supabase migration repair --status applied 20260617133000` executado somente para a nova migration;
  - catalogo remoto confirmou que as duas RPCs usam `DELETE` e nao contem mais `excluido_em`.
- Validacao:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 51 arquivos e 376 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico;
  - `npm run test:integration -- --run src/test/integration/storage.test.ts`: passou, criando conta com anexo, lendo signed URL, excluindo, e confirmando 0 linhas em `Contas_Pagar`/`Contas_Pagar_Anexos` e objeto indisponivel no bucket;
  - `npm run test:integration`: passou completo, 17 arquivos e 55 testes (stderr esperado nos testes de logs que validam bloqueio de acesso indevido);
  - `supabase db lint --linked`: sem erros nas RPCs novas; restaram os 4 warnings legados ja conhecidos em casts de `update_rel_nota_compra`, `novo_cliente`, `update_veiculo` e `update_rel_nota_servico`.

### Contas a Pagar - Parcelas Vinculadas e Importacao IA - 2026-06-17

- Pedido: parcelas precisam continuar como contas separadas, mas uma parcela deve mostrar/navegar para as outras da mesma serie; importacao IA deve fechar o popup quando tudo der certo e manter aberto com itens em vermelho quando algo exigir correcao manual; nunca usar "duplicata" como nome de conta.
- Frontend:
  - `PayableImportModal` agrupa series parceladas por `groupId` e cria a primeira parcela como pai; as demais recebem `recurrenceParentId`, mantendo cada vencimento independente para sumir da lista quando for pago.
  - Lotes importados com 100% de criacao automatica fecham o popup sozinhos; lotes com erro/revisao mantem o popup aberto, expandem os pendentes e destacam em vermelho o que precisa de correcao manual.
  - Textos visiveis passaram a usar "conta parecida/repetida", nao "duplicata/duplicidade".
  - `PayableDetailsModal` permite abrir as demais parcelas dentro do detalhe, com status e navegacao direta entre elas.
- Banco/RPC:
  - Migration local `20260617015524_return_payable_parent_links.sql` inclui `fk_conta_pai` nos JSONs de `get_contas_pagar`, `get_conta_pagar_detalhes` e respectivas variantes de suporte.
  - Migration local `20260617020900_fix_support_email_suggestion_payable_signature.sql` corrige casts de enums em RPCs de suporte de Contas a Pagar e a chamada de `aceitar_sugestao_email_contexto_suporte` para o contrato atual de `insert_conta_pagar_contexto_suporte`.
  - As duas migrations foram aplicadas no remoto com `supabase db query --linked -f ...`.
  - `supabase db push --dry-run` continua bloqueado por drift antigo de historico remoto/local, entao nao usar como evidencia de aplicacao ate reparar esse historico.
- Edge Functions:
  - `analisar-conta-pagar` e `gmail-scan-payables` reforcam que "Duplicata" e apenas tipo de documento, nao nome/titulo; quando houver risco de repeticao, devem pedir revisao como conta parecida/repetida.
  - Deploy remoto executado com sucesso:
    - `supabase functions deploy analisar-conta-pagar --no-verify-jwt`
    - `supabase functions deploy gmail-scan-payables`
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 51 arquivos e 376 testes.
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: passou apos as migrations remotas, 17 arquivos e 55 testes.
  - `supabase db lint --linked`: sem erros nas RPCs de Contas a Pagar; restaram apenas 4 warnings antigos de casts em funcoes legadas (`update_rel_nota_compra`, `novo_cliente`, `update_veiculo`, `update_rel_nota_servico`).
  - Consulta remota confirmou que as RPCs de lista/detalhe retornam `fk_conta_pai` e que a RPC de suporte usa `p_favorecido_tipo` no contrato atual.
- Validacao nao executada:
  - `deno check` das Edge Functions nao foi executado porque `deno` nao esta instalado neste ambiente.

### Contas a Pagar - PDF Boleto SERRAF - 2026-06-16

- Problema reportado: upload do PDF `Boleto_1 (1).pdf` aparecia como sucesso no front, mas nenhuma conta era criada/listada.
- Diagnostico real:
  - Antes da correcao, a Function `analisar-conta-pagar` retornava fallback manual com 1 rascunho `INCERTO`, fornecedor nao identificado e valor 0; por isso o front mostrava "Sucesso" de analise, mas nao criava conta.
  - O PDF contem 3 boletos/parcelas SERRAF no mesmo arquivo, cada uma de R$ 399,92, vencendo em 08/07/2026, 22/07/2026 e 05/08/2026.
- Correcao aplicada:
  - Edge Functions `analisar-conta-pagar` e `gmail-scan-payables` removem `temperature` automaticamente quando o modelo configurado comeca com `gpt-5`, mantendo `reasoning.effort`.
  - O front `PayableImportModal` separa "Analisada" de "Conta criada" e usa status `Revisar` quando a conta nao foi salva automaticamente; itens de revisao ficam abertos com campos e botao `Confirmar e criar`.
  - Toast de importacao sem criacao automatica deixou de ser erro vermelho e passa a orientar revisao.
- Validacao real:
  - Teste direto na Function publicada com o PDF retornou `accountCount: 3`.
  - Drafts retornados: `SERRAF DISTRIBUIDORA DE PEÇAS P/A MOTORES LTDA. · Parcela 1/3 · Doc 76258 1`, `Parcela 2/3` e `Parcela 3/3`, todos com valor R$ 399,92 e status `PENDENTE`.
  - Sem migration, sem alteracao de banco/RLS/Storage.

### Pedidos Recentes Que Devem Permanecer No Radar

- Dashboard:
  - KPIs mais uteis: entradas previstas, faturamento real, contas lancadas, contas pagas, falta pagar e lucro do periodo.
  - Lucro do periodo = entrada/faturamento contabilizado menos contas pagas no periodo.
  - Para lucro/faturamento/ticket/tempo/valor finalizado, manter a regra de corte contabil `01/06/2026`, salvo nova decisao do usuario.
  - No mobile, o usuario quer cards em 3 por linha no Poco X6 Pro, com valores menores e layout mais denso.
- Notas de Entrada:
  - Botao de voltar status deve continuar simetrico ao avancar.
  - Filtros por data devem evoluir alem de mes/ano.
  - Dashboard deve contabilizar valor de notas como faturamento real apenas quando fizer sentido financeiro, principalmente O.S. finalizada/recebida conforme regra do fluxo.
- Clientes:
  - Filtro por CPF/CNPJ.
  - Mobile mais compacto, escondendo endereco e informacoes secundarias dos cards.
- Kanban:
  - Problema pendente relatado: scroll horizontal no celular ainda dificulta arrastar lateralmente.
- Fechamento:
  - Modal/popup deve manter scroll fluido como Nota de Entrada.
  - Mobile deve manter mes e ano na mesma linha e cards mais compactos.
- Contas a Pagar:
  - Nao deixar contas com titulo generico "duplicata"; reavaliar por IA/regra se sao parcelas, recorrencias ou contas distintas.
  - Anexos de contas devem ir para bucket privado do Supabase, organizados por tenant/empresa e data.
  - Sugestoes Gmail em modo suporte devem conectar/analisar o e-mail do cliente selecionado, nao o e-mail do suporte.
  - IA deve analisar remetente, anexos, comprovantes, spam/golpe e nivel real de confianca; quando faltar dado, criar pendencia manual em vez de fingir certeza.
- Storage/PDF:
  - PDFs de notas da Retifica Premium devem estar no bucket `notas`, organizados por empresa, ano, mes por extenso e dia com dia da semana.
  - Evitar organizacao marcada como `legacy` quando a nota ja faz parte do acervo normal da empresa.

---

## Notas De Entrada - Voltar Status - 2026-06-15

- Pedido: adicionar uma acao clara para voltar um status nas notas de entrada, porque a UI parecia permitir apenas avancar.
- Ajuste frontend-only:
  - `IntakeNoteDetail` agora mostra `Voltar status` como botao textual, nao mais como acao discreta;
  - `NoteDetailModal` agora mostra `Voltar status` no desktop e `Voltar` no mobile, preservando espaco no rodape;
  - avancar e voltar passam a usar o mesmo criterio de gerenciamento do fluxo (`ADMIN`, `notes.status.manage`, `notes.manage` ou `kanban.manage`).
- Regras preservadas:
  - status finais continuam sem volta direta pela UI;
  - `AGUARDANDO_COMPRA` continua bloqueado para voltar/avancar pelo atalho, pois envolve fluxo de compra vinculado;
  - nenhuma mudanca de banco, RPC, Storage ou Edge Function.
- Testes de login/rotas foram atualizados para os textos atuais do layout responsivo (`Sistema de gestão · Retífica Premium` e `Administração da plataforma`), substituindo asserts antigos que procuravam `Entrar na área do cliente`.
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 50 arquivos e 373 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - Playwright local em `VITE_AUTH_MODE=development`: O.S. `OS-5` confirmou `Voltar status` + `Avançar` na pagina completa e `Voltar` + `Avançar` no modal.

---

## Mobile Crescimento E Configuracoes - 2026-06-10

- Pedido: melhorar a experiencia mobile do modulo Crescimento e das abas de Configuracoes.
- Crescimento:
  - removido o texto auxiliar do topo para reduzir ruido no celular;
  - seletor de cliente e periodo agora dividem a linha em 2 colunas no mobile;
  - cards de integracao ficam menores, em 2 colunas no mobile, com status compacto;
  - cards de metricas do site ficam em grade 2x2 no mobile, com valores e detalhes menores;
  - grafico de evolucao ficou mais baixo, com fundo contido e datas brasileiras;
  - insights do periodo foram compactados;
  - paginas mais acessadas foram limitadas a 4 itens e origem do trafego a 5 fontes;
  - graficos de evolucao/origem foram reduzidos para evitar estouro vertical;
  - removido o aviso inferior de captura propria ainda nao configurada.
- Configuracoes:
  - Dados da empresa ganhou cabecalho mais centralizado no mobile e campos mais compactos;
  - Modelos ficou mais denso no mobile, com preview, variaveis e acoes melhor comprimidas;
  - Modulos agora organiza os cards em 2 colunas no mobile e esconde descricoes longas;
  - Status & Fluxo ficou mais compacto, com textos longos reduzidos e chips menos pesados;
  - Seguranca foi compactada: MFA caiu de ~455px para ~292px no viewport 393x852, e Alterar Senha de ~392px para ~244px.
- Validacao visual local em mock:
  - viewport 393x852: Crescimento sem overflow horizontal; topo sem texto auxiliar e sem aviso de captura;
  - viewport 393x852: Configuracoes nas abas empresa/modelos/modulos/status/seguranca sem overflow horizontal;
  - o mock nao possui cliente operacional com `moduleAccess.marketing=true`, entao os dados completos de Crescimento nao renderizaram localmente; a estrutura com dados foi validada por codigo e build.
- Alteracao apenas de frontend; sem mudanca de banco, RPC, Storage ou Edge Function.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 50 arquivos e 370 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: nao executado porque a alteracao foi apenas de frontend, sem tocar banco, RPC, Storage ou Edge Function.

---

## Mobile Fechamento E Contas A Pagar - 2026-06-10

- Pedido: melhorar a densidade mobile/tablet de Fechamento, Contas a Pagar e Sugestoes do Gmail.
- Fechamento:
  - card `Novo rascunho de fechamento` ficou mais curto;
  - selects de mes e ano ficam lado a lado no mobile;
  - texto explicativo abaixo do seletor foi removido;
  - cards de fechamentos gerados ficaram mais compactos;
  - botao de compartilhar foi removido dos cards gerados;
  - acoes `Visualizar` e `PDF` ganharam cor e continuam lado a lado.
- Contas a Pagar:
  - botoes `Importar com IA` e `Nova Conta` ficam divididos na mesma linha no mobile;
  - filtros foram comprimidos em duas linhas de duas colunas: busca/categoria e origem/periodo;
  - cards de contas tiveram padding e banner contextual reduzidos para diminuir altura.
- Sugestoes:
  - indicadores da ultima busca agora alinham em grade de 3 colunas no mobile;
  - cards de sugestao foram compactados, escondendo detalhes pesados no mobile e preservando titulo, status, confianca, valor, datas e acoes;
  - aviso de conta vencida foi reduzido para uma linha mais densa com acao curta `Paga`.
- Validacao visual local em mock:
  - viewport 393x852: Fechamento com mes/ano na mesma linha, sem texto auxiliar e sem overflow horizontal;
  - viewport 393x852: Contas a Pagar com botoes principais lado a lado, filtros em duas linhas e sem overflow horizontal;
  - viewport 393x852: Sugestoes sem overflow horizontal; card de sugestao com vencimento caiu de ~304px para ~260px.
- Alteracao apenas de frontend; sem mudanca de banco, RPC, Storage ou Edge Function.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 50 arquivos e 370 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: nao executado porque a alteracao foi apenas de frontend, sem tocar banco, RPC, Storage ou Edge Function.

---

## HANDOFF 2026-06-10 — Estado, pendencias e como continuar

> Resumo para outra IA (ou outro modelo) retomar o trabalho sem perder contexto.
> Detalhes do modelo de dados estao no `AGENTS.md` (secoes "Modelo De Status E
> Pagamento Das Notas" e "BACKEND APLICADO") e no `CLAUDE.md`.

### Ajuste critico 2026-06-10 — suporte em clientes/O.S.
- Corrigido o erro "Cliente não encontrado" ao editar clientes em modo suporte: migration
  `20260610161103_fix_support_client_writes_and_passive_wheel.sql` adiciona contexto transacional
  validado para o trigger `enforce_client_owner` e faz as RPCs de suporte de clientes configurarem
  esse contexto antes do DML.
- A mesma migration removeu `PUBLIC/anon EXECUTE` das RPCs sensiveis de suporte de notas/clientes,
  validou contexto antes de criar Nota de Compra em suporte e replicou o bloqueio de O.S. ja vinculada
  a fechamento em `update_nota_servico_contexto_suporte`.
- Prova remota: edição temporaria de cliente da Retifica Premium via
  `salvar_cliente_completo_contexto_suporte` retornou `200`, alterou o nome, restaurou o nome original
  e limpou logs/sessao de prova.
- Corrigido aviso de console do Kanban `Unable to preventDefault inside passive event listener invocation`
  movendo o handler de `wheel` para listener nativo `{ passive: false }`.

### Projeto / infra
- Supabase: projeto `dqeoxxokvvcpssajycgq` ("Portal de Notas"). Remote SSH:
  `github-gabriel:Gabrieldepaulo20/RetiFlow.git`. Trabalhar a partir de `origin/main`.
- Validar SEMPRE antes de concluir: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`,
  `npm test -- --run` (hoje ~362 testes), `npm run build`. `test:integration` so com `.env.integration`.
- Mudanca de banco/RPC/Edge Function em PRODUCAO exige aprovacao explicita do usuario (padrao firmado).

### Concluido nesta fase
- **Reforma de status das notas (11 status, 2 eixos):** fluxo (`ABERTO..ENTREGUE`, finais
  `RECUSADO`/`SEM_CONSERTO`, admin `EXCLUIDA`) + eixo de pagamento `NotePaymentStatus`
  (`PENDENTE/PAGO` + `paidAt`/`paidWith`). Faturavel = `BILLABLE_STATUSES`. Adapter traduz status
  legados do banco. Removidos FINALIZADO e PRONTO (PRONTO->PRONTA).
- **Recebimento nas notas:** `registrarRecebimentoNota`/`estornarRecebimentoNota` no DataContext;
  botao no detalhe; Dashboard com **Faturado / Recebido / A receber**.
- **Contato na nota** (`contatoNome`/`contatoTelefone`) + **glossario de status** em Configuracoes
  (aba "Status & Fluxo", fonte unica `STATUS_DESCRIPTIONS`/`STATUS_CUSTOMER_LABELS` p/ o futuro chatbot).
- **Legado:** 760 notas `Finalizado` -> `Entregue` + `payment_status=PAGO` + `origem=LEGADO`.
- **Modo suporte:** NAO expira mais por tempo — encerra so no botao "Sair" (`ended_at`). A funcao
  `resolve_suporte_contexto_usuario_id` deixou de checar `expires_at` (trade-off de seguranca aceito).
- **P1 performance:** QueryClient com defaults (staleTime 30s, refetch-on-focus off); **fim do N+1 do
  `dashboard-resumo`** (era 1 `get_nota_servico_detalhes` por nota; agora 1 RPC `get_servicos_resumo`,
  edge v13+); split de contexto incremental: `useOperationalData()` (notas/clientes) e `usePayablesData()`
  (payables) — paginas leem so a fatia que usam, reduzindo re-render. `useData()` segue p/ os demais.
- **P4 Contas a Pagar:** `classifyPayableMatch()` (distingue duplicidade_provavel / possivel_parcela /
  possivel_recorrencia / revisar / novo — nao bloqueia parcela como duplicata), integrado no
  PayableQuickForm. **Favorecido/funcionario:** coluna `favorecido_tipo` em `Contas_Pagar` (contrato
  completo nos RPCs via migration `..._complete_payables_favorecido_tipo_contract.sql`) + toggle
  Fornecedor/Funcionario no formulario (Funcionario sugere categoria "Mao de Obra"). Salario = despesa
  em Contas a Pagar; NAO existe modulo Contas a Receber.

### O que falta (por prioridade)
- **P2 — Seguranca:** rodar `get_advisors` e tratar `rls_enabled_no_policy` (ex.: `Configuracoes_*`,
  `Gmail_Connections`); confirmar isolamento por tenant (`criado_por_usuario`/`fk_criado_por`) em todos
  os RPCs e Storage; revisar o trade-off do suporte sem expiracao.
- **P3 — Dashboard de gestao:** hoje e a "visao do cliente" simplificada + Faturado/Recebido/A receber.
  Falta: servicos atrasados/parados ha X dias, tempo medio por etapa, gargalos por etapa, top clientes
  e tipos de servico, contas vencidas/a vencer, saldo operacional (Recebido - Pago), previsao de caixa.
  Preferir RPC/agregacao no banco (evitar puxar dado demais no front).
- **P5 — IA de e-mails:** a edge `analisar-conta-pagar` ja retorna JSON estruturado, mas falta:
  classificar TIPO de documento (boleto/NF/recibo/salario/imposto/promocional/desconhecido) ANTES de
  extrair; pipeline regras+IA; usar `classifyPayableMatch` p/ detectar duplicidade/parcela; confianca
  estruturada com revisao manual obrigatoria em baixa confianca; aprender com correcao do usuario
  (regras por remetente/fornecedor); logs de decisao. IA NUNCA cria conta sem confianca suficiente.
- **P6 — Organizacao:** `DataContext` ainda grande (split iniciado; estender com memo/selectors);
  remover duplicacoes; revisar tipos/schemas; logica de negocio fora de componente visual.

### Follow-ups menores (anotados tambem no AGENTS.md)
- `get_notas_servico_contexto_suporte` e `get_nota_servico_detalhes` (+variante de suporte) ainda NAO
  retornam os campos de pagamento/contato (afeta modo suporte e o detalhe de itens da nota).
- Edge `admin-users` ainda grava `expires_at` de 1h ao iniciar suporte (ignorado pelos checks; cosmetico).
- Redesenho profundo do `NoteDetailModal` + justificativa obrigatoria no "Excluir" (melhor com app rodando).

### Regras que NAO podem ser violadas
- Nao remover regra de seguranca para ganhar performance; seguranca real esta em RLS/RPC/Edge, nao no front.
- Nao tratar parcela/recorrencia como duplicata real sem analise (usar `classifyPayableMatch`).
- IA nao cria conta automaticamente sem confianca suficiente -> mandar para revisao manual.
- Nunca commitar segredo. Nunca excluir dado de negocio fisicamente (so inativacao logica / soft delete).
- Nota Fiscal segue fora da v1.

---

## Estado Atual

- Repositorio principal: `/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/retiflow`.
- Remote Git deve permanecer via SSH: `github-gabriel:Gabrieldepaulo20/RetiFlow.git`.
- Projeto Supabase vinculado ao Retiflow: `dqeoxxokvvcpssajycgq`.
- `docs/contexto-sessao.md` volta a ser o arquivo oficial de contexto operacional pedido pelo `AGENTS.md`.

## Regras Ativas

- Nao expor secrets, tokens, service role, senhas, AWS keys ou refresh tokens em chat, docs ou arquivos versionados.
- Nota Fiscal segue fora da v1/piloto.
- Alteracoes de banco/RPC/Storage/Edge Functions devem ser pequenas, documentadas e validadas.
- Validacoes obrigatorias antes de concluir mudancas normais:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test -- --run`
  - `npm run build`
- Se tocar integracao real, rodar `npm run test:integration` somente quando o ambiente estiver configurado e seguro.
- Sempre commitar e dar push via SSH quando a alteracao estiver validada.

## Trabalho Em Andamento - 2026-06-03

Plano aprovado para executar em fases:

1. Diagnostico read-only da migracao das notas antigas da empresa legado `id=5`.
2. Placa opcional de verdade, armazenando ausencia como `NULL`.
3. Linha apenas descritiva em nota/PDF sem virar cobranca.
4. Preview de PDFs por visualizador nativo do navegador com signed URL ou blob temporario.

## Decisoes Travadas

- Migracao de notas antigas comeca apenas por inventario e dry-run. A importacao real fica bloqueada ate revisao do relatorio.
- Validacao de PDF antigo usa endpoint legado `/servico/pdf-link`; S3 so e conferido se credenciais ja estiverem configuradas no ambiente.
- Placa vazia sera persistida como `NULL`, nunca como string vazia nem fallback `XXX0000`.
- Linhas descritivas aparecem no PDF com descricao normal e colunas de quantidade/valor/total em branco quando nao ha valor financeiro.
- Preview principal da nota deve preservar fidelidade visual.
- Preview principal do fechamento deve abrir em popup/modal na mesma tela, com rolagem suave, no mesmo comportamento esperado da nota de entrada. Abrir PDF em nova aba fica como acao explicita.

## Pendencias De Validacao Manual

- Rodar o script de diagnostico legado quando as credenciais locais estiverem disponiveis:
  - `node scripts/oneoff/analyze-legacy-notes-company5.mjs`
- Revisar o relatorio gerado em `tmp/legacy-notes-company5-report.json` antes de qualquer importacao real.

## Entrega - 2026-06-03

### Fase 1: Diagnostico read-only de notas antigas

- Entregue e enviado ao Git no commit `3a33c17`.
- Criado script dry-run `scripts/oneoff/analyze-legacy-notes-company5.mjs`.
- Criado documento `docs/notas-legacy-migration-plan.md`.
- Nenhum dado legado foi importado ou gravado no Supabase.

### Fases 2, 3 e 4: Placa opcional, linhas descritivas e PDF nativo

- Placa ausente agora trafega como `NULL` no front, contratos TypeScript e RPCs.
- Migration local criada: `supabase/migrations/20260603100000_note_optional_plate_and_informational_items.sql`.
- Migration aplicada no projeto Supabase `dqeoxxokvvcpssajycgq`.
- Confirmado no schema remoto que `RetificaPremium.Veiculos.placa` esta nullable e segue unique quando preenchida.
- Formulario de O.S. preserva itens com descricao mesmo quando valor/quantidade financeira estao vazios ou zerados.
- PDFs e previews de nota/fechamento mostram linhas descritivas sem quantidade, valor e total, mantendo a descricao.
- PDF salvo abre por signed URL; PDF ainda nao salvo pode gerar blob temporario usando helper unico em `src/lib/printPdf.ts`.
- A visualizacao principal de fechamento foi corrigida depois: `Visualizar` abre modal interno com `ClosingHtmlPreview`; quando o fechamento salvo so tiver `pdf_url`, o PDF assinado aparece embutido no mesmo popup.

### Validacao Executada

- `npx tsc --noEmit`: passou.
- `npm run lint`: passou com 8 warnings antigos de Fast Refresh em componentes compartilhados.
- `npm test -- --run`: passou, 42 arquivos e 320 testes.
- `npm run build`: passou, mantendo avisos conhecidos de bundle/chunk.
- `npm run test:integration`: passou, 16 arquivos e 51 testes.
- Novo teste real `src/test/integration/notas.test.ts` cria e atualiza uma O.S. sem placa, com linha apenas descritiva, valida retorno por RPC e limpa os registros criados.

### Observacoes

- O teste manual de criacao/edicao foi coberto por integracao real com cleanup por prefixo de teste, porque o fluxo depende de sessao Supabase e RPCs remotos.
- A automacao visual local nao foi usada para abrir novas abas de PDF nesta rodada; a fidelidade do PDF foi preservada no codigo pelos templates existentes e pela abertura via signed URL/blob.

## Ajuste - 2026-06-03

- Pedido do produto: fechamento deve visualizar igual nota de entrada, em popup na mesma tela, com scroll fluido.
- `src/pages/MonthlyClosing.tsx` ajustado para que botoes `Visualizar` de rascunhos e fechamentos gerados abram o modal interno.
- Fechamentos com `dados_json` usam `ClosingHtmlPreview` no modal.
- Fechamentos antigos com apenas `pdf_url` usam signed URL embutida em `iframe` dentro do modal.
- Botao `Abrir PDF` continua disponivel como acao separada para abrir/baixar o PDF real quando necessario.

## Importacao De Notas Legadas - 2026-06-03

- Destino confirmado: usuario interno `Retifica Premium` existente.
- Diagnostico corrigido para mapear `servico.veiculo_id`, `servico_item` e PDFs em `servico.s3_link`.
- Resultado do dry-run corrigido para empresa legado `id=5`:
  - 891 notas encontradas no legado.
  - 880 notas migraveis.
  - 7 notas marcadas como excluidas no legado.
  - 4 notas pendentes por OS duplicada no legado.
  - 1.919 itens/linhas de servico migraveis.
- Importacao real executada com `node scripts/oneoff/import-legacy-notes-company5.mjs --apply`.
- Resultado gravado no Supabase:
  - 880 notas inseridas na conta Retifica Premium.
  - 1.919 itens vinculados em `Rel_NotaS_Serv`.
  - 880 notas com referencia de PDF legado em `pdf_url`.
  - 0 falhas, 0 clientes ausentes, 0 veiculos ausentes, 0 notas sem itens.
- Dry-run pos-importacao retornou `planned_notes: 0` e `skipped_existing_os: 880`, confirmando protecao contra duplicidade.
- Pendencia manual: revisar as 4 OS duplicadas no legado antes de importar qualquer uma delas.

## Migracao Dos PDFs Legados Para Storage - 2026-06-03

- Criado script `scripts/oneoff/migrate-legacy-note-pdfs-to-storage.mjs`.
- Dry-run completo confirmou que os 880 links legados em S3 baixavam corretamente e continham PDFs validos.
- Execucao real com `node scripts/oneoff/migrate-legacy-note-pdfs-to-storage.mjs --apply`:
  - 880 PDFs baixados do S3 legado.
  - 880 PDFs enviados para o bucket privado `notas`.
  - Paths organizados em `auth_id/legacy/company-5/ano/mes/OS-<numero>-<nota>.pdf`.
  - `Notas_de_Servico.pdf_url` atualizado para o path interno do Storage.
  - `Notas_de_Servico.pdf_formato` atualizado para `supabase_storage_legacy_s3`.
- Ajuste SQL aplicado no projeto Supabase para garantir `storage.objects.owner` e `owner_id` iguais ao `auth_id` da conta Retifica Premium.
- Validacao SQL final:
  - 880 notas migradas.
  - 880 objetos encontrados no Storage.
  - 0 objetos faltando.
  - 0 objetos com owner errado.
  - 0 referencias externas `http` restantes.
- Validacao por signed URL/download:
  - 880 PDFs verificados com sucesso.
  - 0 falhas.
  - Total migrado: 72.570.891 bytes.

## Normalizacao De Paths De Storage Da Retifica Premium - 2026-06-10

- Pedido: remover organizacao visual `auth_id/legacy/company-5/ano/mes` e usar pasta com nome da empresa, mes por extenso e dia explicativo.
- Padrao novo:
  - notas: `retifica-premium/ano/mes-por-extenso/dia (dia-da-semana)/OS-<numero>.pdf`;
  - contas a pagar: `retifica-premium/ano/mes-por-extenso/dia (dia-da-semana)/<id-conta>/<arquivo>`.
- Meses e dias da semana ficam em portugues sem acento no path, por exemplo `marco`, `Terca-feira` e `Sabado`, para evitar encoding estranho em URL.
- Criado script operacional `scripts/oneoff/normalize-retifica-premium-storage-paths.mjs`.
  - modo padrao `dry-run`;
  - modo real `--apply`;
  - valida origem, destino e colisoes antes de mover;
  - move o objeto no bucket e atualiza a referencia no banco em seguida.
- Dry-run antes da execucao:
  - 888 movimentos planejados;
  - 885 PDFs de notas;
  - 3 anexos de contas a pagar;
  - 0 origens faltando;
  - 0 destinos ocupados;
  - 0 colisoes.
- Execucao real:
  - 888 objetos movidos;
  - 885 `Notas_de_Servico.pdf_url` atualizados;
  - 3 `Contas_Pagar_Anexos.url` atualizados;
  - `Notas_de_Servico.pdf_formato` normalizado para `supabase_storage`;
  - 0 falhas.
- Validacao pos-normalizacao:
  - novo dry-run retornou 0 movimentos pendentes;
  - 885/885 notas da Retifica Premium seguem com PDF existente no bucket `notas`;
  - 3/3 anexos de contas a pagar seguem existentes no bucket `contas-pagar`;
  - 0 referencias com `legacy`, `company-5`, prefixo antigo de `auth_id`, mes numerico ou dia numerico sem dia da semana;
  - 0 arquivos restantes no prefixo antigo dos buckets;
  - buckets continuam privados; a seguranca segue baseada em owner/policies, nao no nome da pasta.
- Ajuste complementar no mesmo dia:
  - o segmento `dia` passou a incluir o dia da semana, exemplo `01 (Segunda-feira)`;
  - 888 objetos existentes foram movidos do formato `dia/` para `dia (dia-da-semana)/`;
  - auditoria pos-move confirmou 885/885 PDFs e 3/3 anexos com signed URL valido no novo formato.

## Contas A Pagar - Favorecido E Sugestoes De E-mail - 2026-06-10

- Adicionado contrato completo para `favorecido_tipo` em `Contas_Pagar`:
  - `FORNECEDOR` como padrao;
  - `FUNCIONARIO` para salarios, vales, comissoes e adiantamentos sem criar uma tabela separada de funcionarios na v1.
- RPCs normais e de suporte agora aceitam e retornam `favorecido_tipo`:
  - `insert_conta_pagar`;
  - `update_conta_pagar`;
  - `get_contas_pagar`;
  - `get_conta_pagar_detalhes`;
  - variantes `*_contexto_suporte`.
- A assinatura antiga de `insert_conta_pagar` sem `p_favorecido_tipo` foi removida para evitar ambiguidade de overload.
- `aceitar_sugestao_email` passou a chamar `insert_conta_pagar` por parametros nomeados com `p_favorecido_tipo => 'FORNECEDOR'`.
- Frontend:
  - formulario rapido de conta tem toggle `Fornecedor` / `Funcionario`;
  - ao escolher `Funcionario`, tenta sugerir a categoria `Mao de Obra`;
  - edicao de conta tambem preserva e permite alterar o tipo do favorecido;
  - modo suporte usa o mesmo contrato auditado.
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 47 arquivos e 351 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - `npm run test:integration`: passou, 16 arquivos e 54 testes.

## Contas A Pagar - Auditoria De Titulos Genericos - 2026-06-10

- Pedido: remover nomes de contas que ficaram como `Duplicata...` na Retifica Premium e endurecer a IA para nao criar sugestoes/titulos genericos.
- Banco remoto auditado no projeto `dqeoxxokvvcpssajycgq`:
  - 3 contas com titulo `Duplicata...` foram encontradas na Retifica Premium;
  - 2 eram da SERRAF com mesmo fornecedor, documento, vencimento, valor e parcela `1/2`;
  - a mais antiga foi mantida como `SERRAF Distribuidora · Parcela 1/2 · Doc 75939 1`;
  - a duplicidade exata mais nova foi arquivada por `excluido_em`, sem delete fisico;
  - a conta da MAVILI foi renomeada para `MAVILI Abrasivos e Ferramentas · Doc 000024849A` e recategorizada como `Pecas e Materiais`;
  - nomes visiveis dos anexos foram revisados para remover `Duplicata`;
  - historico das tres contas recebeu registro de auditoria;
  - validacao remota retornou `0` contas ativas da Retifica Premium com titulo iniciando por `duplicata`.
- Codigo:
  - `isGenericPayableTitle` agora trata `Duplicata 123`, `Duplicata 02/03` e titulos genericos com apenas referencia numerica como genericos;
  - `buildMeaningfulPayableTitle` remove `Duplicata` da referencia do documento antes de montar titulo util;
  - as Edge Functions `analisar-conta-pagar` e `gmail-scan-payables` receberam a mesma regra para futuras importacoes/sugestoes.
- Teste adicionado em `src/test/payable-dedup.test.ts` cobrindo `Duplicata 123456`, `Duplicata 02/03` e preservacao de titulo descritivo como `Fatura Vivo Total`.
- Edge Functions publicadas no projeto `dqeoxxokvvcpssajycgq`:
  - `analisar-conta-pagar` v24, `verify_jwt=false`;
  - `gmail-scan-payables` v35, `verify_jwt=false`.
- Validacao executada:
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 50 arquivos e 370 testes;
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks;
  - `npm run test:integration`: passou, 17 arquivos e 55 testes.
- Limpeza pos-integracao:
  - a suite recriou 14 usuarios de teste (`integration.test` e `tenant-isolation-*`);
  - removidos 14 registros de `RetificaPremium.Usuarios`/`Modulos`;
  - removido 1 usuario de teste do Supabase Auth;
  - validacao final confirmou `suspicious_internal_users = 0` e `suspicious_auth_users = 0`.

## Protecao Contra Duplicidade De O.S. - 2026-06-03

- Pedido: impedir que o frontend ou qualquer chamada de criacao gere O.S. duplicada.
- Migration local criada: `supabase/migrations/20260603150000_enforce_unique_service_order_numbers.sql`.
- Migration aplicada no projeto Supabase `dqeoxxokvvcpssajycgq` com nome remoto `enforce_unique_service_order_numbers`.
- `RetificaPremium.nova_nota` agora valida duplicidade antes do insert:
  - bloqueia O.S. exatamente igual na mesma conta;
  - bloqueia O.S. numericamente equivalente mesmo com formatos diferentes, como `000123` e `OS-123`;
  - retorna envelope `status: 400`, `code: duplicate_os` e mensagem `Já existe uma O.S. com este número para esta conta.`
- Criado indice unico exato `idx_notas_servico_owner_os_unique` em `(criado_por_usuario, lower(btrim(os)))` para reforcar duplicidade exata.
- Nao foi criado indice unico numerico porque existem conflitos numericos historicos importados/legados que precisam de saneamento manual antes.
- Teste real adicionado em `src/test/integration/notas.test.ts`:
  - cria uma O.S. e confirma que a segunda com mesmo numero falha;
  - cria uma O.S. em formato numerico com zeros e confirma que `OS-<numero>` equivalente falha.
- Validacao especifica executada:
  - `npm run test:integration -- src/test/integration/notas.test.ts --run`: passou, 3 testes.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.

## Saneamento Final De O.S. Duplicadas - 2026-06-03

- Pedido: excluir por completo as O.S. conflitantes antigas e proibir duplicidade de O.S. por todos os formatos.
- Criado script `scripts/oneoff/cleanup-duplicate-service-orders.mjs` com modo dry-run/apply.
- Politica usada no saneamento:
  - agrupar por conta e numero de O.S. normalizado;
  - manter sempre a O.S. mais nova por `created_at`;
  - excluir as O.S. mais antigas do grupo;
  - remover itens de `Rel_NotaS_Serv`, notas de compra vinculadas, desvincular faturas quando houver, excluir a O.S. e remover o PDF no bucket privado `notas`.
- Dry-run confirmou:
  - 16 grupos duplicados;
  - 16 O.S. antigas para excluir;
  - 16 PDFs para remover do Storage.
- Execucao real com `node scripts/oneoff/cleanup-duplicate-service-orders.mjs --apply`:
  - 16 O.S. antigas excluidas;
  - 30 linhas de itens excluidas;
  - 16 PDFs removidos do Storage;
  - 0 faturas desvinculadas;
  - 0 notas de compra vinculadas excluidas;
  - 0 falhas de Storage.
- Validacao pos-saneamento:
  - consulta SQL de duplicidade numerica retornou `[]`;
  - as 16 O.S. excluidas nao existem mais em `Notas_de_Servico`;
  - os 16 PDFs excluidos nao sao mais baixaveis no Storage.
- Migration local criada: `supabase/migrations/20260603162000_enforce_numeric_unique_service_order_numbers.sql`.
- Migration aplicada no projeto Supabase `dqeoxxokvvcpssajycgq` com nome remoto `enforce_numeric_unique_service_order_numbers`.
- Indice unico numerico criado: `idx_notas_servico_owner_os_numeric_unique`.
- O banco agora bloqueia, por conta, formatos numericamente equivalentes como `3698`, `03698` e `OS-3698`, alem do indice exato ja existente.
- Validacao especifica executada:
  - `npm run test:integration -- src/test/integration/notas.test.ts --run`: passou, 3 testes.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.

## Dashboard Financeiro Por Periodo - 2026-06-03

- Pedido: no Dashboard, mostrar para a cliente o valor de todas as O.S., valor das O.S. entregues/fechadas, contas pagas e lucro por periodo filtrado.
- `src/pages/Dashboard.tsx`:
  - criado painel "Resultado financeiro" no topo do Dashboard;
  - filtro com atalhos `30 dias`, `90 dias`, `Este mes`, `Ano` e `Personalizado`;
  - filtro personalizado usa campos `date` nativos do navegador para abrir calendario;
  - cards mostram:
    - valor de todas as O.S. lancadas no periodo;
    - valor entregue/fechado considerando status `ENTREGUE` e `FINALIZADO`;
    - contas pagas no periodo considerando `PAGO` e `PARCIAL`;
    - lucro do periodo = valor das O.S. lancadas - contas pagas;
  - grafico do periodo compara entradas de O.S. e contas pagas, agrupando por dia ou por mes conforme o tamanho do intervalo;
  - KPIs antigos de faturamento passaram a considerar `ENTREGUE` + `FINALIZADO`, nao apenas `FINALIZADO`.
- `src/contexts/DataContext.tsx`:
  - carga principal do dashboard aumentada de `p_limite: 500` para `p_limite: 5000`, para evitar calculos financeiros em amostra pequena no piloto.
- `supabase/functions/dashboard-resumo/index.ts`:
  - teto controlado de `parseLimit` aumentado para `5000`;
  - Function `dashboard-resumo` publicada no projeto Supabase `dqeoxxokvvcpssajycgq`.
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.

## Fechamento Historico De O.S. Da Retifica Premium - 2026-06-03

- Pedido: marcar como finalizadas as O.S. antigas da Retifica Premium com data ate 30/04/2026, pois provavelmente ja foram pagas/encerradas.
- Criado script `scripts/oneoff/close-retifica-premium-old-service-orders.mjs` com modo dry-run/apply.
- Criterio aplicado:
  - dono interno Retifica Premium: `b3a55ae3-45d0-4083-85a1-704cf2b3d0e5`;
  - status origem: `Aberto` (`fk_status = 9`);
  - status destino: `Finalizado` (`fk_status = 20`);
  - corte por `prazo < 2026-05-01T00:00:00.000Z`, ou seja, ate 30/04/2026;
  - `finalizado_em` preserva a data historica de `prazo`, nao a data da execucao.
- Dry-run confirmou:
  - 756 O.S. candidatas;
  - valor total R$ 694.017,00.
- Execucao real com `node scripts/oneoff/close-retifica-premium-old-service-orders.mjs --apply`:
  - 756 O.S. atualizadas para `Finalizado`;
  - 0 falhas;
  - 0 O.S. abertas restantes antes de maio/2026 pelo criterio de `prazo`.
- Validacao SQL pos-aplicacao:
  - 756 O.S. no corte;
  - todas com status `Finalizado`;
  - todas com `finalizado_em` preenchido igual ao `prazo`;
  - valor total finalizado no corte: R$ 694.017,00.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.

## Limpeza De Usuarios De Integracao/Teste - 2026-06-03

- Pedido: remover usuarios de integration/teste que estavam poluindo o sistema.
- Diagnostico read-only identificou:
  - 1 usuario fixo de teste `integration.test@retifica.com` com `auth_id`;
  - 6 usuarios temporarios `tenant-isolation-...@retifica.test` sem `auth_id`;
  - nenhum usuario operacional real nesses padroes.
- Execucao real:
  - 7 registros removidos de `RetificaPremium.Usuarios`;
  - 7 registros removidos de `RetificaPremium.Modulos`;
  - 0 logs vinculados encontrados/removidos;
  - 1 usuario removido do Supabase Auth: `integration.test@retifica.com`.
- Validacao pos-limpeza:
  - 0 usuarios suspeitos restantes em `RetificaPremium.Usuarios`;
  - 0 usuarios suspeitos restantes em Supabase Auth.
- Observacao:
  - `npm run test:integration` nao foi rodado depois desta limpeza porque os testes recriam o usuario `integration.test@retifica.com` quando executados com `.env.integration` configurado.

## Dashboard Faturamento Historico E Lucro A Partir De Junho - 2026-06-03

- Pedido: no Dashboard, permitir ver corretamente faturamento de 2025 e 2026 por filtro, e iniciar a contabilizacao de lucro apenas agora, de junho/2026 para frente.
- `src/pages/Dashboard.tsx`:
  - filtro de periodo agora gera botoes de anos reais encontrados nos dados, como `2026` e `2025`;
  - o filtro de ano usa o periodo completo do ano passado e o ano atual ate hoje;
  - faturamento historico continua disponivel para 2025/2026 pelo valor de todas as O.S. e pelo valor entregue/fechado;
  - lucro contabilizado usa regra fixa de inicio em `01/06/2026`;
  - para periodos anteriores a junho/2026, o card de lucro fica neutro e mostra que o lucro passa a contar somente a partir de 01/06/2026;
  - contas pagas entram no calculo de lucro apenas dentro da janela iniciada em 01/06/2026.
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
- Observacao:
  - `npm run test:integration` nao foi rodado porque a mudanca foi apenas de logica/UI no frontend e nao alterou banco, RPC, Storage, Auth ou Edge Function.

## Correcao De Layout Nos Cards De Contas A Pagar - 2026-06-03

- Pedido: corrigir bug visual em que o aviso contextual dentro do card de Contas a Pagar quebrava o texto palavra por palavra e deixava botoes cortados/espremidos ao navegar pelo Dashboard.
- `src/components/payables/ContextualQuestionBanner.tsx`:
  - banner agora ocupa a largura disponivel com `min-w-0` e `overflow-hidden`;
  - texto usa quebra normal e `break-words`, sem ser espremido pelos botoes;
  - acoes ficam em linha propria com `flex-wrap`, permitindo quebra segura.
- `src/pages/ContasAPagar.tsx`:
  - rodape dos cards agora permite quebra de linha entre botoes;
  - botoes principais ganharam largura minima para nao cortar labels como `Registrar pagamento`.
- Observacao:
  - mudanca apenas visual/frontend; nao altera banco, RPCs, Auth, Storage ou Edge Functions.
- Validacao executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 320 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks.
  - Browser local abriu `http://127.0.0.1:8080/contas-a-pagar` e carregou o app; sem sessao local, caiu no login operacional, entao a checagem visual com dados reais ficou limitada.

## Modo Suporte Operacional Em Contas A Pagar - 2026-06-03

- Pedido: permitir que o Mega Master trabalhe no modulo Contas a Pagar em modo suporte, gravando dados na empresa acessada e deixando auditoria explicita.
- Migrations locais criadas:
  - `supabase/migrations/20260603183000_support_context_payables_writes.sql`;
  - `supabase/migrations/20260603184000_support_context_payable_owner_trigger.sql`;
  - `supabase/migrations/20260603184500_support_context_payables_history_enum.sql`;
  - `supabase/migrations/20260603185000_support_context_payables_update_enum.sql`;
  - `supabase/migrations/20260603185500_support_context_payable_trigger_privileges.sql`.
- Migrations aplicadas no projeto Supabase `dqeoxxokvvcpssajycgq`:
  - `support_context_payables_writes`;
  - `support_context_payables_enum_cast_fix`;
  - `support_context_payable_owner_trigger`;
  - `support_context_payables_history_enum`;
  - `support_context_payables_update_enum`;
  - `support_context_payable_trigger_privileges`.
- Banco/RPC:
  - criada tabela privada `RetificaPremium.Logs_Acoes_Suporte`;
  - criadas RPCs `_contexto_suporte` para criar/editar/pagar/cancelar/excluir contas, anexos, fornecedores, categorias e aceitar/ignorar sugestoes de e-mail;
  - `Contas_Pagar` e `Contas_Pagar_Anexos` gravam `fk_criado_por` no usuario alvo resolvido por `resolve_suporte_contexto_usuario_id`;
  - `Sugestoes_Email` atualiza pelo `auth_id` do usuario alvo;
  - trigger `enforce_payable_owner` agora aceita escrita em usuario-alvo somente quando existe sessao de suporte ativa para Mega Master/Admin.
  - helper interna do trigger teve execucao direta revogada de `authenticated`, ficando disponivel apenas para uso interno/service role.
- Frontend:
  - `SUPPORT_CONTEXT_RPC_MAP` passou a mapear as escritas permitidas de Contas a Pagar para as RPCs auditadas;
  - as escritas de outros modulos continuam bloqueadas em modo suporte;
  - sugestoes de e-mail voltaram a permitir aceitar, arquivar e registrar como paga em modo suporte;
  - conexao Gmail e busca/scan manual continuam ocultas para suporte.
- Validacao real no Supabase:
  - teste positivo criou, editou e registrou pagamento de uma conta no usuario alvo, conferiu `fk_criado_por`, conferiu pelo menos 3 logs de suporte e limpou os dados temporarios;
  - teste negativo confirmou que usuario comum segue recebendo `403` mesmo com tentativa de contexto de suporte.
  - prova curta apos ajuste de privilegios confirmou que a escrita de suporte ainda passa pelo trigger.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 322 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.
- Limpeza pos-integracao:
  - testes de integracao recriaram `integration.test@retifica.com` e um `tenant-isolation-...@retifica.test`;
  - removidos 2 usuarios de teste de `RetificaPremium.Usuarios`/`Modulos`;
  - removido 1 usuario de teste do Supabase Auth;
  - validado que restaram 0 usuarios nesses padroes.
- Observacao estrutural:
  - `Categorias_Contas_Pagar` e `Fornecedores_Contas_Pagar` nao possuem `fk_criado_por` hoje; as variantes de suporte para essas tabelas sao auditadas, mas seguem no contrato global atual ate uma futura mudanca de schema.
  - Upload binario de anexo em modo suporte ainda deve ser tratado com cuidado no frontend/Storage; a escrita de metadado existe por RPC, mas o envio de arquivo precisa respeitar path/owner seguro.

## Modo Suporte Persistente E Gmail Da Empresa Alvo - 2026-06-04

- Pedido: em modo suporte, remover a faixa superior fixa, manter apenas botao para sair do suporte, preservar suporte apos refresh e permitir operar Gmail/sugestoes da empresa acessada.
- Frontend:
  - sessao de suporte passou de `sessionStorage` para `localStorage`, com compatibilidade para limpar sessoes antigas em `sessionStorage`;
  - `AuthContext` nao limpa mais o modo suporte enquanto a sessao Supabase real ainda esta restaurando no refresh;
  - faixa superior de suporte removida de `AppLayout`; ficou apenas botao `Sair do suporte` no topo e no menu;
  - painel de sugestoes/Gmail de Contas a Pagar nao e mais ocultado no suporte;
  - `get_gmail_connection_status`, `update_gmail_auto_sync_settings`, `gmail-oauth-start` e `gmail-scan-payables` enviam contexto auditado da empresa alvo quando o Mega Master esta em suporte.
- Banco/RPC:
  - migration local criada e aplicada no projeto `dqeoxxokvvcpssajycgq`: `supabase/migrations/20260604103000_support_context_gmail_connection.sql`;
  - criadas RPCs `get_gmail_connection_status_contexto_suporte` e `update_gmail_auto_sync_settings_contexto_suporte`;
  - RPCs usam `resolve_suporte_contexto_usuario_id`, leem/alteram a conexao Gmail pelo `auth_id` do usuario alvo e registram log de suporte na alteracao de busca automatica.
- Edge Functions:
  - `gmail-oauth-start` publicada na versao 20, ainda com `verify_jwt=true`;
  - em modo suporte, cria `Gmail_OAuth_States.fk_auth_user` para o usuario alvo, entao o callback salva a conexao Gmail na conta da empresa acessada;
  - `gmail-scan-payables` publicada na versao 32, preservando `verify_jwt=false` porque tambem atende o agendador interno com segredo proprio;
  - em modo suporte, scan valida Mega Master/Admin + `Sessoes_Suporte`, busca Gmail da conta alvo, cria/reconcilia sugestoes para o alvo e registra log de suporte.
- Validacao remota:
  - dry-run SQL com `begin/rollback` passou antes da migration;
  - prova SQL remota criou sessao de suporte temporaria + conexao Gmail temporaria, simulou `auth.uid()` do Mega Master, leu status da conexao alvo, atualizou busca automatica, conferiu log e limpou tudo;
  - chamadas reais as Functions publicadas confirmaram: scan normal sem Gmail retorna 400 `Gmail ainda nao conectado`; contexto de suporte invalido retorna 403 em `gmail-scan-payables` e `gmail-oauth-start`;
  - limpeza final confirmou 0 usuarios integration, 0 conexoes Gmail integration, 0 sessoes de suporte integration e 0 logs integration.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 323 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.

## Dashboard Financeiro Mais Útil - 2026-06-09

- Pedido: remover cards operacionais e deixar o topo do Dashboard com os números financeiros realmente úteis para a cliente.
- `src/pages/Dashboard.tsx`:
  - removidos os cards `Em andamento`, `Finalizadas`, `Clientes cadastrados` e `Tempo médio`;
  - removida a linha duplicada de KPIs `Valor finalizado`, `Faturamento do mês` e `Ticket médio`;
  - painel `Resultado financeiro` agora mostra: `Entradas previstas`, `Faturamento real`, `Contas lançadas`, `Contas pagas`, `Falta pagar` e `Lucro do período`;
  - `Entradas previstas` soma o valor potencial das O.S. lançadas no período, excluindo O.S. `EXCLUIDA`;
  - `Faturamento real` continua usando apenas O.S. reconhecidas na regra contábil do Dashboard;
  - `Contas lançadas` usa competência financeira/vencimento da conta; `Contas pagas` usa data real de pagamento; `Falta pagar` calcula o saldo aberto das contas lançadas no período;
  - `Lucro do período` permanece `Faturamento real - Contas pagas`.
- Alteração apenas de frontend; sem mudança de banco, RPC, Storage ou Edge Function.
- Validação executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 46 arquivos e 339 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinâmico.
  - Observação: uma rodada intermediária de testes acusou `endOfMonth is not defined`; import corrigido e testes reexecutados com sucesso.

## Dashboard E Clientes Mobile - 2026-06-10

- Pedido: melhorar a experiência em celular/tablet, especialmente no Poco X6 Pro, reduzindo densidade visual sem perder os indicadores principais.
- Dashboard:
  - cards financeiros passaram de 2 por linha para 3 por linha em mobile/tablet, formando 3 + 3 para os seis indicadores principais;
  - cards ficaram mais baixos, valores menores e ícones ocultos no mobile para caber com leitura limpa;
  - tablet continua com 3 cards por linha, mas com altura e respiro maiores;
  - gráfico financeiro recebeu painel com bordas mais suaves, gradiente discreto, barras arredondadas e tooltip mais polido.
- Clientes:
  - botões `Exportar` e `Novo Cliente` dividem a mesma linha no mobile;
  - filtros foram compactados em uma linha: busca menor, status e CPF/CNPJ ao lado;
  - labels do filtro de documento foram simplificados para `CPF/CNPJ`, `CPF` e `CNPJ`;
  - cards mobile escondem rua/endereço e última nota, mantendo nome, documento, status, telefone, cidade/UF e ações pelo menu de três pontos.
- Validação visual local em mock:
  - viewport 393x851: Dashboard confirmado com 3 cards na primeira linha e 3 na segunda, cada card com 113px de largura;
  - viewport 768x1024: Dashboard confirmado com 3 cards por linha em tablet;
  - viewport 393x851: Clientes confirmado com busca compacta, filtros ao lado, botões 50/50 e sem rua/última nota visíveis nos cards.
- Alteração apenas de frontend; sem mudança de banco, RPC, Storage ou Edge Function.
- Validação final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 50 arquivos e 370 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinâmico.
  - `npm run test:integration`: não executado porque a alteração foi apenas de frontend, sem tocar banco, RPC, Storage ou Edge Function.

## Notas De Entrada E Kanban Mobile - 2026-06-10

- Pedido: refinar a experiência em celular depois dos ajustes anteriores:
  - em Notas de Entrada, reduzir um pouco a barra de busca, o botão de filtros e a altura dos cards;
  - em Kanban, corrigir dificuldade de deslizar horizontalmente no celular e simplificar filtros mobile.
- Notas de Entrada:
  - busca e filtros agora ficam na mesma linha em mobile, com input mais baixo e botão de filtro compacto por ícone;
  - placeholder da busca encurtado para `Buscar O.S. ou cliente`;
  - cards mobile de O.S. receberam padding e espaçamento de rodapé menores, ficando mais próximos de uma lista densa/tabela visual.
- Kanban:
  - filtros mobile foram reduzidos para `Todos`, `30d`, `Mais`, seletor compacto de ano e botão `Colunas` por ícone;
  - `60 dias` e `90 dias` continuam acessíveis no mobile dentro de `Mais`;
  - em tablet/desktop os filtros completos continuam visíveis;
  - seletor de ano no mobile virou dropdown compacto;
  - botões de rolagem por seta ficam ocultos no mobile, onde o gesto de dedo deve comandar o quadro;
  - container do quadro ganhou handler de toque para swipe horizontal quando o movimento do dedo é mais lateral que vertical;
  - clique no card é suprimido logo após um swipe lateral para evitar abrir a O.S. por acidente;
  - altura útil do quadro no mobile aumentou levemente com a barra de filtros menor.
- Validação visual local em mock:
  - viewport 393x851: busca de Notas de Entrada com 295px e filtro com 40px; cards medidos com 145px de altura;
  - viewport 393x851: Kanban com controles cabendo até ~290px de largura, board com `scrollWidth` 2920 e `touch-action: pan-y`;
  - viewport 768x1024: Kanban quebra filtros completos em duas linhas sem overflow horizontal;
  - console do navegador sem erros.
- Alteração apenas de frontend; sem mudança de banco, RPC, Storage ou Edge Function.
- Validação final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 50 arquivos e 370 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinâmico.
  - `npm run test:integration`: não executado porque a alteração foi apenas de frontend, sem tocar banco, RPC, Storage ou Edge Function.

## Contas A Pagar - PDFs Fora De Padrao E Nome No PDF Da O.S. - 2026-06-16

- Pedido: investigar por que PDFs de boleto fora do padrao falham na importacao com IA e corrigir cliente que imprimia como `Sert -` em vez de `Sert - Car` na nota de entrada.
- Diagnostico do arquivo `/Users/gabrielwilliamdepaulo/Downloads/Boleto_1 (1).pdf`:
  - PDF A4 com 3 boletos/parcelas empilhados no mesmo arquivo;
  - fornecedor: `SERRAF DISTRIBUIDORA DE PECAS P/A MOTORES LTDA`;
  - pagador: `J. M. SILVA RETIFICA DE MOTORES LTDA`;
  - documento base `76258`;
  - parcelas detectadas:
    - `001/003`, vencimento `08/07/2026`, valor `399,92`;
    - `002/003`, vencimento `22/07/2026`, valor `399,92`;
    - `003/003`, vencimento `05/08/2026`, valor `399,92`.
- Comportamento esperado do importador para esse PDF:
  - criar 3 rascunhos de contas, um por parcela, sem tratar `Recibo do Pagador` e `Ficha de Compensacao` como contas duplicadas;
  - titulos sugeridos no padrao `SERRAF Distribuidora - Parcela 1/3`, `2/3`, `3/3` ou equivalente sem nome generico/duplicata;
  - metodo `BOLETO`, recorrencia `NENHUMA`, status inicial pendente/incerto conforme confianca da leitura.
- Frontend de Contas a Pagar:
  - criado helper unico em `src/services/domain/payableFiles.ts` para reconhecer PDF/imagem/DOC por extensao quando o navegador envia MIME vazio, `application/octet-stream` ou `application/x-pdf`;
  - upload para Storage agora normaliza `contentType` pelo helper, evitando salvar boleto PDF como octet-stream;
  - modal de importacao e formulario rapido passaram a reutilizar o mesmo helper para preview e tipo de anexo.
- Edge Function `analisar-conta-pagar`:
  - aceita PDF/imagem/DOC/DOCX por extensao quando o MIME vem solto/generico;
  - reenvia arquivo para OpenAI com MIME normalizado;
  - prompt reforcado para boletos multiplos em uma pagina, especialmente `Parcela 001 / 003`, `002 / 003`, `003 / 003`;
  - timeout da resposta OpenAI ampliado para 90s e output maximo para 8000 tokens;
  - se a IA falhar, retorna rascunho seguro de revisao manual com status `INCERTO`, valor 0 e avisos, em vez de interromper o fluxo com erro seco.
- Notas de Entrada / PDF:
  - `formatNotaClientPrintName` agora preserva separadores comerciais entre os dois primeiros termos uteis;
  - regressao coberta para `SERT - CAR RETIFICA DE MOTORES LTDA` imprimir `Sert - Car`.
- Sem migration, sem mudanca de RLS/policy/bucket privacy e sem service role no frontend.
- Deploy remoto:
  - `supabase functions deploy analisar-conta-pagar --no-verify-jwt` executado com sucesso no projeto `dqeoxxokvvcpssajycgq`.
- Validacao executada nesta rodada:
  - testes direcionados de PDF/nome/importador passaram;
  - `npm test -- --run`: passou, 51 arquivos e 376 testes;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com warnings antigos de Fast Refresh;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: passou, 17 arquivos e 55 testes.
- Validacao nao executada:
  - `deno check` da Edge Function nao foi executado porque `deno` nao esta instalado neste ambiente.

## Notas De Entrada - Filtros Mais Limpos - 2026-06-09

- Pedido: remover duplicidade visual de paginação dentro de `Filtros da lista`.
- `src/pages/IntakeNotes.tsx`:
  - badge superior passou a mostrar `Página X de Y · 50 por página`;
  - badge duplicado da linha de filtros ativos foi removido;
  - `Sem filtros ativos` permanece sozinho quando não houver filtro aplicado.
- Alteração apenas de frontend; sem mudança de banco, RPC, Storage ou Edge Function.

## Limpeza De Usuarios Tenant/Integracao - 2026-06-09

- Pedido: apagar usuarios de tenant/teste criados e que estavam poluindo o sistema.
- Diagnostico seguro identificou somente usuarios nos padroes de teste conhecidos:
  - 7 usuarios temporarios `tenant-isolation-...@retifica.test` sem `auth_id`;
  - 1 usuario fixo `integration.test@retifica.com` com `auth_id`.
- Conferencia de dependencias antes da exclusao:
  - cada usuario tinha apenas 1 registro em `RetificaPremium.Modulos`;
  - 0 contas a pagar, anexos, historicos, configuracoes, sessoes de suporte, Gmail, chamados e logs vinculados.
- Execucao real:
  - 8 registros removidos de `RetificaPremium.Usuarios`;
  - 8 registros removidos de `RetificaPremium.Modulos`;
  - 1 usuario removido do Supabase Auth (`integration.test@retifica.com`).
- Validacao pos-limpeza:
  - 0 usuarios restantes em `RetificaPremium.Usuarios` para `tenant-isolation-...@retifica.test` e `integration.test@retifica.com`;
  - 0 modulos restantes para esses usuarios;
  - 0 usuarios restantes no Supabase Auth nesses padroes.
- Observacao:
  - `npm run test:integration` nao foi rodado depois desta limpeza operacional porque os testes de integracao recriam esses usuarios quando executados.

## Contas A Pagar - Lapidacao Visual Do Cockpit E Lista - 2026-06-23

- Pedido: melhorar e organizar o design que ja tinha sido iniciado, mantendo a direcao visual mais moderna e deixando a tela mais clean.
- Escopo:
  - lapidacao frontend em `src/components/payables/PayablesCockpit.tsx` e `src/pages/ContasAPagar.tsx`;
  - sem migration, sem alteracao de RLS/policy/bucket e sem nova Edge Function nesta rodada.
- Ajustes aplicados:
  - cockpit escuro passou a priorizar o valor realmente vencido quando ha atraso, evitando destaque enganoso de `R$ 0` nos proximos 7 dias;
  - barras do runway ficaram mais visiveis e compactas;
  - texto de zero vencimentos ficou mais natural: `nenhum vencimento nos proximos 7 dias`;
  - botao do resumo passou a deixar claro `Gerar IA`;
  - cards vencidos ficaram visualmente menos agressivos;
  - removido chip repetitivo `Revisar/ocultar` da lista;
  - acao principal foi compactada de `Registrar pagamento` para `Pagar`, preservando `title` acessivel;
  - grid da lista ganhou mais espaco para titulo/fornecedor e menos truncamento.
- Validacao visual local:
  - Playwright em modo mock abriu `/contas-a-pagar` em desktop e mobile;
  - desktop confirmou cockpit com `Prioridade agora`, barras visiveis e lista mais limpa;
  - mobile confirmou `scrollWidth=390` para viewport `390`, sem overflow horizontal.
- Validacao de comandos:
  - `npm run typecheck`: passou;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou, 56 arquivos e 422 testes;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico.

## Contas A Pagar - Lista Financeira, Parcelas E Qualidade Da IA - 2026-06-22

- Pedido: revisar profundamente a experiencia de Contas a Pagar da Retifica Premium, principalmente visualizacao em cards, parcelas, duplicidades, nomes ruins importados por IA e edicao em modo suporte.
- Diagnostico read-only da Retifica Premium no Supabase:
  - usuario alvo: `retificapremium5@gmail.com`;
  - 33 contas ativas encontradas no modulo;
  - 22 pendentes, totalizando R$ 8.851,70;
  - 11 pagas, totalizando R$ 5.340,26;
  - 21 contas com sinais de parcelamento/serie;
  - nenhuma conta ativa iniciando com `Duplicata`;
  - nomes ruins encontrados para melhoria de normalizacao: `Ferpecas Ribeiroa Preto`, `Ferpecas Ribeirao Preto`, `Pelegrino` e `Agua`.
- UX:
  - filtro padrao deixou de ser `Todas` e passou para `Pendentes`;
  - adicionadas abas `Parceladas` e `Repetidas`;
  - lista deixou de ser grade de cards grandes e passou a uma lista financeira compacta;
  - cada linha exibe vencimento, documento, valor, status, categoria, IA, possivel repeticao e acoes principais;
  - contas parceladas exibem chip `Parcela X/Y`, progresso da serie e saldo ainda aberto da serie.
- IA/importacao:
  - importacao passou a usar `classifyPayableMatch` em vez de apenas `findPayableDuplicate`;
  - duplicidade provavel ou caso ambiguo vai para revisao manual;
  - parcela/recorrencia legitima nao fica bloqueada como duplicata;
  - criacao em lote compara tambem com contas criadas no proprio lote para evitar repeticao silenciosa;
  - nomes/titulos vindos da IA passam por normalizacao conservadora de termos comuns em pt-BR.
- Edicao:
  - edicao de titulo no modal de detalhes e no formulario principal normaliza termos comuns e acentuacao;
  - teste unitario cobre que `update_conta_pagar` em modo suporte chama `update_conta_pagar_contexto_suporte` com `p_contexto_usuario_id` e `p_sessao_suporte`.
- Decisao de seguranca/custo:
  - nao foi criada rotina noturna com OpenAI nesta rodada;
  - antes disso, precisa de job auditavel, limite de custo, modo dry-run, log de alteracoes e rollback por conta, para evitar a IA alterar dado financeiro incorretamente.
- Validacao:
  - `npm run typecheck`: passou;
  - `npx tsc --noEmit`: passou;
  - `npm run lint`: passou com warnings antigos de Fast Refresh;
  - `npm test -- --run`: passou;
  - `npm run build`: passou com avisos conhecidos de Browserslist/chunks/import dinamico;
  - validacao visual via Playwright em modo mock: login local, tela `/contas-a-pagar`, aba `Pendentes` selecionada e lista renderizada sem erro de aplicacao.
- Observacao:
  - sem migration, sem alteracao de RLS/policy/bucket, sem Edge Function nova e sem service role no frontend.

## Filtros De O.S., Dashboard Finalizado E CPF/CNPJ - 2026-06-05

- Pedido: melhorar Notas de Entrada com filtro real por data, ajustar Dashboard para contabilizar valores de O.S. apenas quando `Finalizada`, impedir tempo medio negativo e permitir filtrar clientes por CPF/CNPJ.
- Notas de Entrada:
  - filtros de mes/ano foram substituidos por periodo com atalhos `Todo periodo`, `Hoje`, `7 dias`, `30 dias`, `Este mes` e `Personalizado`;
  - periodo personalizado usa data inicial/final;
  - filtro agora vai para o banco por `p_data_inicio` e `p_data_fim`, evitando limitar resultados somente a pagina carregada.
- Banco/RPC:
  - migrations locais criadas:
    - `supabase/migrations/20260605024650_notas_servico_date_range_filters.sql`;
    - `supabase/migrations/20260605025649_drop_old_notas_servico_overloads.sql`;
  - migrations aplicadas no projeto `dqeoxxokvvcpssajycgq`:
    - `notas_servico_date_range_filters`;
    - `drop_old_notas_servico_overloads`;
  - `get_notas_servico` e `get_notas_servico_contexto_suporte` ficaram com assinatura unica incluindo `p_data_inicio date` e `p_data_fim date`;
  - overloads antigos foram removidos para evitar ambiguidade no PostgREST.
- Dashboard:
  - receita/faturamento, lucro, ticket medio e grafico financeiro passam a usar somente O.S. com status `FINALIZADO`;
  - card de volume de O.S. lancadas nao mostra mais valor financeiro, para nao sugerir faturamento antes da finalizacao;
  - tempo medio de O.S. nunca fica negativo; datas inconsistentes sao normalizadas para 0 dia e sinalizadas no subtitulo.
- Clientes:
  - adicionado filtro por tipo de documento `CPF` ou `CNPJ`;
  - busca por documento normaliza numeros, permitindo pesquisar com ou sem pontuacao;
  - tela mostra contadores de clientes filtrados, empresas com CNPJ e pessoas com CPF.
- Validacao remota:
  - dry-run SQL com `begin/rollback` passou antes de aplicar a primeira migration;
  - catalogo remoto confirmou que restaram apenas as assinaturas novas das duas RPCs de O.S.;
  - limpeza pos-integracao removeu 3 usuarios internos de teste e confirmou 0 usuarios internos suspeitos restantes.
- Validacao final executada:
  - `npx tsc --noEmit`: passou.
  - `npm run lint`: passou com 8 warnings antigos de Fast Refresh.
  - `npm test -- --run`: passou, 42 arquivos e 323 testes.
  - `npm run build`: passou, mantendo avisos conhecidos de Browserslist/chunks/import dinamico.
  - `npm run test:integration`: passou, 16 arquivos e 53 testes.
