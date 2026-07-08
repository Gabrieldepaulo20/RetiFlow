# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Read `AGENTS.md` and `docs/contexto-sessao.md` before any change. `AGENTS.md` is the
> authoritative rulebook (security, DB, "never do without authorization"); this file is the
> architecture orientation. When the two overlap, `AGENTS.md` wins.

## What this is

RetiFlow — workflow platform for engine-head repair shops ("retífica"). Vite + React 18 + TypeScript
SPA (NOT Next.js). Backend is Supabase: Auth, RPCs in the `RetificaPremium` schema, Storage, and Edge
Functions. UI language is Portuguese (pt-BR); routes and domain terms are Portuguese.

## Commands

```bash
npm run dev              # local dev server (Vite, port 8080)
npm run build            # production build
npm run build:dev        # development-mode build
npm run preview          # preview local build
npm run typecheck        # typecheck real (tsc -p tsconfig.app.json — mesmo gate do Amplify)
                         # NÃO use `npx tsc --noEmit`: o tsconfig raiz é solution-style
                         # (files: []) e esse comando passa sem checar arquivo nenhum
npm run lint             # eslint
npm test -- --run        # unit tests (vitest, single run)
npm run test:watch       # unit tests in watch mode
npm run test:integration # integration tests (needs .env.integration; skips cleanly if absent)
npm run test:all         # unit + integration
npm run test:e2e         # Playwright e2e (e2e/)

# Security scans (run before security-sensitive changes)
gitleaks detect --source . --redact=100          # scan git history
gitleaks detect --source . --no-git --redact=100 # scan working tree
```

Run a single unit test: `npm test -- --run src/path/to/file.test.ts` (add `-t "name"` to filter).

**Required before delivering a normal change:** `npm run typecheck` → `npm run lint` → `npm test -- --run` → `npm run build`.
If the change touches real Supabase/Storage/RPCs/Functions, also run `npm run test:integration` (or report it was skipped for lack of env).

## Auth modes

`VITE_AUTH_MODE` selects the auth provider: `mock` (local demo, password `demo123`, no backend) or
`real` (Supabase Auth). Copy `.env.example` → `.env.local`. The Supabase **anon** key is safe in the
frontend by design; the **service_role** key must never appear there. Super Admin is enforced
server-side in Edge Functions (`SUPER_ADMIN_EMAILS`); `VITE_SUPER_ADMIN_EMAILS` is UI-only hinting.

## Domain model — notas de entrada (O.S.)

The intake note carries **two independent axes** (do not merge them):

- **Status de fluxo** (`NoteStatus`, 11 values): `ABERTO → EM_ANALISE → ORCAMENTO → APROVADO →
  EM_EXECUCAO → [AGUARDANDO_COMPRA] → PRONTA → ENTREGUE`; alternative finals `RECUSADO` (cliente
  desistiu, fatura o banho químico) and `SEM_CONSERTO`; administrative `EXCLUIDA` (soft-delete por
  engano/duplicata — substitui o antigo CANCELADO/DESCARTADO). **FINALIZADO e PRONTO foram removidos**
  (PRONTO→PRONTA; "finalizada/quitada" = ENTREGUE + pago).
- **Status de pagamento** (`NotePaymentStatus`): `PENDENTE | PAGO` + `paidAt` + `paidWith`. Recebimento
  é registrado só no detalhe da nota, em estados **faturáveis** (`BILLABLE_STATUSES` = ENTREGUE,
  RECUSADO, SEM_CONSERTO), via `registrarRecebimentoNota`/`estornarRecebimentoNota` (DataContext).

Receita (competência) = `BILLABLE_STATUSES` (data = `finalizedAt`/entrega). Dashboard mostra
**Faturado / Recebido / A receber**. Fonte única de descrições: `STATUS_DESCRIPTIONS` e
`STATUS_CUSTOMER_LABELS` (em `src/types`) — alimentam o glossário (Configurações → Status & Fluxo) e
o futuro chatbot. O adapter `supabaseToIntakeNote` traduz status legados do banco
(`Pronto→PRONTA`, `Finalizado→ENTREGUE`, `Cancelado/Descartado→EXCLUIDA`).

**Contato** da nota (`contatoNome`/`contatoTelefone`) é o funcionário responsável, distinto da empresa
cliente; alimenta o WhatsApp. **Salário de funcionário** é despesa em **Contas a Pagar** (categoria Mão
de Obra + recorrência MENSAL), não em recebíveis; não há módulo de Contas a Receber.

