# Análise Profunda — Módulo Contas a Pagar (multiempresa + IA)

Data: 2026-06-03. Autor: revisão arquitetural. Status: análise + plano (Fase 0 de segurança já mitigada).

---

## 1. Mapa do módulo

**Frontend**
- `src/pages/ContasAPagar.tsx` — página (abas: Contas | Sugestões), lista, filtros, modais.
- `src/components/payables/` — `PayableEmailSuggestions` (sugestões/Gmail), `PayableDetailsModal`, `PayableCreateModal`, `PayableImportModal` (import por IA), `PayableQuickForm`, `SupplierAvatar`, `ContextualQuestionBanner`.
- `src/services/domain/payables.ts` — regras puras (status, dedup, parcelas, perguntas contextuais).
- `src/contexts/DataContext.tsx` — estado global (payables, emailSuggestions, categorias…), load por `activeUserId`.

**Backend (Supabase)**
- RPCs Postgres (schema `RetificaPremium`): `get_contas_pagar`, `get_conta_pagar_detalhes`, `insert/update/cancelar/excluir_conta_pagar`, `registrar_pagamento`, `get_sugestoes_email`, `aceitar/ignorar_sugestao_email`, `get_gmail_connection_status`, `update_gmail_auto_sync_settings`.
- Variantes de suporte: `get_contas_pagar_contexto_suporte`, `get_conta_pagar_detalhes_contexto_suporte`, etc.
- Edge Functions (Deno): `gmail-oauth-start/callback`, `gmail-scan-payables` (lê Gmail + IA OpenAI), `gmail-auto-sync-dispatch` (cron), `analisar-conta-pagar` (import por IA).

**Tabelas**
- `Contas_Pagar` (escopo `fk_criado_por` = Usuarios.id), `Contas_Pagar_Anexos`, `Contas_Pagar_Historico`, `Categorias_Contas_Pagar`, `Fornecedores_Contas_Pagar`.
- `Sugestoes_Email` (escopo **`fk_auth_user`** = auth uid), `Gmail_Connections` (escopo `fk_auth_user`), `Gmail_OAuth_States`, `Gmail_Scanned_Messages`.

**Modelo de identidade/tenant (chave para entender tudo)**
- `auth.uid()` = usuário autenticado (ex.: Gabriel/Mega Master).
- `realUser` = perfil do autenticado. `supportTargetUser` = empresa-alvo quando em suporte.
- `operationalUser = supportTargetUser ?? realUser` → **contexto de operação**.
- `activeUserId = operationalUser.id` → dispara reload do DataContext ao trocar.
- Contexto de suporte enviado ao backend via `_base.ts:withSupportContext` (troca o nome da RPC p/ `*_contexto_suporte` + injeta `p_contexto_usuario_id` + `p_sessao_suporte`, validados server-side por `resolve_suporte_contexto_usuario_id`).
- **Duas chaves de tenancy convivem**: operacional usa `fk_criado_por`/`criado_por_usuario` (= Usuarios.id interno); Gmail/Sugestões usam `fk_auth_user` (= auth uid). **Essa dualidade é a origem do bug.**

---

## 2. Fluxo atual (e-mail → IA → sugestão → conta)

1. Cliente conecta Gmail (OAuth) → `Gmail_Connections` (refresh token AES-GCM, escopo `fk_auth_user`).
2. `gmail-scan-payables` (manual ou cron `gmail-auto-sync-dispatch`): lê e-mails, baixa anexos, manda p/ OpenAI (`OPENAI_PAYABLE_MODEL`, padrão `gpt-5.5`), normaliza, **filtra** (isPayable + amount + dueDate + confidence ≥ 40) e insere em `Sugestoes_Email` (`fk_auth_user`). Reconcilia comprovante "pago" com sugestão pendente.
3. Frontend lê `get_sugestoes_email` (filtra `fk_auth_user = auth.uid()`).
4. Aceitar → `aceitar_sugestao_email` cria `Contas_Pagar`; "criar como paga" registra pagamento.

---

## 3. 🔴 Falha crítica de segurança (multiempresa) — CAUSA RAIZ E LOCALIZAÇÃO

**Onde**: `src/api/supabase/_base.ts` → `SUPPORT_CONTEXT_RPC_MAP` remapeia clientes/notas/contas/fornecedores/fechamentos, **mas NÃO `get_sugestoes_email` nem `get_gmail_connection_status`** (e não existem variantes `*_contexto_suporte` para eles).

