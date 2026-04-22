# Contexto da Sessão — Retífica Premium (retiflow)

> Atualizado em: 2026-04-21 (sessão 4 — Supabase Notas + melhorias UX)  
> Sempre atualizar este arquivo ao final de cada tarefa executada nesta sessão.

---

## Stack do Projeto

- **SPA**: Vite + React 18 + TypeScript — **NÃO é Next.js**
- **Roteamento**: React Router v6 (`src/App.tsx`, `src/routes/routeModules.ts`)
- **UI**: Tailwind CSS + Radix UI (shadcn pattern, `src/components/ui/`)
- **Estado**: DataContext (`src/contexts/DataContext.tsx`) + localStorage + Supabase (modo real)
- **Auth**: `VITE_AUTH_MODE=real` → Supabase Auth; `development` → mock
- **Supabase**: schema `RetificaPremium`, todos os RPCs via `.schema('RetificaPremium').rpc()`
- **Ícones**: lucide-react
- **Primary color**: teal `hsl(192,70%,38%)`

---

## Estrutura de Arquivos Relevante

```
src/
  App.tsx
  types/index.ts                  — TODOS os tipos TypeScript
  contexts/DataContext.tsx         — estado global + ações (localStorage + Supabase)
  api/supabase/
    _base.ts                      — callRPC() gateway
    notas.ts                      — RPCs de notas + adaptadores
    clientes.ts                   — RPCs de clientes
  services/domain/
    customers.ts                  — buildCustomerAddressLabel, etc.
    payables.ts                   — lógica contas a pagar
  pages/
    Notes.tsx                     — listagem de notas
    Clients.tsx                   — listagem de clientes
    ContasAPagar.tsx              — módulo financeiro
    Dashboard.tsx
  components/
    notes/
      NoteFormCore.tsx            — formulário principal de OS (modal + página)
      NoteFormModal.tsx           — wrapper Dialog para NoteFormCore
    clients/
      ClientFormCore.tsx          — formulário de cliente com validação CPF/CNPJ
      ClientFormModal.tsx         — wrapper Dialog para ClientFormCore
      ClientDetailModal.tsx       — modal de detalhes do cliente
    payables/                     — módulo completo de contas a pagar
  data/seed.ts                    — dados de demonstração (dev mode)
docs/
  contexto-sessao.md              — ESTE ARQUIVO
```

---

## Módulos Implementados

| Módulo | Status | Rota |
|--------|--------|------|
| Dashboard | ✅ OK | `/` |
| Clientes | ✅ OK | `/clientes` |
| Kanban (Notas) | ✅ OK | `/kanban` |
| Notas de Entrada | ✅ OK + Supabase | `/notas` |
| Faturas | ✅ OK | `/faturas` |
| Fechamento Mensal | ✅ OK | `/fechamento` |
| Contas a Pagar | ✅ OK | `/contas-a-pagar` |
| Analytics do Site | Planejado | `/analytics` (a criar) |

---

## Supabase — Arquitetura

### Modo real vs. desenvolvimento
- `VITE_AUTH_MODE=real` ativa toda lógica de Supabase
- `IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real'`
- Em modo real: `clientes` e `notas` vêm do Supabase; `services/products` ficam em localStorage (IDs são UUIDs do Supabase)
- Todos os RPCs são `SECURITY DEFINER` — validam `auth.uid()` no banco

### RPCs de Notas (`src/api/supabase/notas.ts`)
- `get_notas_servico` → lista notas do usuário
- `get_status_notas` → lista status para construir mapa
- `nova_nota(p_os, p_cliente_id, p_veiculo_id, p_id_status, p_defeito, p_observacoes, p_prazo, p_itens)` → cria nota + itens
- `update_nota_servico(p_id, p_defeito, p_observacoes, p_prazo, p_km, p_modelo, ...)` → atualiza header
- `update_status_nota(p_id_nota, p_id_status)` → muda status

### Adaptadores
```typescript
// NOME_TO_STATUS: inverso de STATUS_LABELS, mapeado no load do módulo
// buildStatusIdMap(statuses) → Map<NoteStatus, number>
// supabaseToIntakeNote(row) → IntakeNote
```

### statusDbIdRef
```typescript
statusDbIdRef = useRef<Map<NoteStatus, number>>(new Map())
// Carregado no mount em modo real via get_status_notas
// Usado em updateNoteStatus para enviar o id correto ao banco
```

---

## IntakeNote — Campos relevantes (`src/types/index.ts`)

```typescript
interface IntakeNote {
  id: string;
  number: string;
  clientId: string;
  status: NoteStatus;
  type: NoteType;
  engineType: string;
  vehicleModel: string;
  plate?: string;
  km?: number;
  complaint: string;       // aba "Defeito" no form
  observations: string;    // aba "Observações" no form
  responsavel?: string;    // NOVO — quem trouxe o veículo (não tem campo no banco ainda)
  deadline?: string;       // prazo de entrega (ISO date)
  totalServices: number;
  totalProducts: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  parentNoteId?: string;
  previousStatus?: NoteStatus;
}
```

