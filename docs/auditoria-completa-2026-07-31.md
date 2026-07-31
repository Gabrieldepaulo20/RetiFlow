# Auditoria Completa — 2026-07-31

Escopo: cálculos de Dashboard/Financeiro, código morto, dependências não usadas, performance
(bundle/queries/re-renders), bugs gerais, responsividade real em tablet/celular (popups e
dashboards), honestidade de mock/parcial na UI.

Método: 4 leituras estáticas independentes de código (cada uma cobrindo uma dimensão) + verificação
visual ao vivo com app rodando localmente em `VITE_AUTH_MODE=mock` (sem tocar dado real de produção),
logado como `admin@retifica.com`, testado em 1280×800 (desktop), 834×1194 (tablet) e 390×844 (mobile).
Nenhuma edição foi feita durante a auditoria; nenhuma migration, RPC, RLS ou policy foi alterada.

Legenda de confiança: **verificado** (visto rodando ou lido diretamente no código-fonte) vs
**hipótese** (inferência que precisaria de profiling/dado real de produção para confirmar).

---

## Status pós-fix (segunda passada, mesmo dia)

Corrigido e validado (typecheck + lint + testes + build, todos verdes; nada commitado):
**#1** (double-count de receita), **#3** (Dashboard silencioso), **#4** (mock mode no Financeiro),
**#7** (KPI desatualizado), **#8** (fuso horário "hoje"), **#9** (`insert_log` fora do `callRPC`),
mais toda a seção "Baixo risco / limpeza" (código morto e deps). Detalhe do que mudou em cada um:
`docs/contexto-sessao.md`, entrada "Correções Da Auditoria Completa - 2026-07-31".

Não corrigido nesta rodada (decisão consciente):
- **#2** (cap de 5.000) — precisa saber o volume real de notas/contas em produção antes de decidir
  entre avisar na UI ou paginar de fato; não dá pra confirmar por leitura de código.
- **#5** (RPCs de suporte sem remap, incl. `get_usuarios` achado nesta auditoria) e **#6** (resíduo
  de Nota Fiscal em `faturas.ts` — **este já foi removido na limpeza**, ver nota abaixo) — exigem
  criar/alterar RPC no backend, o que pede plano + aprovação explícita (regra do `AGENTS.md`), não
  algo que um agente decide sozinho.
- Achados de performance (chunk grande do `DataContext`, falta de `React.memo`/virtualização) —
  ficam como estavam, são débito técnico já documentado, não bugs.
- Kanban com scroll horizontal ruim no mobile — não corrigido, precisa de decisão de design.

Nota sobre #6: o resíduo `src/api/supabase/faturas.ts` + barrel `src/api/supabase/index.ts` **foi
removido** durante a limpeza de código morto (não é criação/alteração de RPC — é só apagar um
arquivo de frontend nunca importado por ninguém).

---

## Alto risco

### 1. Double-count de receita entre KPI principal e gráfico/card anual do Dashboard
- **Onde:** `src/pages/Dashboard.tsx:294-312` (`monthlyData`), `:483-488` (`yearlyRevenue`) vs `:375`
  (`periodRevenue`, que usa `financeiroResumo.faturamentoCompetencia`).
- **Bug:** o KPI "Faturamento real" e o DRE excluem notas que entraram num Fechamento (usam o valor
  líquido do fechamento, com desconto). O gráfico "Faturamento — 6 meses" e o card "Resultado Anual"
  somam o `totalAmount` bruto de cada nota individualmente, sem checar `note.closingId` — campo que
  existe no tipo mas não é referenciado em `dashboardFinance.ts`.
- **Cenário real:** toda retífica que agrupa O.S. em fechamento com desconto (fluxo padrão, ver
  `docs/central-financeiro-reconciliacao-2026-07-30.md`) vê dois números de receita diferentes na
  mesma tela para o mesmo mês — e o gráfico/card sempre acima do valor real.
- **Fix sugerido:** excluir notas com `closingId` setado nesses dois cálculos, ou servir a série
  mensal a partir da própria RPC financeira em vez de recalcular no cliente.

