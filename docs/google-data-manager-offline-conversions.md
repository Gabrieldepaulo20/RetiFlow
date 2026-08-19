# Conversões offline — Google Ads Data Manager API v1

## Estado preparado

`marketing-offline-conversions` usa o endpoint server-side
`POST https://datamanager.googleapis.com/v1/events:ingest`. Existem dois fluxos
deliberadamente separados:

- com `validateOnly=true`, um HTTP 200 entra no hold técnico
  `request_validation_only`, mesmo que a resposta não traga `requestId`. Nada é
  ingerido, a linha nunca vira `uploaded` e
  `GET https://datamanager.googleapis.com/v1/requestStatus:retrieve` não é
  chamado, pois a API não disponibiliza diagnostics para validações;
- no envio real, o HTTP 200 precisa trazer `requestId`. A linha fica em
  `processing/awaiting_diagnostics` e só vira `uploaded` depois de `SUCCESS` ou
  da confirmação idempotente de transação duplicada. Como o uploader envia um
  evento por request, `SUCCESS` só é conclusivo com `recordCount = 1`; contagem
  ausente, zero ou diferente de um vai para quarentena como diagnóstico
  inconsistente.

O primeiro diagnostics real é agendado para aproximadamente 30 minutos depois
da ingestão. Os próximos polls usam fator 1,3, jitter pequeno, teto de 60
minutos e prazo total de 24 horas. `next_attempt_at` e
`google_result.nextDiagnosticAt` guardam o agendamento; `processing_started_at`
fica nulo enquanto o `requestId` aguarda diagnostics, impedindo que o RPC legado
o reserve novamente pela regra de lease vencido em 15 minutos.

A função está desabilitada por padrão (`GOOGLE_DATA_MANAGER_ENABLED=false`) e
usa `GOOGLE_DATA_MANAGER_VALIDATE_ONLY=true` por padrão. O hold usa o código
`DATA_MANAGER_REQUEST_VALIDATION_ONLY` e só é rearmado quando a configuração
muda explicitamente para envio real. Enquanto desabilitada, a rota autorizada
responde HTTP 503 com `state=inactive`, evitando que o cron registre uma falsa
execução bem-sucedida sem consumir a fila.

Todos os marcos preparados usam `eventSource=WEB`. Essa é uma inferência
conservadora: o marco nasce no fluxo web do Retiflow e o enum v1 só oferece
`WEB`, `APP`, `IN_STORE` e `PHONE`; `IN_STORE` significaria uma transação
presencial em loja, que não foi comprovada para orçamento ou aprovação.

## Configuração externa pendente

Nenhuma credencial é versionada. Antes de um teste controlado são necessários:

- projeto Google Cloud com Data Manager API habilitada;
- OAuth com escopo `https://www.googleapis.com/auth/datamanager`;
- conta de login com escrita na conta operacional do Google Ads;
- uma ação `UPLOAD_CLICKS` para cada marco que será ativado;
- confirmação de base legal e consentimento antes de habilitar dados fornecidos
  pelo usuário.

Secrets esperados:

- `GOOGLE_DATA_MANAGER_ENABLED` (`false` por padrão);
- `GOOGLE_DATA_MANAGER_VALIDATE_ONLY` (`true` por padrão);
- `GOOGLE_DATA_MANAGER_PROJECT_ID`;
- `GOOGLE_DATA_MANAGER_CLIENT_ID`;
- `GOOGLE_DATA_MANAGER_CLIENT_SECRET`;
- `GOOGLE_DATA_MANAGER_REFRESH_TOKEN`;
- `GOOGLE_DATA_MANAGER_LOGIN_CUSTOMER_ID`;
- `GOOGLE_DATA_MANAGER_OPERATING_CUSTOMER_ID`;
- `GOOGLE_DATA_MANAGER_CLIENT_REGISTERED_ACTION_ID`;
- `GOOGLE_DATA_MANAGER_CABECOTE_RECEBIDO_AVALIACAO_ACTION_ID`;
- `GOOGLE_DATA_MANAGER_ORCAMENTO_EMITIDO_ACTION_ID`;
- `GOOGLE_DATA_MANAGER_OS_APROVADA_ACTION_ID`.

## Dependência de migration não executada

O schema atual da fila só aceita `conversion_kind = 'client_registered'`, o
trigger atual só cria esse marco e o RPC de claim não devolve
`conversion_kind`. A função hidrata a linha depois do claim e mantém
compatibilidade com `client_registered`, mas os três novos marcos não podem ser
produzidos até uma migration separada e aprovada:

