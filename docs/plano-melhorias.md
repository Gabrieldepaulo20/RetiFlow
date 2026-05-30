# Plano de Melhorias — Contas a Pagar, Design e Suporte

Início: 2026-05-30. Ordem de execução aprovada: **todos**, na sequência abaixo.
Cada bloco: implementar → typecheck + testes → commit. Atualizar status aqui ao concluir.

## Sequência e status

| # | Bloco | Status |
|---|-------|--------|
| 1 | A3 — Dedup import × e-mail (chave unificada, auto-dismiss, badge "já cadastrada") | ✅ feito (2026-05-30) |
| 2 | A1 — Pergunta "já paga?" na sugestão vencida | ✅ feito (2026-05-30) |
| 3 | B1+B2 — Redesign denso de sugestões e lista (clean/minimalista) | ✅ feito (2026-05-30) — passo 1, aguarda review visual |
| 4 | B4 — Kanban bonito + drag pelo card inteiro | ⏳ pendente |
| 5 | B3 — Notas legíveis (alto contraste, status forte, animações; cliente idosa) | ⏳ pendente |
| 6 | A2 — Cruzar e-mail "pago" → atualizar sugestão para PAGO (backend) | ⏳ pendente |
| 7 | C1 — Thread de suporte + notificação in-app (resposta do chamado no sistema) | ⏳ pendente |

## Detalhe por bloco

### 1. A3 — Dedup import × e-mail
- Helper único `buildPayableDedupKey` = normalize(fornecedor)+valor+vencimento(+docNumber).
- `findPayableDuplicate(candidate, payables)` reutilizado por import, quickform, accept de sugestão.
- Ao criar conta (qualquer origem): auto-dispensar sugestões PENDING que casam.
- Ao exibir sugestão com conta equivalente: badge "já cadastrada" / não contar como nova.

### 2. A1 — "já paga?" na sugestão
- Reusar `getContextualQuestion` aplicado à EmailSuggestion vencida (cobrança recorrente, mês fechado).
- Pergunta inline no card; ação cria já como PAGO. Rebaixar confiança → seção revisar.

### 3. B1+B2 — Redesign denso
- Card de sugestão vira linha scannável + expand-on-click (sinais/snippet/métricas no expand).
- Lista contas: -20% padding/altura, ações por ícone no hover. Linguagem coesa.

### 4. B4 — Kanban
- Cards arredondados, accent por coluna, placeholder fantasma, scale no drag, animação ao soltar.
- `dragHandleProps` no card inteiro (threshold pra distinguir clique de arraste → abrir detalhe).

### 5. B3 — Notas
- Status: pill grande + ícone + texto (nunca cor só — a11y). Fonte/contraste maiores.
- Animações framer-motion: pulse na mudança de status, slide-in em nota nova.
- Opcional: toggle "modo ampliado".

### 6. A2 — e-mail pago → sugestão (backend)
- Pós-processo no scan: e-mail comprovante casa sugestão/conta pendente (fornecedor+valor±tol+mês) → marca PAGO em vez de duplicar. Edge + RPC.

### 7. C1 — Suporte thread + push
- Tabela `mensagens_chamado` (autor admin/user, texto, data) ligada ao chamado.
- MVP: admin responde no sistema → mensagem na thread → cliente vê + badge notificação (AppLayout notif). Realtime/polling.
- Fase 2: SES inbound → edge faz append (infra maior).