### 2. Cap de 5.000 registros sem aviso — corrompe silenciosamente o Dashboard em volume alto
- **Onde:** `src/contexts/DataContext.tsx:455` (`getDashboardResumo({ p_limite: 5000 })`);
  `supabase/functions/dashboard-resumo/index.ts` (`parseLimit`, máx. 5000).
- **Bug:** a RPC ordena por data decrescente e corta o resto. Ao passar de 5.000 notas OU contas
  acumuladas, os registros **mais antigos** desaparecem do array que alimenta todo o Dashboard
  (receita, DRE, "A pagar/A receber"), sem nenhum "carregando X de Y" — viola a regra do AGENTS.md de
  sinalizar dado parcial. `Financeiro.tsx` não tem esse problema (usa `getAllFinanceiroPages`, que
  pagina até o total real).
- **Fix sugerido:** expor `totais` (já retornado pela function) na UI quando `total > limite`, ou
  paginar de fato o `DataContext`.
- **Confiança:** verificado no código; não sei se o volume atual de produção já esbarra no limite
  (precisa consulta ao banco real).

### 3. Fallback silencioso do Dashboard quando a RPC financeira falha (CONFIRMADO AO VIVO)
- **Onde:** `src/pages/Dashboard.tsx:229-248` (`catch(() => setFinanceiroResumo(null))`, sem
  toast/aviso) e `:402-413` / `:892-901` (`legacyOpenReceivableAmount`/`legacyOpenPayableAmount`, que
  não filtram por `selectedPeriod.end` nesse fallback).
