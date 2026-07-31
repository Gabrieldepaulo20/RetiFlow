# Central Financeiro — reconciliação pré-migração

Data da leitura: 30/07/2026 (revalidada imediatamente antes da migração)
Data de corte do caixa confiável: 01/06/2026
Escopo: tenant operacional da Retífica Premium

## Resumo verificado

| Origem | Quantidade | Valor |
| --- | ---: | ---: |
| Fechamentos pagos | 9 | R$ 26.878,00 |
| O.S. vinculadas aos fechamentos pagos, pelo valor atual | 36 | R$ 29.980,00 |
| O.S. pagas independentes após o corte | 13 | R$ 13.920,00 |
| O.S. pagas independentes anteriores ao corte | 760 | R$ 793.227,00 |
| O.S. pagas sem data efetiva | 97 | R$ 111.575,00 |
| Contas pagas após o corte | 43 | R$ 25.566,76 |

## Divergência dos fechamentos

A diferença de R$ 3.102,00 entre o valor atual das O.S. vinculadas e o valor
líquido dos fechamentos pagos não pode ser importada como dinheiro:

- R$ 356,00 estão documentados nos snapshots imutáveis como desconto.
- R$ 2.746,00 são diferença entre os totais atuais das O.S. e os totais
  congelados nos fechamentos; tratam-se de alteração histórica ou
  inconsistência a revisar.
- Os snapshots ainda registram R$ 1.500,00 em O.S. recebidas antes da cobrança
  agrupada. Esses valores ficam fora da entrada do fechamento e só podem entrar
  como movimentos independentes quando houver data e vínculo inequívocos.

Por isso, o backfill usa `Fechamentos.valor_total` como única entrada dos
fechamentos pagos. As O.S. filhas aparecem somente como detalhamento.

## Regra de qualidade do backfill

- `CONFIRMADO`: data efetiva em ou após 01/06/2026; entra no saldo real.
- `ESTIMADO`: data anterior ao corte; aparece apenas como histórico.
- `REVISAR`: registro pago sem data efetiva; não entra no saldo.

O saldo inicial não foi inferido. Até ser informado e confirmado pela cliente,
a interface deve chamar o número de `Resultado do período`, não de saldo
bancário/caixa real.

## Consultas de aceite

Depois da migração:

1. A soma confirmada de fechamentos no razão deve ser R$ 26.878,00.
2. Nenhuma das 36 O.S. filhas pode gerar uma segunda entrada por causa da
   cascata do fechamento.
3. As 97 O.S. sem data devem permanecer em `Revisar`.
4. As 43 contas pagas após o corte devem totalizar R$ 25.566,76 no backfill
   consolidado.
5. A soma de transferências deve ser zero no consolidado.
