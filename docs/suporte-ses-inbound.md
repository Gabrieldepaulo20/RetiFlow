# Suporte por e-mail com SES inbound

Este runbook habilita o retorno das respostas enviadas pelo suporte por e-mail para o chamado correspondente no Retiflow.

## Arquitetura

1. O cliente abre um chamado pelo Retiflow.
2. A Edge Function `support-ticket` envia o e-mail pelo SES com `Reply-To` no formato `reply+<id-do-chamado>@<SES_INBOUND_DOMAIN>`.
3. O suporte responde ao e-mail recebido.
4. O SES inbound recebe a resposta, publica no SNS e o SNS chama a Edge Function pública `support-inbound`.
5. A Function valida a assinatura SNS e o `TopicArn`, extrai a nova mensagem e registra a resposta no chamado.
6. O cliente vê a resposta e o badge de notificação no Retiflow.

Sem `SES_INBOUND_DOMAIN`, o envio mantém o comportamento anterior e usa o e-mail de suporte configurado como `Reply-To`.

## Configuração AWS

1. Confirme a região do SES inbound. O recebimento está disponível apenas em `us-east-1`, `us-west-2` e `eu-west-1`.
2. Verifique no SES uma identidade de domínio dedicada para recebimento, por exemplo `inbox.seudominio.com.br`.
3. No DNS, crie um registro MX com prioridade `10` apontando para `inbound-smtp.<regiao>.amazonaws.com`.
4. Crie um tópico SNS para respostas de suporte.
5. Em SES `Email receiving`, crie ou ative um receipt rule set.
6. Adicione uma regra para o domínio inbound e configure a ação SNS. Se a mensagem for armazenada antes no S3, configure também a ação S3.
7. No SNS, crie uma subscription HTTPS apontando para:

   ```text
   https://<project-ref>.supabase.co/functions/v1/support-inbound
   ```

8. A confirmação da subscription é processada automaticamente pela Function após validação da assinatura SNS.

## Secrets das Edge Functions

Configure sem versionar ou colar valores reais em arquivos:

```text
SES_INBOUND_DOMAIN
SES_INBOUND_TOPIC_ARN
SES_INBOUND_BUCKET        # apenas se a regra usar S3
SES_INBOUND_OBJECT_PREFIX # opcional, se a regra S3 usar prefixo
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SUPABASE_SERVICE_ROLE_KEY
```

As credenciais AWS precisam permitir leitura do bucket inbound quando a regra usar S3.

## Banco

O histórico remoto tem drift conhecido. Não execute `supabase db push` nem `migration repair`.

Abra o SQL Editor do Dashboard Supabase e aplique manualmente:

```text
supabase/migrations/20260601120000_support_ticket_replies.sql
```

## Deploy

Depois de configurar secrets e aplicar a migration:

```bash
supabase functions deploy support-ticket
supabase functions deploy support-inbound --no-verify-jwt
```

## Validação ponta a ponta

1. Abra um chamado com uma conta cliente.
2. Confirme que o suporte recebeu a mensagem.
3. Responda ao e-mail recebido.
4. Aguarde a entrega do SES/SNS.
5. Entre novamente como cliente ou aguarde até um minuto com o sistema aberto.
6. Confirme o badge no sino e em `Sugestões / Chamado`.
7. Abra o diálogo e valide o bloco `Resposta do suporte`.
8. Feche e abra novamente para confirmar que o badge foi zerado.