- **Teste ao vivo feito hoje:** com a mesma falha de RPC financeira disparada nas duas telas, a página
  **Financeiro** mostrou um banner vermelho explícito ("Parte da central não carregou. Atualize a
  tela...") — comportamento correto. O **Dashboard**, na mesma sessão, mostrou "Recebido R$0,00 / Pago
  R$0,00 / Saldo R$0,00" **sem qualquer aviso**, como se não tivesse havido movimentação — e o rótulo
  "(em aberto até 31/07)" ficou tecnicamente errado porque os valores de fallback não são filtrados
  por data. Duas telas, mesma falha, tratamento inconsistente — uma mente por omissão.
- **Fix sugerido:** mostrar aviso "dados aproximados/RPC indisponível" nesse catch; filtrar
  `legacyOpen*` por `selectedPeriod.end` antes de somar.

### 4. Central Financeiro não respeita `VITE_AUTH_MODE=mock` (CONFIRMADO AO VIVO)
- **Onde:** `src/api/supabase/financeiro.ts` e `src/api/supabase/_base.ts` — nenhuma checagem de
  `IS_REAL_AUTH`, diferente de `src/contexts/DataContext.tsx` (~20 checagens) e `src/api/supabase/
  support.ts`, que respeitam o modo mock.
- **Teste ao vivo:** rodando local com `VITE_AUTH_MODE=mock`, a tela Financeiro disparou 6 RPCs
  (`get_financeiro_resumo`, `get_financeiro_contas`, `get_financeiro_extrato`,
  `get_financeiro_lancamentos`, `get_categorias_entradas`, `get_financeiro_modelos_recorrentes`)
  direto contra o Supabase de produção, todas retornando `401 permission denied` porque a sessão mock
  não tem JWT real.
- **Impacto:** a funcionalidade mais nova do sistema (Central Financeiro, ~julho/2026) não tem
  nenhum caminho local/demo — todo dev/teste precisa de credencial real de produção, inconsistente
  com o resto do app.
- **Fix sugerido:** decidir conscientemente — ou dar suporte mock a `financeiro.ts` (dados locais),
  ou documentar explicitamente que Financeiro exige `VITE_AUTH_MODE=real` (hoje não está documentado
  em nenhum lugar, nem no `CLAUDE.md`).

### 5. Modo suporte: RPCs de leitura sem remap — dado errado exibido ao Mega Master
- **Onde:** `src/api/supabase/_base.ts` (`SUPPORT_CONTEXT_RPC_MAP`).
- **Já documentado (ainda pendente):** `get_categorias_conta_pagar` não remapeado, enquanto
  `insert_categoria_conta_pagar`/`update_categoria_conta_pagar` são.
- **Achado novo hoje:** `get_usuarios` (tela Configurações → Usuários) também não é remapeado. Numa
  sessão de suporte, a lista de usuários mostrada é a do Mega Master, não a do tenant — uma ação de
  inativar/alterar módulo pode atingir a pessoa errada. Sem guard de suporte na tela (`Settings.tsx`
  não tem nenhuma checagem de contexto de suporte para essa aba).
- **Fix sugerido:** adicionar `get_usuarios`/`get_categorias_conta_pagar` ao mapa (criando a RPC
  `*_contexto_suporte` se não existir), e revisar o mapa completo por mais "irmãos esquecidos" antes
  de fechar o ciclo — o padrão "escrita remapeada, leitura irmã esquecida" já se repetiu duas vezes.

### 6. Resíduo de Nota Fiscal ainda alcançável via import
- **Onde:** `src/api/supabase/faturas.ts` (74 linhas, CRUD completo de `Fatura`/NFE/NFSE) +
  `src/api/supabase/index.ts` (barrel que reexporta).
- **Bug:** nenhuma página/rota/menu usa, mas o módulo é 100% funcional e importável — exatamente o
  tipo de remanescente que o `AGENTS.md` proíbe reativar sem autorização explícita.
- **Fix sugerido:** remover os dois arquivos (ou mover para fora de `src/` com aviso "não usar").

---

## Médio risco

### 7. KPIs do Financeiro ficam até 30s desatualizados após pagamento pelo fluxo padrão
- **Onde:** `src/pages/Financeiro.tsx:216-241` (`refetchInterval: 30_000`); `DataContext.tsx`
  (`updatePayable`/registros de pagamento não invalidam `['financeiro']`).
- **Cenário:** usuária marca conta como paga pelo modal padrão (fora do fluxo de importação IA, que
  já invalida corretamente) — KPIs do topo (Saídas/A pagar/Saldo) só atualizam no próximo poll ou com
  clique manual em "Atualizar".
- **Fix:** fazer as funções do `DataContext` que tocam `registrar_pagamento`/`registrar_recebimento`/
  estornos invalidarem `['financeiro']` no `queryClient` global.

### 8. Bug de fuso horário "hoje local vs. UTC" reaparece em defaults de formulário
- **Onde:** `PayableImportModal.tsx:381,443`, `NoteDetailModal.tsx:206`, `IntakeNoteDetail.tsx:44`,
  `MonthlyClosing.tsx:321,327,1810,1943`, `PayableQuickForm.tsx:132,260`.
- **Bug:** todos usam `new Date().toISOString().slice(0,10)` como "hoje". Em `America/Sao_Paulo`
  (UTC-3), entre ~21h e 23h59 esse cálculo já cruzou a meia-noite em UTC e devolve o dia **seguinte**.
  É a mesma causa-raiz já corrigida uma vez (ver `docs/contexto-sessao.md:653-670`, motivou o helper
  `src/lib/dates.ts`) — mas esse helper só cobre formatação de leitura, nunca cobriu a geração do
  valor "hoje" usado como default em campos de escrita.
- **Fix:** criar `todayLocalISODate()` em `src/lib/dates.ts` usando `getFullYear()/getMonth()/
  getDate()` locais, substituir os pontos acima.

### 9. `insert_log` fora do `callRPC`
- **Onde:** `src/api/supabase/logs.ts:26-40` — chama a RPC direto, sem passar pelo wrapper padrão.
- **Impacto:** em sessão de suporte, todo log de auditoria grava a identidade do Mega Master, não a
  do contexto do tenant.

### 10. Kanban — scroll horizontal difícil no mobile (pendência antiga, CONFIRMADO ainda presente)
- Testado hoje em 390px: a tela mostra 1 coluna cheia + uma lasca da próxima; arrastar um card para
  uma coluna fora da tela exige scroll horizontal simultâneo ao drag, que é difícil no touch.
- **Fix sugerido:** normalmente resolvido com colunas mais estreitas em mobile + snap-scroll, ou um
  seletor de coluna alternativo para mobile (fora do escopo desta auditoria definir o design certo).

### 11. Formatação de moeda BRL duplicada em ~10 arquivos
- `OSPreviewModal.tsx`, `PayableDetailsModal.tsx:55`, `PayablesCockpit.tsx:14`,
  `PayableEmailSuggestions.tsx:54`, `IntakeNotes.tsx:71`, `Dashboard.tsx:65,69`, `Clients.tsx:40-84`,
  `ContasAPagar.tsx:50`, `MarketingGrowth.tsx:198-210`, `payablesBriefing.ts:32` — nenhum usa um
  helper central. Risco real de formatação inconsistente entre telas (ex. casas decimais, símbolo).
- **Fix:** consolidar em `src/lib/currency.ts`.

### 12. Cards "Contas lançadas"/"Falta pagar" não avisam sobre o corte contábil 01/06/2026
- Diferente dos vizinhos "Contas pagas" (avisa "desde {label}") e do card anual
  (`yearlyExpensesPartial`). `Dashboard.tsx:719-776` vs `:743-753,1077-1079`.

---

## Baixo risco / limpeza (código morto e duplicação)

- **Remover:** `src/api/index.ts`, `src/api/supabase/index.ts` (barrels sem consumidor — arrastam o
  achado #6), `src/components/NavLink.tsx`, `src/components/ui/use-toast.ts` (shim sem uso).
- **Decidir destino:** `src/hooks/useOperationalQueries.ts`/`useNotesData.ts`/`useCustomersData.ts` —
  primeira camada da migração incremental do `DataContext` mencionada no `CLAUDE.md`, hoje 100%
  abandonada (zero import). Completar ou remover.
- **~18 componentes shadcn/ui sem nenhum import:** `accordion`, `aspect-ratio`, `breadcrumb`,
  `carousel`, `chart.tsx` (303 linhas), `checkbox`, `command`, `context-menu`, `hover-card`,
  `input-otp`, `menubar`, `navigation-menu`, `pagination`, `radio-group`, `resizable`,
  `sidebar.tsx` (638 linhas), `slider`, `toggle-group`, `form.tsx` (129 linhas). Confirmar antes que
  não há UI próxima planejada que os use.
- **Deps não usadas:** `@hookform/resolvers`, `@tailwindcss/typography` e `react-hook-form` (o
  último só era usado pelo `form.tsx` órfão acima), além das dependências diretas usadas somente
  pelos componentes UI removidos; todas removidas na limpeza pós-auditoria.
- **Duplicação:** `formatCurrency`/`formatDate`/`isInformationalItem`/`chunkItems` quase
  byte-a-byte entre `OSPreviewModal.tsx:52-70` e `NotaPDFTemplate.tsx:335-355`; `formatDate` local
  duplica `formatDateBR` já existente em `src/lib/dates.ts:14`.
- **Sem `console.log`/`debugger`/TODO reais** em `src/` fora de testes — limpo.
- **Mock/placeholder honesto:** `Settings.tsx` (senha indisponível), `MfaSettingsCard.tsx`,
  `IntakeNotes.tsx`/`Financeiro.tsx` (exportação indisponível), `AdminDashboard.tsx` (série
  indisponível), `AdminClients.tsx` (aviso de senha demo) — todos comunicam a limitação claramente,
  sem comportamento enganoso.
- **Permissão de estorno preservada:** embora a RPC `estornar_recebimento_nota` aceite qualquer
  perfil com o módulo Financeiro habilitado, o frontend continua exibindo o botão somente para
  `ADMIN`. Ampliar essa permissão é uma decisão de produto e segurança separada, não uma limpeza
  técnica a ser publicada implicitamente.

---

## Performance (auditoria majoritariamente limpa)

- **Build:** `npm run build` ok, 5.91s, sem erro. `chunkSizeWarningLimit` não foi inflado. Vendor
  splits (`react-vendor`, `charts-vendor`, `motion-vendor`, `kanban-vendor`, `query-vendor`,
  `ui-vendor`, `utils-vendor`) todos isolados corretamente — nada vazou.
- **Únicos chunks grandes:** `index-*.js` (558 kB) — é o próprio `DataContext.tsx` (1682 linhas)
  carregado estático no boot, débito técnico já documentado no `AGENTS.md` (migração incremental
  recomendada, não é bug novo). `react-pdf.browser-*.js` (1,46 MB) — inerente à lib, carregado só via
  `import()` dinâmico ao gerar/imprimir PDF, nunca no load inicial. **Sem violação.**
- **`xlsx`/`recharts`/`@react-pdf/renderer`:** todos os imports estáticos verificados estão nos
  arquivos certos (templates de PDF, telas de gráfico). `xlsx` nem existe mais como dependência.
- **Lazy loading:** todas as 22 páginas cobertas por `React.lazy` (direto ou aninhado).
- **Polling do painel Crescimento (5 min):** intervalo correto (300.000ms), pausa em background,
  sem polling extra — implementação correta, sem achado.
- **N+1:** nenhum padrão de loop-com-await-de-RPC encontrado em `src/api/supabase/*`;
  `getAllFinanceiroPages` já faz paginação em lote com `Promise.all`.
- **Re-renders:** `DataContext`/`Dashboard` bem memoizados (9+31 `useMemo`, 36 `useCallback`).
  **Hipótese não confirmada por profiling:** zero uso de `React.memo` no projeto e nenhuma
  virtualização de lista — cards do Kanban e linhas de tabela reconciliam por completo a cada render
  do pai. Pode gerar jank em volume alto, mas não foi medido (precisa React DevTools Profiler com
  dado real).
- **Achado pequeno:** `AppLayout.tsx` é importado estático (não-lazy) em `App.tsx`, então
  `motion-vendor` (41 kB gzip) é baixado até em rotas públicas como `/login`. Impacto pequeno,
  registrado por completude.

---

## Responsividade — verificação visual (tablet 834px e mobile 390px)

- **Dashboard:** grid de KPIs 4+3 no tablet e 3+3+1 no mobile, sem overflow, sem clipping — ok nos
  dois tamanhos.
- **Diálogos financeiros (`FinanceActionDialog`, `FinanceAccountsDialog`, `PayableModalShell`,
  `PayableQuickForm` — o diff não commitado de hoje):** testados no tablet e no mobile. Header e
  footer fixos, corpo rolável, sem clipping, sem scroll horizontal indevido, botão de ação sempre
  alcançável. **O fix em andamento está correto e pode ser finalizado/commitado.**
- **Kanban no mobile:** scroll horizontal ainda apertado (achado #10 acima, pendência antiga
  confirmada, não corrigida).
- Não testado nesta rodada: Fechamento Mensal (preview de PDF) e telas de Crescimento/Configurações
  em mobile — recomenda-se cobrir numa próxima passada se for prioridade.

---

## Recomendação de ordem de ataque

1. **#3 e #4** (Dashboard mentindo em silêncio + Financeiro sem modo mock) — mesma raiz de
   "tratamento de erro financeiro inconsistente", baixo risco de regressão, alto valor de confiança
   pro usuário.
2. **#1** (double-count de receita) — é cálculo visível todo santo dia, mas precisa de cuidado extra
   por tocar regra de negócio já reconciliada; validar com dado real antes de mudar.
3. **#5** (RPCs de suporte sem remap) — requer nova RPC/plano de backend, seguir o fluxo do AGENTS.md
   (plano + aprovação) antes de tocar.
4. **#2** (cap de 5.000) — depende de saber se já é risco real em produção; checar volume primeiro.
5. Limpeza (#6, dead code, deps) — baixo risco, pode ser feito em lote separado.
6. **#8, #9, #7** — patches pequenos e independentes, bons candidatos para primeira rodada de fix.