**Contas a Pagar — favorecido:** coluna `favorecido_tipo` em `Contas_Pagar` com valores `FORNECEDOR`
(padrão) ou `FUNCIONARIO`. Todos os RPCs (`insert_conta_pagar`, `update_conta_pagar`, `get_contas_pagar`,
`get_conta_pagar_detalhes` e variantes `*_contexto_suporte`) incluem esse campo. Ao escolher
`FUNCIONARIO`, o formulário sugere categoria "Mão de Obra".

## Architecture

**Data access is layered — components do not touch Supabase tables directly.**

- `src/lib/supabase.ts` — single Supabase client (anon key from `import.meta.env`).
- `src/api/supabase/*` — one module per domain (`clientes`, `contas-pagar`, `notas`, `fornecedores`,
  `dashboard`, `fechamentos`, `admin-users`, `gmail-payables`, `support`, …). All RPC calls go through
  here. `_base.ts` wraps every RPC in the standard `RPCEnvelope<T>` (`{ status, mensagem, total, dados }`).
- `src/services/domain/*` — business logic kept out of components (e.g. `intakeNotes`, `payables`,
  `monthlyClosing`, `gmailSuggestions`). `src/services/auth/*` and `src/services/storage/*` hold auth
  and persistence helpers.
- `src/contexts/` — `AuthContext` (session, permissions, module access, MFA, support impersonation) and
  `DataContext` (large legacy hub for multiple flows). **Do not rewrite `DataContext.tsx` wholesale** —
  it is being migrated incrementally; prefer pulling logic into `services/` and `api/`.
  DataContext exports three scoped hooks — **use the narrowest one**:
  - `useOperationalData()` — notas + clientes (use on note/customer pages)
  - `usePayablesData()` — contas a pagar (use on payables pages)
  - `useData()` — full context (legacy; use only when the above don't cover the need)
- `src/hooks/` — TanStack Query hooks (`useOperationalQueries`, `useNotesData`, `useCustomersData`, …).
- `src/pages/` + `src/features/payables/` — screens. `src/components/` has shadcn/Radix UI primitives.

**Support / impersonation:** when an authorized support session is active, `_base.ts` transparently
remaps some read/write RPCs to `*_contexto_suporte` variants and blocks a set of sensitive writes
(`SUPPORT_BLOCKED_WRITE_RPCS`). Keep that mapping in sync when adding RPCs that support mode should reach.

**Routing & code-splitting:** `src/App.tsx` defines routes; every page is `React.lazy` via
`src/routes/routeModules.ts` (which also drives route prefetching). Layouts: `AppLayout` (main app),
`AdminLayout` (admin area). `ProtectedRoute` guards UX/navigation only — it is **not** a security
barrier; real authorization lives in RLS, RPCs, policies, and Edge Functions.

**Edge Functions** (`supabase/functions/`): `admin-users` (Auth Admin / invites / resets — must
re-validate the user server-side), `analisar-conta-pagar` (AI/OCR for payables), `dashboard-resumo`,
`marketing-*`, `support-*`, and the `gmail-*` OAuth + payable-scan pipeline. Migrations live in
`supabase/migrations/` (38+ applied).

**PDF generation:** use `src/lib/printPdf.ts` as the single helper for printing/preview. For saved
notes/closings with `pdf_url`, generate a signed URL; for unsaved, create a temporary blob. Never open
PDFs in a new tab as the primary action — embed in a modal first.

**One-off scripts** (migrations, imports, cleanups) go in `scripts/oneoff/`. Always implement dry-run
mode by default; require `--apply` for real writes. Storage paths follow the convention:
`retifica-premium/ano/mes-por-extenso/dia (dia-da-semana)/...` with months and weekdays in Portuguese
without accents (e.g. `marco`, `Terca-feira`).

## Performance constraints (from AGENTS.md)

Manual chunks are defined in `vite.config.ts` (`react-vendor`, `charts-vendor`, `motion-vendor`,
`kanban-vendor`, …). Keep heavy deps lazy: `xlsx` only via `import('xlsx')` in import/export flows;
`recharts` only on chart screens; `@react-pdf/renderer` only when generating/printing PDFs. Do not raise
`chunkSizeWarningLimit` to silence warnings — investigate static imports first.

## Hard rules (see AGENTS.md for the full list)

- Never put the service_role key in the frontend; never call Supabase Auth Admin API from the browser.
- Never run destructive git (`reset --hard`, discarding checkouts) or destructive migrations without an
  approved plan + rollback. Never loosen RLS/policies/bucket privacy without a compatibility plan.
- Buckets `contas-pagar`, `fechamentos`, `notas` stay private; serve via signed URLs with expiry.
- "Nota Fiscal" was removed from v1 — do not recreate its route/menu/flow without explicit authorization.
- If something is partial, local, mock, or out of v1 scope, the UI must say so — no deceptive fallbacks.
- Run Gitleaks before security-sensitive changes; never paste real secrets into chat.
