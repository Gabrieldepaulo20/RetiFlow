# Contexto da Sessao - Retiflow

Atualizado em: 2026-06-10

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
