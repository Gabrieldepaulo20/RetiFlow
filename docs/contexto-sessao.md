# Contexto da Sessão — Retífica Premium (retiflow)

> Atualizado em: 2026-04-19 (fundação de engenharia — sessão 2)  
> Sempre atualizar este arquivo ao final de cada tarefa executada nesta sessão.

---

## Stack do Projeto

- **SPA**: Vite + React 18 + TypeScript — **NÃO é Next.js**
- **Roteamento**: React Router v6 (`src/App.tsx`, `src/routes/routeModules.ts`)
- **UI**: Tailwind CSS + Radix UI (shadcn pattern, 54+ componentes em `src/components/ui/`)
- **Forms**: React Hook Form + Zod
- **Estado**: DataContext (`src/contexts/DataContext.tsx`) + localStorage, sem backend
- **Ícones**: lucide-react
- **Animações**: Framer Motion
- **Toasts**: Sonner / `useToast`
- **Fontes**: Plus Jakarta Sans (headings `.font-display`) + Inter (body)
- **Primary color**: teal `hsl(192,70%,38%)`

---

## Estrutura de Arquivos Relevante

```
src/
  App.tsx                      — rotas principais
  types/index.ts               — TODOS os tipos TypeScript
  contexts/DataContext.tsx      — estado global + ações
  data/seed.ts                 — dados de demonstração
  pages/
    ContasAPagar.tsx           — módulo financeiro (saídas)
    Dashboard.tsx              — dashboard principal
  components/
    payables/
      PayableCreateModal.tsx   — criar conta a pagar
      PayableDetailsModal.tsx  — detalhes + histórico
      PayableImportModal.tsx   — importar com IA
      PayableEmailSuggestions.tsx — sugestões de email (NOVO)
      PayableModalShell.tsx    — wrapper responsive Dialog/Drawer
      PayableQuickForm.tsx     — form rápido reusável
  services/domain/
    payables.ts                — lógica de negócio (calcular, validar, etc.)
docs/
  modulo-contas-a-pagar.md    — planejamento original do módulo
  contexto-sessao.md          — ESTE ARQUIVO
```

---

## Módulos Implementados

| Módulo | Status | Rota |
|--------|--------|------|
| Dashboard | Implementado | `/` |
| Clientes | Implementado | `/clientes` |
| Kanban (Notas) | Implementado | `/kanban` |
| Notas de Entrada | Implementado | `/notas` |
| Faturas | Implementado | `/faturas` |
| Fechamento Mensal | Implementado | `/fechamento` |
| **Contas a Pagar** | **Implementado — em evolução** | `/contas-a-pagar` |
| Analytics do Site | **Planejado** | `/analytics` (a criar) |

---

## Contas a Pagar — Estado Atual

### Tipos de dado relevantes (`src/types/index.ts`)
- `AccountPayable` — conta a pagar
- `PayableCategory` — categorias (peças, aluguel, utilities, etc.)
- `PayableSupplier` — fornecedores
- `PayableAttachment` — anexos (PDF, imagem)
- `PayableHistory` — histórico de eventos
- `EmailSuggestion` — sugestões extraídas de emails **(NOVO 2026-04-19)**

### `AccountPayable` — campos importantes
- `recurrenceParentId` — ID da 1ª conta da série (parcelas/recorrências)
- `recurrenceIndex` — posição na série (ex: 2 para "2/6")
- `totalInstallments` — total de parcelas
- `entrySource` — `MANUAL | IA_IMPORT | CAMERA_CAPTURE | AUTO_SERIES | EMAIL_IMPORT`
- `status` — `PENDENTE | PARCIAL | PAGO | AGENDADO | CANCELADO`
- Status `VENCIDO` é **derivado** (não armazenado) — calculado em runtime

### Status das features do módulo
| Feature | Status |
|---------|--------|
| Listagem com filtros | ✅ OK |
| Cards de resumo | ✅ OK |
| Criar conta (modal) | ✅ OK |
| Ver detalhes (modal) | ✅ OK |
| Registrar pagamento | ✅ OK |
| Edição rápida | ✅ OK |
| Importar com IA (upload/câmera) | ✅ OK |
| Aba "Inserir manualmente" removida do import modal | ✅ **Corrigido 2026-04-19** |
| Animação de fechamento dos popups suavizada | ✅ **Corrigido 2026-04-19** |
| Visualização de parcelas (timeline) | ✅ **Novo 2026-04-19** |
| Aba de Sugestões de Email | ✅ **Novo 2026-04-19** |

---

## Dashboard — Estado Atual

| Seção | Status |
|-------|--------|
| Resumo de notas/OS | ✅ OK |
| Gráficos de status | ✅ OK |
| Contas a pagar resumido | ✅ OK |
| **Fluxo de Caixa (Entrada/Saída)** | ✅ **Novo 2026-04-19** |

### Conceito "Entrada e Saída" (confirmado com cliente)
- **Entrada** = receitas de serviços concluídos/faturados (notas fiscais, invoices)
- **Saída** = despesas pagas (contas a pagar liquidadas)
- **Resultado** = Entrada − Saída = lucro/prejuízo do período

---

## Vulnerabilidades npm — Status

