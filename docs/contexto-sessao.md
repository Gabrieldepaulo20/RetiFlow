# Contexto da Sessao - Retiflow

Atualizado em: 2026-06-03

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
