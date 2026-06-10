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

## Execucao Real - 2026-06-03

- Script de importacao criado: `scripts/oneoff/import-legacy-notes-company5.mjs`.
- Modo padrao do script: dry-run, sem gravar dados.
- Modo de escrita: `--apply`.
- Criterios aplicados:
  - importar apenas empresa legado `id=5`;
  - importar apenas notas nao excluidas no legado;
  - pular OS duplicada no legado;
  - pular OS ja existente no Retiflow;
  - exigir cliente ja existente na conta Retifica Premium por documento;
  - exigir veiculo e ao menos uma linha de servico;
  - preservar link de PDF legado em `pdf_url`.
- Resultado da execucao com `--apply`:
  - 880 notas inseridas;
  - 1.919 itens vinculados;
  - 7 notas excluidas no legado ignoradas;
  - 4 notas com OS duplicada deixadas pendentes;
  - 0 falhas.
- Validacao read-only posterior:
  - conta Retifica Premium com 158 clientes;
  - conta Retifica Premium com 880 notas;
  - 1.919 linhas em `Rel_NotaS_Serv` para essas notas;
  - 880 notas com PDF legado referenciado.

## Migracao Dos PDFs Para Storage - 2026-06-03

- Script criado: `scripts/oneoff/migrate-legacy-note-pdfs-to-storage.mjs`.
- Modo padrao: dry-run, baixa e valida os PDFs legados sem gravar.
- Modo de escrita: `--apply`.
- Modo de validacao posterior: `--verify-existing`.
- Estrutura dos arquivos no bucket privado `notas`:
  - estrutura inicial usada na importacao: `auth_id/legacy/company-5/ano/mes/OS-<numero>-<nota>.pdf`
- Resultado da execucao:
  - 880 PDFs baixados do S3 legado;
  - 880 PDFs enviados ao Storage do Supabase;
  - 880 notas atualizadas para apontar para paths internos;
  - 0 referencias externas restantes para esses PDFs;
  - 0 objetos faltando;
  - 0 objetos com owner incorreto;
  - 880 PDFs validados por signed URL/download.

## Normalizacao posterior

- Em 2026-06-10, os paths da Retifica Premium foram normalizados para remover `legacy` do caminho visual.
- Padrao atual das notas no bucket privado `notas`:
  - `retifica-premium/ano/mes-por-extenso/dia/OS-<numero>.pdf`
- Exemplo:
  - `retifica-premium/2026/junho/05/OS-5776.pdf`
- O campo `pdf_formato` das notas normalizadas passou a ser `supabase_storage`.