**Efeito**: em modo suporte, `getSugestoesEmail()`/`getGmailConnectionStatus()` rodam como `auth.uid()` = **Mega Master** → mostram as **sugestões/Gmail do suporte** dentro do contexto da empresa acessada. É o "apareceram sugestões/contas minhas" que você viu.

**Escopo do vazamento (importante)**: é o dado do **Mega Master vazando para o próprio Mega Master em modo suporte** — NÃO é cliente-A-vendo-cliente-B (cliente normal só chama sob o próprio `auth.uid()`; o gate `resolve_suporte_contexto_usuario_id` impede impersonação por não-admin). Mas quebra o isolamento de contexto e pode levar o suporte a aceitar uma sugestão própria achando que é da empresa (criaria a conta na conta do suporte, não da empresa).

**A lista de Contas a Pagar em si NÃO vaza**: `get_contas_pagar` é remapeado e o reload do DataContext re-escopa ao trocar `activeUserId`.

**Mitigação aplicada (commit `ddfdf7f`)**: aba Sugestões/Gmail ocultada em modo suporte; view força "contas". Para o vazamento já, sem migration.

**Correção definitiva (Fase 1 do plano)**: criar RPCs `get_sugestoes_email_contexto_suporte`, `get_gmail_connection_status_contexto_suporte` (e bloquear aceitar/ignorar em suporte ou criar variantes) que:
- validam via `resolve_suporte_contexto_usuario_id` (super-admin + sessão ativa);
- mapeiam o `Usuarios.id` alvo → `fk_auth` (auth uid) do alvo e filtram `Sugestoes_Email/Gmail_Connections` por esse auth uid;
- adicioná-las ao `SUPPORT_CONTEXT_RPC_MAP`.
- `DataContext` (linha ~366) também chama `getSugestoesEmail()` direto no load → trocar por refresh que respeite contexto (ou pular em suporte até a RPC existir).

---

## 4. Gmail — análise de isolamento

- Token vinculado ao **usuário (`fk_auth_user`)**, não à empresa formalmente — mas como cada empresa cliente tem seu próprio usuário/auth, na prática é 1 Gmail por usuário-empresa. ✓
- Risco de empresa usar token de outra: **não** — scan/decrypt sempre por `fk_auth_user` da própria conexão. ✓
- Sugestões/anexos herdam `fk_auth_user`. ✓ (não têm `empresa_id` separado; tenancy = fk_auth_user).
- **Gap**: em suporte, a conexão Gmail exibida era a do suporte (mesmo bug do §3). Corrigido pela mitigação; definitivo na Fase 1.
- **Recomendação**: padronizar a tenancy de Gmail/Sugestões para o mesmo eixo do resto (mapear sempre via Usuarios), e logar `empresa/fk_auth_user` em cada scan.

---

## 5. IA / Sugestões — estado atual e plano de elevar 200%

**Hoje**: 1 chamada OpenAI por e-mail/anexo, prompt único, retorna 1 objeto por mensagem; filtra por confiança; reconcilia pago. Anti-injection + timeout + teto de tokens OK. Limitações: não agrupa múltiplos PDFs do mesmo e-mail; parcelas/recorrência fracas; sem comparação com histórico real (dedup só no front); sem rastreabilidade rica; "lista de salários" não vira N contas.

**Pipeline-alvo (por etapas, server-side)**:
1. Buscar e-mails da empresa correta (já). 2. Pré-filtro financeiro barato (regex/heurística) antes da IA. 3. Baixar anexos. 4. Extrair texto (PDF/imagem/OCR). 5. **Classificar** cada documento (boleto/NF/recibo/comprovante/folha/desconhecido). 6. **Agrupar** documentos relacionados do mesmo e-mail. 7. Extrair campos por documento. 8. **Comparar com histórico da empresa** (fornecedor+valor+vencimento+CNPJ). 9. Detectar duplicidade. 10. Detectar parcela/recorrência. 11. Score de confiança. 12. Criar sugestão (1..N por e-mail). 13. **Pendência de revisão** quando faltar campo essencial. 14. Conta só com confirmação ou alta confiança.

**Regras de documento**: boleto/recibo → aceitar; NF com valor+fornecedor+vencimento → sugerir, senão "documento fiscal sem cobrança"; boleto+NF no mesmo e-mail → relacionar; múltiplos boletos → parcelas vs cobranças separadas; comprovante → reconciliar conta existente (já parcialmente feito). **Na dúvida → revisão humana.** Campos essenciais p/ criar conta: favorecido + valor + vencimento/competência + categoria mínima.

