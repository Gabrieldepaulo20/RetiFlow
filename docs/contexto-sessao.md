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
- Previews principais de nota e fechamento devem abrir PDF real em nova aba, priorizando fidelidade visual.

## Pendencias De Validacao Manual

- Rodar o script de diagnostico legado quando as credenciais locais estiverem disponiveis:
  - `node scripts/oneoff/analyze-legacy-notes-company5.mjs`
- Revisar o relatorio gerado em `tmp/legacy-notes-company5-report.json` antes de qualquer importacao real.