> **`responsavel`**: campo frontend-only por enquanto. Banco não tem coluna. Em modo real não persiste após refresh. Para persistir: criar migration com `ALTER TABLE Notas_de_Servico ADD COLUMN responsavel TEXT;` e mapear em `supabaseToIntakeNote` + RPC de update.

---

## NoteFormCore — Formulário de OS (`src/components/notes/NoteFormCore.tsx`)

### Estrutura de seções
| Seção | Conteúdo |
|-------|----------|
| 1 | Dados da O.S. (número, tipo, data, prazo, vínculo com nota pai) |
| 2 | Cliente (busca autocomplete + info card + **campo Responsável/Contato**) |
| 3 | Veículo (modelo, tipo motor, placa, KM) |
| 4 | Serviços/Itens (tabela editável) |
| 5 | **Defeito / Observações** (tabs: Defeito \| Observações) |

### Validações implementadas
- **CPF/CNPJ**: algoritmo dígito verificador em `ClientFormCore.tsx`
- **Placa**: regex `validarPlaca()` — aceita `ABC-1234` (antigo) e `ABC1D23` (Mercosul)
- Placa só valida se preenchida (campo opcional)

### Campo QTD
- `ServiceItem.quantity` é `string` (igual `unitPrice`/`discount`)
- Inicia vazio (`''`) — sem `1` padrão
- Cálculos: `parseFloat(item.quantity) || 0` para totais; `|| 1` no payload do banco

### Submit (modo real)
```typescript
// Nova nota:
const dbItens = itemPayload.map(item => ({ descricao, quantidade, valor, desconto, detalhes }))
await addNote({ ...payload, number: normalizeNoteNumber(osNumber), deadline }, dbItens)

// Edição:
await updateNote(editingNote.id, { ...payload, deadline })
```

---

## DataContext — Ações principais

```typescript
addNote(payload: Partial<IntakeNote>, itens?: NotaItemDB[]) → Promise<IntakeNote>
updateNote(id, payload) → Promise<void>
updateNoteStatus(id, status) → void  // otimista + Supabase em background
addClient(payload) → Promise<Client>
updateClient(id, payload) → Promise<void>
createPurchaseNote(...) → Promise<IntakeNote>
```

### NotaItemDB (interface exportada de DataContext)
```typescript
interface NotaItemDB {
  descricao: string;
  quantidade: number;
  valor: number;
  desconto?: number;
  detalhes?: string;
}
```

---

## Toast System

- Posição: **top-right** (`fixed top-4 right-4`)
- Duração: **5 segundos** (`<ToastProvider duration={5000}>`)
- Ícones: `CheckCircle2` (teal) para sucesso, `XCircle` (vermelho) para erro
- Limite: 3 toasts simultâneos
- Toasts removidos para não poluir: criar/desativar/ativar cliente

---

## Clientes — Estado Atual

- `onSuccess` no `ClientFormModal` fecha o modal (sem navigate)
- Validação CPF/CNPJ com dígito verificador antes de salvar
- `submitting` state: spinner no botão durante save
- CEP auto-preenchimento funcional (não auto-lookup em blur)

---

## Contas a Pagar — Estado Atual

| Feature | Status |
|---------|--------|
| Listagem com filtros | ✅ |
| Criar conta (modal) | ✅ |
| Ver detalhes + histórico | ✅ |
| Registrar pagamento | ✅ |
| Importar com IA | ✅ |
| Sugestões de Email | ✅ |
| Visualização de parcelas (timeline) | ✅ |

---

## Módulo Analytics — Planejamento

- **Fase 1**: embed GA4 + gtag (sem backend)
- **Fase 2**: proxy via Supabase Edge Function para GA4 Data API
- **Fase 3**: Meta Ads API via OAuth

Estrutura prevista:
```
/analytics
  ├── Tab: Visão Geral
  ├── Tab: Crescimento
  ├── Tab: Campanhas (Meta Ads)
  └── Tab: Comportamento
```

---

## Bugs Corrigidos (sessão 2026-04-21)

1. **`addClient` retornava Promise não awaited** → `navigate('/clientes/undefined')` corrigido
2. **Toast bottom-right** → movido para top-right com ícones e 5s
3. **Notas de Entrada sem Supabase** → conectado (load, create, status update, header update)
4. **`handleSubmit` sem async** → corrigido em NoteFormCore e ClientFormCore
5. **NoteFormModal sem X para fechar** → botão X adicionado no header

---

## Pendências / Próximos Passos

### Técnicas
- [ ] **`responsavel` no banco**: `ALTER TABLE Notas_de_Servico ADD COLUMN responsavel TEXT;` + migration Supabase + mapear no adapter
- [ ] **GET de listas via RPC**: serviços e produtos por nota via Supabase (hoje em localStorage)
- [ ] **Soft delete de notas**: RPC `delete_nota` com `deleted_at`

### Produto
- [ ] **Módulo Analytics** — aguardando URL do site + confirmação GA4
- [ ] **Fluxo de Caixa completo** — relatório mensal Entrada vs Saída
- [ ] **Relatório anual** — gráfico mês a mês no ano

### Perguntas abertas
- [ ] Quer persistir `responsavel` no banco? (migration necessária)
- [ ] Tem Google Analytics instalado no site? Qual a URL?
- [ ] Meta Ads: tem conta ativa? Quer conectar?