**Prompt v2 (estruturado)**: retornar JSON com `documentos[]` (tipo, fornecedor, CNPJ, valor, vencimento, emissão, competência, nota, linha_digitável, parcela_numero/total, categoria, confianca, precisa_revisao, campos_incertos), `agrupamento`, `recorrencia`, `duplicidade` (conta_existente_id), `acao_recomendada` (criar_sugestao | revisar | ignorar), `justificativa`. IA deve justificar e apontar incertezas; nunca inventar valor/vencimento.

**Parcelas/recorrência**: detectar "X/Y", mesmo CNPJ+descrição recorrente, valor ~igual em meses diferentes; sugerir "parece parcela de conta existente" / "cobrança recorrente". Dedup: "já existe conta semelhante (fornecedor+valor+vencimento) — revisar?" (helper `findPayableForSuggestion` já existe; mover comparação p/ backend com histórico real).

---

## 6. UX da tela de sugestões (plano)

Seções/filtros: pendentes, alta confiança, baixa confiança (Incertas — já existe), possível duplicidade, possível recorrência, parcelas, erro, precisa revisão. Por card: e-mail de origem, arquivo de origem, dados extraídos, **"ver motivo da IA"** (justificativa + campos incertos), e ações: aceitar, **editar antes de aceitar**, ignorar, **vincular a conta existente**, **marcar como recorrente**. Mostrar erros claramente. (Hoje já há: avatar, chips de sinais, badge de risco/confiança, gating ALTO, fold "incertas", fold "já cadastradas".)

---

## 7. Auditoria / rastreabilidade (plano)

Registrar por sugestão: empresa, conta Gmail, e-mail (id), anexo, resultado/confiança da IA, quem aceitou, data, conta criada, se editada/ignorada, motivo, **se foi em modo suporte**. Adicionar colunas em `Sugestoes_Email` + tabela de eventos, e gravar `support_session_id` quando a ação for em suporte.

---

## 8. Plano de implementação por fases

- **Fase 0 — Segurança (FEITO/mitigado)**: ocultar Sugestões/Gmail em suporte (commit `ddfdf7f`).
- **Fase 1 — Segurança definitiva**: RPCs `*_contexto_suporte` p/ sugestões+Gmail + mapa em `_base.ts` + ajustar DataContext; bloquear writes de sugestão em suporte. (migration + edge + front; testar com integração tenant-isolation).
- **Fase 2 — IA pipeline v2**: prompt estruturado + classificação + agrupamento + comparação com histórico no backend + parcelas/recorrência + pendência de revisão. (edge `gmail-scan-payables` + `analisar-conta-pagar` + colunas).
- **Fase 3 — UX sugestões**: seções/filtros, "motivo da IA", editar-antes-de-aceitar, vincular a conta, marcar recorrente.
- **Fase 4 — Auditoria**: rastreabilidade completa + modo suporte registrado.

## 9. Plano de testes (mínimo)
- Cliente A só vê A; B só vê B; nenhum vê Mega Master.
- Mega Master em suporte na Empresa X só vê X (sugestões/Gmail/contas); ao trocar p/ Y, cache limpo; ao sair, contexto normal.
- IA: 1 boleto→sugestão; NF sem boleto→revisão; boleto+NF→agrupa; 2 parcelas→reconhece; duplicado→não duplica; baixa confiança→revisão; folha→N contas.

## 10. Riscos antes de mexer em produção
- `supabase db push` bloqueado (drift) → migrations via SQL Editor + testar.
- Edge functions não entram no `tsc` → revisar à mão + integração.
- Mudança em RPC `SECURITY DEFINER` mal feita quebra a view (escopo). Toda migration nova = `create or replace` (não editar antigas).
- Rotacionar as chaves Supabase expostas (pendência aberta).

---

## 11. Atualização técnica — 2026-06-10

### Estado revalidado no código

- Stack atual: React 18 + Vite + TypeScript + Tailwind/Radix/Lucide no front; Supabase Auth/RPC/Storage/Edge Functions no backend; OpenAI Responses API nas funções `gmail-scan-payables` e `analisar-conta-pagar`.
- O bug crítico de suporte descrito na Fase 1 já está mitigado no código atual:
  - `src/api/supabase/_base.ts` remapeia `get_sugestoes_email`, `get_gmail_connection_status`, ações de sugestão e escritas de contas a pagar para RPCs `*_contexto_suporte`;
  - `supabase/migrations/20260603130000_support_context_email_suggestions.sql` cria leitura escopada por `Usuarios.auth_id` do alvo;
  - `supabase/migrations/20260604103000_support_context_gmail_connection.sql` cria status/configuração Gmail por contexto;
  - `supabase/migrations/20260603183000_support_context_payables_writes.sql` adiciona escritas auditadas para contas a pagar em suporte.