Executado `npm audit fix` em 2026-04-19. Vulnerabilidades corrigidas automaticamente:
- `react-router-dom` (XSS via Open Redirects — **high**)
- `ajv` (ReDoS)
- `brace-expansion` (DoS)
- `esbuild`/`vite` (dev server exposure — moderate)
- `flatted` (prototype pollution — high)

Pendente (requer `--force` — breaking change de devDep):
- `@tootallnate/once` → jsdom v29. Risco baixo (dev only). A resolver em atualização separada.

---

## Módulo Analytics do Site — Planejamento

### Objetivo
Painel para a cliente acompanhar o crescimento do site e campanhas de marketing.

### Investigação: Clarity vs GA vs Meta

| Fonte | API Disponível | Dados Oferecidos | Adequado para SPA sem backend |
|-------|---------------|-----------------|-------------------------------|
| **Google Analytics 4** | ✅ GA4 Data API | Sessões, usuários, páginas, conversões, origem | Requer proxy backend para OAuth |
| **Microsoft Clarity** | ❌ Sem API pública | Heatmaps, gravações, cliques | Apenas iframe ou embed |
| **Meta Ads** | ✅ Marketing API | Gasto, alcance, cliques, conversões por campanha | Requer OAuth + App Review |

### Recomendação técnica
- **Fase 1 (MVP)**: Embed do Google Analytics via iframe + GA gtag events (sem backend)
- **Fase 2**: Backend leve (Supabase Edge Function) para proxy da GA4 Data API e exibir dados programaticamente
- **Fase 3**: Meta Ads API via OAuth para campanhas (ético — são dados da própria empresa)
- **Clarity**: Usar apenas o script de tracking, não como source de dados no painel

### Estrutura planejada do módulo
```
/analytics
  ├── Tab: Visão Geral (sessões, usuários únicos, bounce rate, top páginas)
  ├── Tab: Crescimento (gráfico mensal de usuários/sessões)
  ├── Tab: Campanhas (Meta Ads — gastos, alcance, CPC, ROAS)
  └── Tab: Comportamento (top páginas, origem do tráfego)
```

### Status
- [ ] Criar rota `/analytics`
- [ ] Criar página `src/pages/Analytics.tsx`
- [ ] Adicionar ao sidebar nav
- [ ] Fase 1: placeholder data + embed preparado
- [ ] Fase 2+: backend proxy

---

## Bugs Corrigidos Nesta Sessão (2026-04-19)

1. **Vulnerabilidades npm**: `npm audit fix` executado
2. **Import modal — aba manual removida**: `PayableImportModal.tsx` — removida TabsTrigger e TabsContent "manual"; grid mudou de 3 para 2 colunas
3. **Animação de fechamento dos popups**: `ContasAPagar.tsx` — `closeDialog()` com delay de 250ms antes de limpar estado dos campos, evitando flash de conteúdo durante animação de saída
4. **Visualização de parcelas**: `PayableDetailsModal.tsx` — timeline de parcelas quando `totalInstallments > 1`
5. **Email suggestions tab**: novo tipo `EmailSuggestion`, seed data, DataContext e componente `PayableEmailSuggestions.tsx`

---

## Fundação de Engenharia — Status (2026-04-19 sessão 2)

| Fase | Descrição | Status |
|------|-----------|--------|
| F1 Persistência | DataContext grava em `retiflow:v1:data` com debounce 400ms + fallback para seed | ✅ Implementado |
| F2 Auth isolation | `VITE_AUTH_MODE=mock/real` + factory `getAuthProvider()` + guard em produção | ✅ Implementado |
| F3 API layer | `src/api/client.ts` + schemas Zod + `endpoints/brazilian.ts`; CEP/CNPJ migrados | ✅ Implementado |
| F4 ErrorBoundaries | Dashboard (3 seções), Kanban (board), ContasAPagar (2 blocos) | ✅ Implementado |
| F5 Features barrel | `src/features/payables/index.ts` — porta pública sem mover arquivos | ✅ Implementado |

**Validação:** 170 testes passando, `tsc --noEmit` zerado, `npm run build` limpo.

**Ponto de validação manual recomendado:**
1. Abrir sistema → criar conta a pagar → F5 → conta deve continuar lá
2. Fazer login → F5 → sessão mantida (já funcionava)
3. Buscar CEP no formulário de cliente → deve continuar funcionando

## Próximos Passos

1. **Módulo Analytics** — implementar após aprovação do plano acima
2. **Fluxo de Caixa completo** — relatório mensal com comparativo Entrada vs Saída
3. **Relatório anual** — gráfico de resultado mês a mês no ano (para "quanto lucrei no ano")
4. **Entrada e Saída no Dashboard** — KPIs de caixa já adicionados
5. **Backend futuro** — Supabase para persistência real, GA4 API proxy, Meta Ads API

---

## Perguntas Abertas / A Confirmar com Cliente

- [ ] Parcelas: quer ver todas as parcelas de um financiamento no detail modal?
- [ ] Relatório anual: prefere gráfico de barras ou linha para comparar meses?
- [ ] Analytics: tem Google Analytics instalado no site da retífica? Qual a URL do site?
- [ ] Meta Ads: tem conta de anúncios ativa? Quer conectar via OAuth ou prefere ver só dashboards básicos?
- [ ] Entrada e Saída: confirmar se entrada = faturamento de serviços (notas fiscais emitidas)
