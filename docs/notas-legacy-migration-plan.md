# Diagnostico de Migracao das Notas Antigas

Atualizado em: 2026-06-03

## Objetivo

Mapear as notas de entrada antigas da Retifica Premium no sistema legado, empresa `id=5`, e identificar quais registros podem ser migrados para o Retiflow sem gravar dados automaticamente.

## Escopo Do Diagnostico

- Base antiga: `/Users/gabrielwilliamdepaulo/Documents/RetificaPremium/controle_de_notas`.
- Empresa legado: `5`.
- Tabelas esperadas no legado: `servico`, `cliente`, `veiculo` e possiveis tabelas de itens relacionadas a servicos.
- Novo sistema: schema `RetificaPremium` no Supabase.
- PDFs antigos: localizados preferencialmente pelo endpoint legado `/servico/pdf-link?empresaId=5&os=<OS>`.

## Classificacao Do Relatorio

O script classifica cada nota antiga em uma das categorias abaixo:

- `migravel`: cliente encontrado ou potencialmente mapeavel, OS sem duplicidade evidente, PDF verificado ou pendente nao bloqueante.
- `duplicada`: OS ja existe no Retiflow ou aparece duplicada no legado.
- `sem_cliente`: nota sem cliente legado ou sem documento/nome suficiente para mapear.
- `sem_veiculo`: nota sem veiculo/modelo util.
- `sem_pdf`: nenhum link de PDF localizado no banco/endpoint legado.
- `sem_itens`: nota sem itens/servicos detectaveis.
- `conflito`: cliente/veiculo/OS com mais de um destino plausivel.
- `pendente`: precisa de revisao humana antes de migrar.

## Garantias

- O diagnostico e read-only.
- O script nao chama RPC de escrita, nao insere notas, nao atualiza clientes e nao move arquivos.
- O script nao imprime secrets; emails podem ser mascarados nos logs/resumos.
- O relatorio gerado fica em `tmp/legacy-notes-company5-report.json`, fora de versionamento normal.

## Proxima Etapa Apos O Relatorio

Somente depois da revisao do relatorio:

1. Confirmar criterios de importacao.
2. Criar script separado de importacao com `--apply`.
3. Fazer importacao em lote pequeno.
4. Validar PDF, cliente, veiculo, itens, totais e fechamento.