- Gmail já tem pontos bons: OAuth server-side, escopo `gmail.readonly`, token criptografado por `GOOGLE_TOKEN_ENCRYPTION_KEY`, limites de anexo, queries sem polling agressivo no front, cron backend com intervalo 6/12/24h, contadores de sync, e registro de mensagens processadas por `Gmail_Scanned_Messages`.
- A IA já tinha defesas relevantes: prompt anti-injection, limite de anexos/tamanho, timeout, limpeza de arquivos OpenAI, sinais antifraude, risco de remetente e confidence.

### Problemas encontrados nesta rodada

- `PayableImportModal` criava conta automaticamente após analisar arquivo selecionado. Isso violava a regra de não transformar comprovante/importação incerta em conta sem confirmação explícita.
- Sugestões Gmail com `senderRisk=ALTO` ainda ficavam na lista operacional principal, com um botão de override no próprio card. Isso misturava auditoria/quarentena com fluxo normal.
- Confiança abaixo de 80% ainda era tratada como sugestão utilizável na lista principal em alguns casos; o threshold operacional estava em 55%.
- A chamada OpenAI ainda dependia principalmente de "retorne JSON" por prompt. O sanitizador ajudava, mas faltava `text.format` com JSON Schema estrito no Responses API.
- A deduplicação forte existe no front e em helpers, mas o backend ainda precisa de uma camada dedicada para idempotency keys por payload/hash/conta e auditoria de confirmação de duplicidade.

### Patch aplicado localmente

- `src/services/domain/payables.ts`: adicionada classificação única de sugestão Gmail em `main`, `receipt`, `review`, `duplicate` e `quarantine`.
- `src/components/payables/PayableEmailSuggestions.tsx`: sugestões de alto risco saem da lista principal e aparecem em quarentena; confidence < 80 vai para revisão com confirmação; duplicidade provável não recria automaticamente.
- `src/components/payables/PayableImportModal.tsx`: importação agora analisa e mostra rascunho; criação exige clique explícito; comprovante e duplicidade pedem confirmação extra.
- `supabase/functions/gmail-scan-payables/index.ts` e `supabase/functions/analisar-conta-pagar/index.ts`: chamadas OpenAI agora usam `text.format` com `json_schema` e `strict: true`.
- `src/test/payable-match-classification.test.ts`: cobertura para quarentena, revisão por confiança, comprovante e duplicidade.

### Pendências de produção

- Criar migration de auditoria/idempotência de sugestões com campos dedicados para `document_type`, `recommended_action`, `evidence`, `payload_hash`, `attachment_hash`, `created_from_receipt`, confirmação de duplicidade e confirmação de comprovante.
- Mover a comparação de duplicidade/recorrência para RPC/Edge Function, usando histórico real da empresa, não apenas estado carregado no front.
- Adicionar lock transacional por conexão Gmail para impedir duas sincronizações simultâneas do mesmo usuário.
- Implementar ação server-side de vincular comprovante a conta existente, em vez de obrigar criação nova.
- Adicionar testes de integração específicos para reprocessamento do mesmo `message_id`, rate limit Gmail, token inválido, lock concorrente e tenant isolation de sugestões/quarentena.

## 12. Atualização técnica — Gmail e modelo de IA — 2026-06-10

- `gmail-scan-payables` e `analisar-conta-pagar` agora usam `OPENAI_PAYABLE_MODEL` (ou `OPENAI_MODEL`) com padrão `gpt-5.5`; `OPENAI_PAYABLE_REASONING_EFFORT` permite ajustar esforço (`low` por padrão).
- Token Google revogado/expirado ou permissão Gmail ausente agora marca a conexão como `DISCONNECTED`, desativa sync automático e exige reconexão, em vez de manter tentativas silenciosas com erro repetido.
- O scan passa a reaproveitar `last_sync_at` com sobreposição de 24h e queries ampliadas para 180d/120d, reduzindo desatualização por falhas temporárias ou e-mails que chegaram perto da última janela.
- "Duplicata" foi tratada como tipo de documento, não como nome de conta. Título genérico sozinho é substituído por fornecedor/documento/vencimento/parcela.
- Parcela só é assumida quando há evidência explícita (`parcela X/Y`, `X de Y`, `prestação`). Se parecer duplicidade ou houver dúvida entre parcela e conta repetida, a IA deve marcar como `INCERTO`/revisão e avisar.
