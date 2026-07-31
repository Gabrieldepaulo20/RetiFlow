# Assistente Financeiro no WhatsApp

## Objetivo

O `whatsapp-financeiro` é um assistente privado e estritamente somente leitura para a dona da
Retífica Premium. Ele responde perguntas em texto sobre:

- Dashboard e suas métricas;
- Financeiro, caixa e competência;
- Contas a Pagar, inclusive contas de funcionários/salários;
- notas de serviço e O.S.

Ele não cadastra, altera, corrige, paga, estorna, exclui, reclassifica, envia documentos nem executa
qualquer outra ação de negócio. Pedidos desse tipo recebem uma recusa fixa.

## Como a precisão é protegida

1. O número remetente precisa estar na allowlist `WHATSAPP_ALLOWED_NUMBERS`.
2. Todo POST precisa ter a assinatura oficial da Meta validada com
   `WHATSAPP_APP_SECRET`.
3. O identificador do número do webhook precisa coincidir com
   `WHATSAPP_PHONE_NUMBER_ID`.
4. O proprietário dos dados é fixado no servidor por `WHATSAPP_FINANCE_OWNER_ID`; o usuário não
   consegue escolher outra empresa na mensagem.
5. A OpenAI recebe somente a pergunta e devolve um tipo de consulta dentro de enums fechados.
6. Nenhuma `tool` é oferecida ao modelo.
7. Os números não são escritos pelo modelo. Eles vêm da mesma
   `financeiro_resumo_usuario` usada pelo painel ou de consultas fixas de leitura e são formatados
   deterministicamente pelo servidor.
8. Se a pergunta ou o período não forem seguros, o assistente pede esclarecimento ou informa que
   não consegue confirmar.
9. A resposta informa período e horário da consulta.
10. O teste `whatsapp-finance-assistant.test.ts` falha se uma operação de escrita ou uma tool da
    OpenAI for acrescentada à Function.

As consultas de O.S. não devolvem nome, telefone, documento ou endereço do cliente.

## Modelo e custo

O padrão é `gpt-5.6-luna` com raciocínio `low`. O modelo é usado apenas para classificar a intenção,
o período e o filtro da pergunta. Os cálculos e a redação dos valores ficam no Retiflow.

A mesma `OPENAI_API_KEY` já configurada nas Edge Functions é reutilizada. A chave nunca vai para o
frontend, para o WhatsApp ou para arquivos versionados.

Variáveis opcionais:

- `OPENAI_WHATSAPP_MODEL` — padrão `gpt-5.6-luna`;
- `OPENAI_WHATSAPP_REASONING_EFFORT` — padrão `low`.

## Segredos e configuração obrigatória

Configurar como secrets da Edge Function, sem colocar valores neste documento ou no Git:

- `OPENAI_API_KEY` — já existente no projeto;
- `SUPABASE_URL` — disponibilizada pelo Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` — somente no servidor;
- `WHATSAPP_FINANCE_OWNER_ID` — UUID do proprietário dos dados da retífica;
- `WHATSAPP_ALLOWED_NUMBERS` — telefones autorizados com DDI, separados por vírgula e apenas dígitos;
- `WHATSAPP_VERIFY_TOKEN` — token criado para validar o webhook;
- `WHATSAPP_APP_SECRET` — App Secret da Meta;
- `WHATSAPP_ACCESS_TOKEN` — token server-side da WhatsApp Cloud API;
- `WHATSAPP_PHONE_NUMBER_ID` — identificador do número na Meta;
- `WHATSAPP_GRAPH_VERSION` — versão ativa da Graph API no formato `vNN.N`.

Nunca enviar esses valores no chat, em issue, log, print ou commit.

## Ativação na Meta

Depois do deploy da Function:

1. Usar como callback:
   `https://dqeoxxokvvcpssajycgq.supabase.co/functions/v1/whatsapp-financeiro`.
2. Informar na Meta o mesmo valor configurado em `WHATSAPP_VERIFY_TOKEN`.
3. Assinar o campo de mensagens da conta do WhatsApp Business.
4. Configurar primeiro apenas o telefone da dona na allowlist.
5. Fazer os testes de aceitação abaixo antes de liberar o uso.

`verify_jwt=false` é intencional porque a Meta não envia JWT do Supabase. A autenticação do webhook
é feita pela assinatura HMAC `x-hub-signature-256`.

## Testes de aceitação

Perguntas que devem funcionar:

- `Quanto entrou e quanto saiu neste mês?`
- `Qual é a diferença entre faturamento e entradas recebidas?`
- `Quais contas estão atrasadas em julho?`
- `Tem algum salário cadastrado neste mês?`
- `Por que as contas repetidas aparecem no total?`
- `Como está o pagamento da O.S. 5905?`
- `Quantas O.S. entraram neste mês?`

Pedidos que devem ser recusados:

- `Pague essa conta.`
- `Corrija o saldo.`
- `Exclua a conta repetida.`
- `Marque a O.S. como paga.`
- `Cadastre um salário.`
- `Execute um comando para ajustar o erro.`

Também validar:

- mensagem de número não autorizado não recebe dado algum;
- assinatura inválida recebe HTTP 401;
- mídia/áudio recebe orientação para usar texto;
- pergunta sem período usa o mês corrente e mostra esse período na resposta;
- período inválido ou maior que um ano é recusado;
- uma falha de consulta nunca informa que algo foi alterado.

## Limites deliberados do piloto

- O assistente é stateless: cada pergunta precisa trazer contexto suficiente.
- O rate limit e a deduplicação em memória são proteção adicional, não armazenamento durável.
- A consulta lista no máximo oito contas por resposta, mas os totais usam todos os registros do
  período dentro do limite seguro.
- Não há migration, tabela de conversa ou escrita de dados de negócio.
- Não há envio de anexos, boletos, PDFs ou comprovantes.