1. ampliar o `CHECK` para `cabecote_recebido_avaliacao`, `orcamento_emitido` e
   `os_aprovada`;
2. criar outbox/trigger idempotente para as transições reais da O.S.;
3. gerar `order_id` estável por tenant + marco + entidade;
4. devolver `conversion_kind` no RPC de claim;
5. registrar o horário real de cada transição, valor e moeda quando aplicáveis.

Nenhuma migration, RLS, política, permissão ou deploy foi executado nesta
preparação.

## Retry, quarentena e privacidade

- rede, timeout, HTTP 408/429/5xx e códigos transitórios durante **ingestão**
  usam retry limitado (cinco tentativas), backoff, jitter e `Retry-After`;
- rede, timeout ou erro transitório durante **diagnostics** preserva
  `processing`, o mesmo `requestId`, `acceptedAt` e o contador de tentativas de
  ingestão. Apenas agenda outro poll; não reenvia o evento;
- `PROCESSING` e `REQUEST_STATUS_UNKNOWN` seguem o mesmo polling 30 min × 1,3,
  limitado a 60 min;
- `FAILURE`, `FAILED` e `PARTIAL_SUCCESS` são terminais no diagnostics, inclusive
  quando o motivo é `PROCESSING_ERROR_REASON_INTERNAL_ERROR`; não há reingestão;
- falha terminal/permanente ou pedido inconclusivo após 24 horas vai para
  `failed`, a quarentena observável, sem reingestão automática;
- `DUPLICATE_TRANSACTION_ID` é concluído como idempotência reconhecida;
- o uploader envia uma conversão por request para isolar o modelo fast-fail;
- OAuth, ingestão e diagnostics têm timeout local com `AbortSignal.timeout`;
- logs contêm apenas contagens e códigos técnicos, nunca payload, click ID,
  hash ou PII;
- dados fornecidos pelo usuário permanecem desabilitados no handler. O helper
  só normaliza e envia hashes se houver opt-in explícito e consentimento
  `CONSENT_GRANTED`.
- o builder reaplica o sanitizer canônico ao `click_id` vindo da fila e falha
  fechado para e-mail, telefone-shaped, charset ou tamanho inválido, inclusive
  em registros legados.

## Isolamento obrigatório da entrega

Esta preparação **não deve ser implantada agora**. A substituição local do
entrypoint legado fica isolada em um futuro commit B, separado do contrato e do
painel (commit A). O commit B deve conter somente:

- `supabase/functions/marketing-offline-conversions/index.ts`;
- `supabase/functions/marketing-offline-conversions/data-manager-handler.ts`;
- `supabase/functions/_shared/google-data-manager.ts`;
- `src/test/google-data-manager.test.ts`;
- este documento.

O commit B não pode ser deployado antes da migration/outbox, das actions, do
OAuth/escopo, do teste em QA isolado e da aprovação operacional. Nenhum deploy
foi feito nesta preparação; portanto, a função de produção permanece na versão
já implantada. Se esse código local fosse implantado ainda com
`GOOGLE_DATA_MANAGER_ENABLED=false`, responderia 503 e não consumiria a fila —
esse gate é proteção, não autorização de release.

O commit B depende do corpus e do helper canônico já revisados no commit A:
`contracts/marketing-events-v3.json` e
`supabase/functions/_shared/marketing-event-contract.ts`. O bundle futuro da
Edge precisa incluir essa versão exata, pois o builder reaplica dali o sanitizer
de click ID antes de qualquer chamada ao Google.

## Ativação segura futura

1. aplicar e validar a migration em projeto QA isolado;
2. configurar credenciais/actions sem alterar metas ou lances;
3. habilitar a função com `validateOnly=true` e confirmar o hold
   `request_validation_only`; diagnostics não existe nessa modalidade;
4. corrigir qualquer erro síncrono de validação antes de prosseguir;
5. ativar envio real em lote mínimo, aguardar o primeiro poll e confirmar
   `SUCCESS` no diagnostics;
6. só depois considerar uma mudança de conversão primária no Google Ads.

Rollback futuro de código: restaurar a versão anterior da Edge Function.
Rollback de configuração: definir `GOOGLE_DATA_MANAGER_ENABLED=false`; isso
impede novos claims sem apagar a fila nem o histórico de diagnóstico, mas passa
a responder 503/inactive para tornar a pausa visível ao cron.
