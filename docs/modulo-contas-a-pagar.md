# Módulo: Contas a Pagar — Retífica Premium

> **Versão:** 1.0  
> **Data:** 2026-04-13  
> **Status:** Planejamento — Pronto para implementação  
> **Stack:** Vite + React 18 + TypeScript + Tailwind CSS + Radix UI + React Router v6 + React Hook Form + Zod + TanStack Query  
> **Contexto:** SPA sem backend — persistência atual via DataContext (in-memory + localStorage)

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Objetivos](#2-objetivos)
3. [Levantamento Funcional](#3-levantamento-funcional)
4. [Regras de Negócio](#4-regras-de-negócio)
5. [Estrutura dos Dados](#5-estrutura-dos-dados)
6. [Fluxos de Uso](#6-fluxos-de-uso)
7. [UX/UI do Módulo](#7-uxui-do-módulo)
8. [Componentização](#8-componentização)
9. [Página e Navegação](#9-página-e-navegação)
10. [Dashboard Financeiro](#10-dashboard-financeiro)
11. [Relatórios e Filtros](#11-relatórios-e-filtros)
12. [Integrações Futuras](#12-integrações-futuras)
13. [Plano Técnico de Implementação](#13-plano-técnico-de-implementação)
14. [Backlog Priorizado](#14-backlog-priorizado)
15. [Riscos e Cuidados](#15-riscos-e-cuidados)
16. [Sugestões de Produto](#16-sugestões-de-produto)
17. [Pontos a Validar](#17-pontos-a-validar)

---

## 1. Visão Geral

### O que é

O módulo de **Contas a Pagar** é o centro de controle financeiro de saída da retífica. É onde a dona da empresa registra, acompanha e baixa tudo que precisa ser pago: boletos, notas de fornecedores, despesas fixas, despesas eventuais, parcelamentos, recorrências.

Sem esse módulo, as contas ficam espalhadas em papel, agenda, planilha ou na memória — gerando esquecimentos, juros desnecessários e falta de visibilidade sobre o caixa.

### Por que é importante para a retífica

Uma retífica tem despesas constantes e variadas:
- Fornecedores de peças (que faturam com boleto ou PIX)
- Água, luz, aluguel, contador, planos de saúde
- Compras pontuais de ferramentas, equipamentos
- IPVA, IPTU, tributos, guias
- Serviços de terceiros (lavagem, transporte, entregas)

Sem um lugar centralizado, é impossível saber: **quanto sai, quando sai, o que ainda falta pagar e o que já foi pago**.

### Como se encaixa no sistema atual

O módulo entra como o 8º item da sidebar, entre **Nota Fiscal** e **Configurações**. Acessível pelos roles `ADMIN` e `FINANCEIRO`. Usa os mesmos padrões visuais, componentes e design system do restante do sistema. Futuramente, pode cruzar dados com as Notas de Entrada (OS) para vincular despesas de compras de peças às ordens de serviço.

---

## 2. Objetivos

### Objetivos primários (MVP)

- [ ] Registrar contas a pagar de forma rápida e sem fricção
- [ ] Visualizar de uma vez o que está pendente, atrasado e pago
- [ ] Marcar contas como pagas (baixa manual)
- [ ] Filtrar por vencimento, status e categoria
- [ ] Evitar esquecimentos com indicadores visuais de urgência e atraso
- [ ] Centralizar todas as despesas em um único lugar

### Objetivos secundários (pós-MVP)

- [ ] Anexar boletos, notas e comprovantes de pagamento
- [ ] Suportar parcelamentos e recorrências
- [ ] Gerar resumo financeiro por período
- [ ] Filtrar por fornecedor e categoria
- [ ] Exportar para CSV/Excel
- [ ] Histórico de alterações por conta

### Objetivos futuros

- [ ] Integrar com fechamento mensal
- [ ] Previsão de fluxo de caixa
- [ ] Alertas por e-mail/WhatsApp de contas vencendo
- [ ] Importação de boletos via OCR

---

## 3. Levantamento Funcional

### 3.1 Cadastro de Conta

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| Título / Descrição | texto (max 120) | Sim | Ex: "Boleto Distribuidora X", "Água Março" |
| Fornecedor | select (cadastro) ou texto livre | Não | Pode digitar um nome sem cadastrar |
| Categoria | select (categorias do sistema) | Sim | Ex: Peças, Utilities, Aluguel |
| Urgente | toggle | Não | Sinaliza prioridade visual |
| Número do documento | texto (max 60) | Não | Nota, boleto, guia |
| Data de emissão | date | Não | Data da nota/boleto |
| Data de vencimento | date | Sim | Campo mais importante |
| Valor original | moeda | Sim | Valor base |
| Juros | moeda | Não | Acrescentado ao valor final |
| Desconto | moeda | Não | Subtraído do valor final |
| Valor final | moeda (calculado) | Auto | = original + juros - desconto |
| Observações | textarea (max 500) | Não | Notas livres |
| Parcelamento | número | Não | Quantas parcelas (1 = à vista) |
| Recorrência | select | Não | Mensal, Semanal, etc. |
| Forma de pagamento prevista | select | Não | PIX, Boleto, Cartão, etc. |

### 3.2 Baixa de Pagamento

Campos adicionais ao registrar o pagamento:

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| Valor pago | moeda | Sim | Pode ser diferente do final (parcial) |
| Data do pagamento | date | Sim | Padrão: hoje |
| Forma de pagamento real | select | Sim | Confirmação efetiva |
| Comprovante | upload | Não | PDF, imagem |
| Observações do pagamento | texto | Não | |

### 3.3 Listagem

- Tabela com paginação (padrão do sistema — 20 por página)
- Colunas: Descrição, Fornecedor, Categoria, Vencimento, Valor, Status, Ações
- Indicador de urgência (ícone de alerta vermelho inline)
- Indicador de atraso (data em vermelho + dias em atraso)
- Mobile: layout em cards (responsivo, padrão do sistema)

### 3.4 Filtros

- Tabs de status rápido: Todas | Pendentes | Vencidas | Pagas | Canceladas
- Filtro por período de vencimento (date range)
- Filtro por categoria (select)
- Filtro por fornecedor (select)
- Filtro por forma de pagamento
- Campo de busca full-text (título, fornecedor, número do documento)
- Filtro especial: "Vencendo hoje", "Vencendo essa semana"

### 3.5 Visualização Detalhada

- Drawer lateral (Sheet) ao clicar em uma conta
- Tabs: Detalhes | Anexos | Histórico
- Ações contextuais: Editar | Registrar Pagamento | Cancelar | Excluir

### 3.6 Anexos

- Upload de boleto (PDF)
- Upload de nota fiscal (PDF, XML)
- Upload de comprovante de pagamento (PDF, imagem)
- Upload de outros documentos
- Preview inline de imagens
- Download do arquivo
- Múltiplos anexos por conta

### 3.7 Histórico de Alterações

- Log automático de toda alteração relevante
- Registro de: criação, edição de campos, baixa, cancelamento, exclusão
- Exibido na tab "Histórico" do drawer de detalhe

---

## 4. Regras de Negócio

### 4.1 Status e Transições

```
PENDENTE  ──►  PAGO
          ──►  CANCELADO
          ──►  PARCIAL (pagamento parcial)

PARCIAL   ──►  PAGO (quando valor pago == valor final)
          ──►  CANCELADO

AGENDADO  ──►  PENDENTE (quando data chega)
          ──►  CANCELADO

VENCIDO   ──►  PAGO
          ──►  CANCELADO
(VENCIDO é derivado: status = PENDENTE e dueDate < hoje)
```

> **Nota de implementação:** `VENCIDO` não é gravado no banco — é derivado em runtime com base em `status === 'PENDENTE' && dueDate < today`. O status gravado permanece `PENDENTE`. Isso simplifica as regras de transição e evita jobs de atualização.

### 4.2 Definição dos Status

| Status | Descrição |
|--------|-----------|
| `PENDENTE` | Conta cadastrada, não paga, não vencida |
| `VENCIDO` | Status derivado: pendente com `dueDate < hoje` |
| `PAGO` | Pagamento registrado (total) |
| `PARCIAL` | Pagamento registrado, mas valor pago < valor final |
| `AGENDADO` | Conta futura programada (dueDate > hoje, registrada com antecedência) |
| `CANCELADO` | Conta cancelada — mantida para histórico |

### 4.3 Edição

- Contas com status `PENDENTE`, `AGENDADO` ou `PARCIAL` podem ser editadas livremente
- Contas com status `PAGO` podem ser editadas apenas em: observações, anexos e título
- Contas com status `CANCELADO` não podem ser editadas (read-only)
- Ao editar uma conta paga, registrar log de auditoria com campos alterados

### 4.4 Exclusão

- Exclusão lógica: campo `deletedAt` (não remove do banco, apenas oculta)
- Contas `PAGO` não podem ser excluídas sem confirmação extra (AlertDialog com input de confirmação)
- Contas `PENDENTE` ou `AGENDADO`: exclusão com AlertDialog simples
- Contas excluídas somem das listagens normais (filtro `deletedAt == null`)
- Admins podem ver contas excluídas futuramente com filtro especial

### 4.5 Pagamento Parcial

- Registrado quando `valorPago < valorFinal`
- Status muda para `PARCIAL`
- Saldo devedor = `valorFinal - paidAmount`
- Quando registro subsequente completa o valor: status vai para `PAGO`
- Cada registro de pagamento parcial é logado no histórico

### 4.6 Recorrência

- Ao criar conta com recorrência, o sistema gera automaticamente as N instâncias futuras
- Cada instância é uma entidade independente com `recurrenceParentId` apontando para a primeira
- Editar a conta "pai" oferece opção: "editar só esta" ou "editar esta e futuras"
- Exclusão de conta recorrente: "excluir só esta" ou "excluir esta e futuras"
- Badge indica: "Recorrente — Mensal" ou "Parcela 2/12"

### 4.7 Parcelamento

- Ao criar parcelamento (totalInstallments > 1), sistema gera N contas com:
  - Título sufixado: "Nome da conta (2/6)"
  - Vencimento calculado: vencimento base + N meses
  - Mesmo `recurrenceParentId`
  - Valor dividido igualmente (ou proporcional se configurado)

### 4.8 Prevenção de Duplicidade

- Ao salvar, validar combinação: `supplierId + docNumber + originalAmount + dueDate`
- Se já existe registro não cancelado com mesma combinação, alertar usuário
- Não bloquear — alertar e pedir confirmação (pode ser coincidência válida)

### 4.9 Baixa Manual vs. Baixa com Comprovante

- **Baixa simples:** apenas data + valor + forma de pagamento → status `PAGO`
- **Baixa com comprovante:** mesmo fluxo + upload de arquivo → campo `attachments` recebe entrada do tipo `COMPROVANTE`
- Ambas registram log no histórico

### 4.10 Cálculo do Valor Final

```ts
finalAmount = originalAmount + (interest ?? 0) - (discount ?? 0)
```

- Calculado automaticamente em tempo real no formulário
- Nunca deixar `finalAmount` negativo (discount não pode ser maior que original + juros)

---

## 5. Estrutura dos Dados

### 5.1 Tipos TypeScript (adicionar em `src/types/index.ts`)

```ts
// ─── Contas a Pagar ─────────────────────────────────────────────────────────

export type PayableStatus =
  | 'PENDENTE'
  | 'PAGO'
  | 'PARCIAL'
  | 'CANCELADO'
  | 'AGENDADO';

export type PaymentMethod =
  | 'PIX'
  | 'BOLETO'
  | 'TRANSFERENCIA'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'DINHEIRO'
  | 'CHEQUE'
  | 'DEBITO_AUTOMATICO';

export type RecurrenceType =
  | 'NENHUMA'
  | 'SEMANAL'
  | 'QUINZENAL'
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

export type PayableAttachmentType =
  | 'BOLETO'
  | 'NOTA_FISCAL'
  | 'COMPROVANTE'
  | 'CONTRATO'
  | 'OUTRO';

export interface AccountPayable {
  id: string;
  title: string;                        // Descrição da despesa (ex: "Água Março")
  supplierId?: string;                  // Ref para PayableSupplier (opcional)
  supplierName?: string;                // Nome livre quando não há cadastro
  categoryId: string;                   // Ref para PayableCategory
  
  docNumber?: string;                   // Número do documento (boleto, NF, guia)
  issueDate?: string;                   // Data de emissão (ISO string)
  dueDate: string;                      // Data de vencimento (ISO string) — obrigatório
  
  originalAmount: number;               // Valor original (R$)
  interest?: number;                    // Juros adicionais (R$)
  discount?: number;                    // Desconto aplicado (R$)
  finalAmount: number;                  // Valor final calculado (R$)
  paidAmount?: number;                  // Valor efetivamente pago (R$)
  
  status: PayableStatus;
  paymentMethod?: PaymentMethod;        // Forma de pagamento prevista
  paidAt?: string;                      // Data do pagamento efetivo (ISO string)
  paidWith?: PaymentMethod;             // Forma real de pagamento
  paymentNotes?: string;                // Obs do pagamento
  
  recurrence: RecurrenceType;           // Tipo de recorrência
  recurrenceParentId?: string;          // ID da primeira conta do grupo
  recurrenceIndex?: number;             // Índice no grupo (ex: 2 de 12)
  totalInstallments?: number;           // Total de parcelas/ocorrências
  
  observations?: string;               // Observações livres
  isUrgent: boolean;                    // Flag de urgência visual
  
  deletedAt?: string;                   // Exclusão lógica
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

export interface PayableCategory {
  id: string;
  name: string;
  color: string;                        // Tailwind class: "bg-blue-500 text-white"
  icon: string;                         // Lucide icon name (string)
  isActive: boolean;
  createdAt: string;
}

export interface PayableSupplier {
  id: string;
  name: string;
  tradeName?: string;
  docType?: DocType;
  docNumber?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PayableAttachment {
  id: string;
  payableId: string;
  type: PayableAttachmentType;
  filename: string;
  url: string;
  createdAt: string;
  createdByUserId: string;
}

export interface PayableHistory {
  id: string;
  payableId: string;
  action: 'CREATED' | 'UPDATED' | 'PAID' | 'PARTIAL_PAID' | 'CANCELLED' | 'DELETED' | 'ATTACHMENT_ADDED';
  description: string;                  // Texto legível: "Status alterado de Pendente para Pago"
  fieldChanges?: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
  userId: string;
  createdAt: string;
}
```

### 5.2 Labels e Colors dos Status

```ts
export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  PARCIAL: 'Parcial',
  CANCELADO: 'Cancelado',
  AGENDADO: 'Agendado',
};

// Status derivado para exibição (não gravado)
export type PayableDisplayStatus = PayableStatus | 'VENCIDO';

export const PAYABLE_STATUS_COLORS: Record<PayableDisplayStatus, string> = {
  PENDENTE: 'bg-warning text-warning-foreground',
  VENCIDO:  'bg-destructive text-destructive-foreground',
  PAGO:     'bg-success text-success-foreground',
  PARCIAL:  'bg-orange-100 text-orange-800',
  CANCELADO:'bg-zinc-200 text-zinc-700',
  AGENDADO: 'bg-info text-info-foreground',
};
```

### 5.3 Categorias Padrão (seed data)

```ts
export const DEFAULT_PAYABLE_CATEGORIES: PayableCategory[] = [
  { id: 'cat-1', name: 'Peças e Materiais',  color: 'bg-blue-100 text-blue-800',    icon: 'Wrench',       isActive: true, createdAt: '...' },
  { id: 'cat-2', name: 'Utilities',          color: 'bg-yellow-100 text-yellow-800', icon: 'Zap',          isActive: true, createdAt: '...' },
  { id: 'cat-3', name: 'Aluguel',            color: 'bg-purple-100 text-purple-800', icon: 'Building2',    isActive: true, createdAt: '...' },
  { id: 'cat-4', name: 'Impostos e Taxas',   color: 'bg-red-100 text-red-800',       icon: 'Landmark',     isActive: true, createdAt: '...' },
  { id: 'cat-5', name: 'Mão de Obra',        color: 'bg-green-100 text-green-800',   icon: 'Users',        isActive: true, createdAt: '...' },
  { id: 'cat-6', name: 'Equipamentos',       color: 'bg-cyan-100 text-cyan-800',     icon: 'Package',      isActive: true, createdAt: '...' },
  { id: 'cat-7', name: 'Serviços Gerais',    color: 'bg-gray-100 text-gray-800',     icon: 'Settings',     isActive: true, createdAt: '...' },
  { id: 'cat-8', name: 'Outros',             color: 'bg-slate-100 text-slate-800',   icon: 'MoreHorizontal', isActive: true, createdAt: '...' },
];
```

### 5.4 Extensões em `types/index.ts`

```ts
// Adicionar ao AppModuleKey
export type AppModuleKey = 'dashboard' | 'clients' | 'notes' | 'kanban'
  | 'closing' | 'invoices' | 'payables' | 'settings' | 'admin';

// Adicionar ao Permission
export type Permission =
  | /* ... existentes ... */
  | 'payables.view'
  | 'payables.manage';
```

### 5.5 DataContext — Novos campos

```ts
// Em DataContext, adicionar:
payables: AccountPayable[]
payableCategories: PayableCategory[]
payableSuppliers: PayableSupplier[]
payableAttachments: PayableAttachment[]
payableHistory: PayableHistory[]

// CRUD methods
addPayable(data): AccountPayable
updatePayable(id, data): void
cancelPayable(id, reason?): void
softDeletePayable(id): void
registerPayment(id, paymentData): void
addPayableAttachment(payableId, data): PayableAttachment
addPayableHistory(entry): void
getPayablesForSupplier(supplierId): AccountPayable[]
getAttachmentsForPayable(payableId): PayableAttachment[]
getHistoryForPayable(payableId): PayableHistory[]

// Índices derivados
payableById: Map<string, AccountPayable>
activePayables: AccountPayable[]  // sem deletedAt
```

### 5.6 Função utilitária de status derivado

```ts
// src/services/domain/payables.ts

export function getPayableDisplayStatus(p: AccountPayable): PayableDisplayStatus {
  if (p.status !== 'PENDENTE') return p.status;
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(p.dueDate));
  return isBefore(due, today) ? 'VENCIDO' : 'PENDENTE';
}

export function getDaysOverdue(p: AccountPayable): number | null {
  const display = getPayableDisplayStatus(p);
  if (display !== 'VENCIDO') return null;
  return differenceInDays(new Date(), parseISO(p.dueDate));
}

export function getDaysUntilDue(p: AccountPayable): number | null {
  if (p.status !== 'PENDENTE') return null;
  const days = differenceInDays(parseISO(p.dueDate), new Date());
  return days >= 0 ? days : null;
}
```

---

## 6. Fluxos de Uso

### 6.1 Cadastrar Nova Conta

```
1. Usuário clica em "Nova Conta" (botão no header da página)
2. Abre Modal com formulário (PayableFormModal)
3. Preenche: título, categoria (obrigatório), vencimento (obrigatório), valor
4. Opcionais: fornecedor, documento, juros, desconto, observações
5. Se quiser parcelamento: ativa toggle "Parcelado" → informa nº parcelas e mês inicial
6. Se quiser recorrência: seleciona tipo (Mensal, etc.)
7. Clica "Salvar"
8. Sistema valida (Zod schema)
9. Sistema checa duplicidade → se detectada, exibe AlertDialog de confirmação
10. Conta(s) criada(s) → toast de sucesso → modal fecha → lista atualiza
11. Log de histórico registrado automaticamente
```

### 6.2 Registrar Pagamento (Baixa)

```
1. Na tabela, clicar no botão de ações → "Registrar Pagamento"
   OU abrir drawer de detalhe → clicar "Registrar Pagamento" (botão em destaque)
2. Abre PayablePaymentDialog
3. Preenche: valor pago (default = finalAmount), data (default = hoje), forma de pagamento
4. Opcionalmente: anexa comprovante, adiciona observações
5. Clica "Confirmar Pagamento"
6. Se valorPago < finalAmount: status → PARCIAL, saldo devedor calculado e exibido
7. Se valorPago >= finalAmount: status → PAGO, paidAt gravado
8. Log registrado no histórico
9. Toast de sucesso
10. Drawer/modal fecha, lista atualiza status e badge
```

### 6.3 Filtrar Contas Vencidas

```
1. Na página principal, clicar na tab "Vencidas"
2. Lista filtra para: status PENDENTE + dueDate < hoje
3. Contas exibidas com badge vermelho "Vencido" + dias em atraso
4. Usuário pode ordenar por vencimento (mais antigas primeiro)
5. Clicar em uma conta → drawer de detalhe → ação "Registrar Pagamento"
```

### 6.4 Consultar por Fornecedor

```
1. No filtro superior, selecionar fornecedor no dropdown
2. Lista filtra para contas daquele fornecedor (ou nome livre correspondente)
3. Summary cards se atualizam para mostrar totais do fornecedor filtrado
4. Exportar para CSV considera o filtro ativo
```

### 6.5 Tratar Conta Recorrente

```
1. Ao cadastrar, selecionar recorrência (ex: Mensal)
2. Informar quantas ocorrências (ou "sem fim" para rolling)
3. Sistema cria todas as instâncias com datas calculadas
4. Na lista, cada instância é uma linha com badge "Recorrente — Mensal (3/12)"
5. Ao editar, prompt: "Editar só esta ocorrência" vs "Editar esta e as futuras"
6. Ao excluir, mesmo prompt de escopo
```

### 6.6 Visualizar Totais por Período

```
1. No header da página, seletor de período (Mês atual | Mês anterior | Personalizado)
2. Summary cards se atualizam: Total Pendente, Total Vencido, Pago no Mês
3. Gráfico de barras (opcional) por categoria no período
4. Tabela exibe contas do período selecionado
```

### 6.7 Excluir Conta com Segurança

```
1. Ações da conta → "Excluir"
2. AlertDialog com:
   - Se PENDENTE/AGENDADO: "Tem certeza? Esta ação não pode ser desfeita."
   - Se PAGO: campo de confirmação com texto "EXCLUIR" para digitar
3. Ao confirmar: deletedAt preenchido (exclusão lógica)
4. Conta some da listagem, log registrado
```

---

## 7. UX/UI do Módulo

### 7.1 Layout da Página Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER                                                             │
│  [💰 Contas a Pagar]          [Período ▼]  [+ Nova Conta]          │
├─────────────────────────────────────────────────────────────────────┤
│  SUMMARY CARDS (4 cards em linha)                                   │
│  [Total Pendente]  [Total Vencido]  [Pago no Mês]  [Vence Hoje]    │
│   R$ 4.820,00      R$ 1.230,00      R$ 6.410,00     3 contas       │
├─────────────────────────────────────────────────────────────────────┤
│  FILTROS                                                            │
│  [Todas][Pendentes][Vencidas][Pagas][Canceladas]  🔍 Buscar...     │
│  [Categoria ▼]  [Fornecedor ▼]  [Forma de Pag ▼]  [Período ▼]    │
├─────────────────────────────────────────────────────────────────────┤
│  TABELA                                                             │
│  Descrição         Fornecedor   Categoria   Vencimento   Valor     │
│  ─────────────────────────────────────────────────────────────     │
│  ⚠ Água Março      —            Utilities   15/03 ●●3d  R$ 220    │
│  Boleto Dist. X    Dist. X      Peças       18/04       R$ 1.420   │
│  Aluguel Galpão    —            Aluguel     30/04       R$ 2.800   │
│  ...                                                                │
│                                      [< 1 2 3 >]                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Legenda da tabela:**
- `⚠` = ícone vermelho de urgência (`isUrgent = true`)
- `●●3d` = badge "3 dias atraso" em vermelho (vencida)
- Linha de conta vencida: fundo levemente rosado (`bg-red-50/30 dark:bg-red-950/10`)
- Linha de conta urgente: badge de alerta inline

### 7.2 Summary Cards

Seguir o padrão dos cards do Dashboard atual. Cada card:
- Ícone à esquerda (colorido por semântica)
- Título em `text-muted-foreground text-sm`
- Valor em `text-2xl font-display font-bold`
- Subtexto opcional (ex: "+2 desde ontem")

```
┌────────────────────┐  ┌────────────────────┐
│ 🕐 Total Pendente  │  │ ⚠ Total Vencido    │
│ R$ 4.820,00        │  │ R$ 1.230,00        │
│ 8 contas           │  │ 3 contas           │
└────────────────────┘  └────────────────────┘

┌────────────────────┐  ┌────────────────────┐
│ ✓ Pago no Mês     │  │ 📅 Vence Hoje      │
│ R$ 6.410,00        │  │ 3 contas           │
│ Abril 2026         │  │ R$ 860,00 total    │
└────────────────────┘  └────────────────────┘
```

- Card "Total Vencido" em vermelho quando `> 0`
- Card "Vence Hoje" em âmbar quando `> 0`
- Animação de entrada com `framer-motion` (fade + slide-up, padrão do sistema)

### 7.3 Filtros

Tabs com contadores:
```tsx
<Tabs defaultValue="all">
  <TabsList>
    <TabsTrigger value="all">Todas <Badge>32</Badge></TabsTrigger>
    <TabsTrigger value="pendente">Pendentes <Badge>8</Badge></TabsTrigger>
    <TabsTrigger value="vencido">Vencidas <Badge className="bg-destructive">3</Badge></TabsTrigger>
    <TabsTrigger value="pago">Pagas <Badge>18</Badge></TabsTrigger>
    <TabsTrigger value="cancelado">Canceladas <Badge>3</Badge></TabsTrigger>
  </TabsList>
</Tabs>
```

Linha de filtros secundários abaixo dos tabs:
- Select de Categoria
- Select de Fornecedor
- Select de Forma de Pagamento
- DateRangePicker (vencimento)
- Input de busca com debounce (padrão: 250ms)

### 7.4 Tabela

Colunas (desktop):

| Coluna | Largura | Notas |
|--------|---------|-------|
| Descrição | flex-1 | Título + badge de urgência + subtexto fornecedor |
| Categoria | 160px | Badge colorida conforme categoria |
| Vencimento | 140px | Data + indicador de atraso (vermelho) ou proximidade (âmbar) |
| Valor | 120px | Valor final, alinhado à direita |
| Status | 110px | PayableStatusBadge |
| Ações | 80px | DropdownMenu com ações |

Comportamento:
- Linha clicável → abre drawer de detalhe
- Hover com fundo sutil (`hover:bg-muted/50`)
- Linha vencida com highlight de fundo suave
- Ordenação por vencimento (padrão: mais recente)
- Pagination component do sistema (padrão 20/página)

Mobile (abaixo de `lg`): Layout em cards, padrão do sistema existente:
```
┌─────────────────────────────────────────┐
│ Boleto Distribuidora X        [status]  │
│ Dist. X • Peças e Materiais             │
│ Vence 18/04/2026              R$ 1.420  │
└─────────────────────────────────────────┘
```

### 7.5 Drawer de Detalhe (PayableDetailsDrawer)

Sheet lateral direita (width: 480px desktop, full-width mobile):

```
┌────────────────────────────────┐
│ [X] Boleto Distribuidora X     │
│     [PENDENTE] [⚠ URGENTE]    │
│                                │
│  [Registrar Pagamento]  [...]  │
│                                │
│ ─────────────────────────────  │
│ [Detalhes] [Anexos] [Histórico]│
│ ─────────────────────────────  │
│                                │
│ INFORMAÇÕES GERAIS             │
│ Fornecedor:  Distribuidora X   │
│ Categoria:   Peças e Materiais │
│ Documento:   NF-0045678        │
│ Emissão:     10/04/2026        │
│                                │
│ VALORES                        │
│ Valor original:   R$ 1.420,00  │
│ Juros:            R$ 0,00      │
│ Desconto:         R$ 0,00      │
│ ─────────────────────────────  │
│ Valor final:      R$ 1.420,00  │
│                                │
│ VENCIMENTO                     │
│ Data:             18/04/2026   │
│ [DueDateIndicator]             │
│                                │
│ OBSERVAÇÕES                    │
│ Texto livre aqui...            │
└────────────────────────────────┘
```

Botão "Registrar Pagamento":
- Visível apenas quando status é PENDENTE, VENCIDO ou PARCIAL
- Primário + ícone de check
- Em contas vencidas: cor destructive com ícone de alerta

Menu de ações `(...)`:
- Editar
- Cancelar conta
- Excluir
- (Se recorrente: "Ver série completa")

### 7.6 Formulário de Cadastro (PayableFormModal)

Dialog centralizado, responsivo, com scroll interno:

```
┌─────────────────────────────────────────┐
│ Nova Conta a Pagar              [X]     │
├─────────────────────────────────────────┤
│                                         │
│ ── IDENTIFICAÇÃO ──────────────────     │
│ Título *         [_________________]   │
│ Categoria *      [Select ▼        ]   │
│ Fornecedor       [Select ▼ ou livre]   │
│ Urgente          [⬜ Marcar como urgente]│
│                                         │
│ ── DOCUMENTO ──────────────────────     │
│ Nº Documento     [_________________]   │
│ Data de Emissão  [__/__/____]           │
│                                         │
│ ── VALORES ────────────────────────     │
│ Valor Original * [R$ ________]         │
│ Juros            [R$ ________]         │
│ Desconto         [R$ ________]         │
│ Valor Final      [R$ 0,00    ] (auto)  │
│                                         │
│ ── VENCIMENTO ─────────────────────     │
│ Vencimento *     [__/__/____]           │
│ Forma Pag.       [Select ▼        ]   │
│                                         │
│ ── PARCELAMENTO ───────────────────     │
│ [⬜ Parcelado]                           │
│ Qtd Parcelas     [____]                 │
│                                         │
│ ── RECORRÊNCIA ────────────────────     │
│ Recorrência      [Nenhuma ▼       ]   │
│                                         │
│ ── OBSERVAÇÕES ────────────────────     │
│ [Textarea ___________________]          │
│                                         │
├─────────────────────────────────────────┤
│ [Cancelar]              [Salvar]        │
└─────────────────────────────────────────┘
```

- Sticky footer (padrão do sistema — NoteFormCore)
- Campos obrigatórios com `*` e border de erro em vermelho
- Valor Final calculado em tempo real com `text-primary font-bold`
- Parcelamento: toggle oculta/mostra campos de parcela
- Recorrência e Parcelamento são mutuamente exclusivos (se um está ativo, outro desabilita)

### 7.7 Dialog de Registro de Pagamento (PayablePaymentDialog)

AlertDialog simples, foco total na ação:

```
┌────────────────────────────────────┐
│ Registrar Pagamento               │
│ Boleto Distribuidora X            │
│ Valor a pagar: R$ 1.420,00        │
├────────────────────────────────────┤
│ Valor Pago *     [R$ 1.420,00]    │
│ Data             [13/04/2026]     │
│ Forma de Pag. *  [PIX ▼       ]  │
│                                    │
│ Comprovante      [📎 Anexar]      │
│ Observações      [___________]    │
├────────────────────────────────────┤
│ [Cancelar]  [Confirmar Pagamento] │
└────────────────────────────────────┘
```

- Se valor pago < valor final: alerta amarelo "Pagamento parcial — saldo devedor: R$ X"
- Botão de confirmar em verde (`bg-success`)

### 7.8 Estado Vazio

Quando não há contas cadastradas:

```
        [ícone Wallet grande, muted]
     Nenhuma conta cadastrada ainda

  Registre boletos, despesas e notas
  para ter controle total do que sai.

          [+ Cadastrar Primeira Conta]
```

Estado vazio com filtro ativo:
```
        [ícone SearchX, muted]
   Nenhuma conta encontrada

  Tente ajustar os filtros ou
  limpe a busca para ver tudo.

     [Limpar filtros]
```

### 7.9 Badges de Status

```tsx
// PayableStatusBadge — usa PAYABLE_STATUS_COLORS

PENDENTE  → bg-warning/amber    → "Pendente"
VENCIDO   → bg-destructive/red  → "Vencido · 3d"  (com dias)
PAGO      → bg-success/green    → "Pago"
PARCIAL   → bg-orange-100       → "Parcial"
CANCELADO → bg-zinc-200         → "Cancelado"
AGENDADO  → bg-info/blue        → "Agendado"
```

### 7.10 DueDateIndicator

Componente que exibe o vencimento com cor contextual:

```tsx
// Verde: >7 dias → "Vence em 12 dias"
// Âmbar: 1-7 dias → "Vence em 3 dias ⚠"
// Vermelho: vencida → "Vencida há 5 dias 🔴"
// Cinza: paga → data formatada normal
```

### 7.11 Microinterações

- Entrada de cards com `framer-motion` (stagger + fade-in)
- Hover em linhas da tabela com `transition-colors duration-150`
- Botão "Registrar Pagamento" com shimmer sutil em contas vencidas
- Toast de sucesso ao salvar/baixar (padrão Sonner do sistema)
- Número do valor final pulsando brevemente ao recalcular (quando juros/desconto mudam)

---

## 8. Componentização

### 8.1 Mapa de Componentes

```
src/components/payables/
├── PayableSummaryCards.tsx       # 4 KPI cards do topo da página
├── PayableStatusBadge.tsx        # Badge de status (PENDENTE, PAGO, VENCIDO...)
├── DueDateIndicator.tsx          # Indicador de vencimento com cor contextual
├── PayableFilters.tsx            # Tabs de status + filtros secundários + busca
├── PayableTable.tsx              # Tabela principal com paginação
├── PayableTableRow.tsx           # Linha individual da tabela
├── PayableMobileCard.tsx         # Card para mobile
├── PayableDetailsDrawer.tsx      # Sheet lateral com detalhe completo
├── PayableForm.tsx               # Formulário de criação/edição (core)
├── PayableFormModal.tsx          # Wrapper modal do formulário
├── PayablePaymentDialog.tsx      # Dialog de registro de pagamento
├── PayableAttachmentUploader.tsx # Upload de arquivos (boleto, NF, comprovante)
├── PayableAttachmentList.tsx     # Lista de arquivos anexados
├── PayableTimeline.tsx           # Linha do tempo de histórico
├── PayableActionsMenu.tsx        # DropdownMenu de ações por conta
├── PayableCategoryBadge.tsx      # Badge colorida com ícone da categoria
├── PayableEmptyState.tsx         # Estado vazio (sem dados / sem filtro match)
└── CurrencyInput.tsx             # Input de moeda reutilizável (R$)
```

### 8.2 Responsabilidades Detalhadas

**`PayableSummaryCards`**
- Recebe: `payables: AccountPayable[]`, `period: DateRange`
- Calcula internamente (ou via hook): totais de cada card
- Renderiza 4 cards em grid responsivo (`grid-cols-2 lg:grid-cols-4`)
- Animação de stagger no mount

**`PayableStatusBadge`**
- Recebe: `payable: AccountPayable` (não só o status — precisa calcular VENCIDO)
- Chama `getPayableDisplayStatus(payable)` internamente
- Opções: `size?: 'sm' | 'md'`, `showDays?: boolean`

**`DueDateIndicator`**
- Recebe: `dueDate: string`, `status: PayableStatus`
- Retorna: data formatada + indicador textual colorido
- "Vence em X dias" / "Vence amanhã" / "Vence hoje" / "Vencida há X dias"

**`PayableFilters`**
- Recebe: `filters: PayableFilters`, `onFiltersChange: (f) => void`
- Estado interno para debounce da busca
- Expõe botão "Limpar filtros" quando há filtros ativos
- Contador de resultados filtrados

**`PayableTable`**
- Recebe: `payables: AccountPayable[]`, `onRowClick`, `onActionClick`
- Paginação interna (ou via state externo)
- Sorting básico por vencimento
- Responsive: `hidden lg:table` para colunas secundárias

**`PayableForm`**
- Recebe: `initialData?: AccountPayable`, `onSubmit`, `onCancel`
- Usa React Hook Form + Zod
- Calcula `finalAmount` em tempo real com `watch()`
- Controla visibilidade dos campos de parcela/recorrência
- Validação de duplicidade via callback

**`PayablePaymentDialog`**
- Recebe: `payable: AccountPayable`, `open`, `onClose`, `onConfirm`
- Dialog simples com 4 campos
- Calcula saldo e exibe alerta de pagamento parcial
- Suporte a upload de comprovante (reutiliza `PayableAttachmentUploader`)

**`PayableTimeline`**
- Recebe: `history: PayableHistory[]`
- Linha do tempo vertical com ícone, texto e timestamp
- Ícone varia por `action` (CheckCircle2 para PAID, Edit para UPDATED, etc.)
- Data formatada com `date-fns/ptBR`

**`CurrencyInput`**
- Input controlado com máscara de moeda brasileira
- Internamente trabalha com `number`, exibe como `"R$ 1.420,00"`
- Props: `value: number`, `onChange: (n: number) => void`, `placeholder`, `disabled`
- Aceita `ref` (compatível com React Hook Form `Controller`)

**`PayableActionsMenu`**
- Recebe: `payable: AccountPayable`, callbacks para cada ação
- DropdownMenu com: Editar | Registrar Pagamento | Cancelar | Excluir
- Ações condicionais por status (ex: "Registrar Pagamento" oculto se `PAGO` ou `CANCELADO`)

---

## 9. Página e Navegação

### 9.1 Rota

```
/contas-a-pagar
```

### 9.2 Alterações em `AppLayout.tsx`

```tsx
// Adicionar ao navItems array:
{ label: 'Contas a Pagar', icon: Wallet, path: '/contas-a-pagar', moduleKey: 'payables' },
```

Posição: entre `Nota Fiscal` e `Configurações`.

Icon: `Wallet` do `lucide-react` (já disponível no pacote).

### 9.3 Rota em `App.tsx`

```tsx
// Adicionar ProtectedRoute:
<Route
  path="/contas-a-pagar"
  element={
    <ProtectedRoute
      moduleKey="payables"
      allowedRoles={['ADMIN', 'FINANCEIRO']}
    />
  }
>
  <Route index element={<ContasAPagar />} />
</Route>
```

### 9.4 Permissões em `services/auth/permissions.ts`

```ts
// Adicionar ao DEFAULT_ROLE_PERMISSIONS:
ADMIN:      [..., 'payables.view', 'payables.manage'],
FINANCEIRO: [..., 'payables.view', 'payables.manage'],
PRODUCAO:   [...],  // sem acesso
RECEPCAO:   [...],  // sem acesso
```

### 9.5 Breadcrumbs

```
Dashboard > Contas a Pagar
```

Não há subpáginas — toda a navegação ocorre via drawer/modal, sem mudar a URL.

### 9.6 Preloading

Adicionar ao `routeModules.ts`:
```ts
'/contas-a-pagar': () => import('@/pages/ContasAPagar'),
```

---

## 10. Dashboard Financeiro

### 10.1 Summary Cards (topo da página)

| Card | Cálculo | Cor |
|------|---------|-----|
| Total Pendente | `sum(activePayables.filter(PENDENTE)) + sum(PARCIAL)` | amber |
| Total Vencido | `sum(activePayables.filter(VENCIDO))` | red (0 = cinza) |
| Pago no Mês | `sum(activePayables.filter(PAGO, paidAt no mês atual))` | green |
| Vencendo Hoje | `count(PENDENTE, dueDate == hoje)` + valor total | amber |

### 10.2 Gráfico de Barras por Categoria (futuro)

- Barras horizontais por categoria
- Valor pendente vs. pago
- Recharts (já disponível no projeto)
- Só no modo "período" expandido

### 10.3 Indicadores no Dashboard Global

Futuramente, no `/dashboard` existente, adicionar bloco:

```
┌───────────────────────────────────────┐
│ 💰 Contas a Pagar — Resumo           │
│ Pendente: R$ 4.820  Vencido: R$ 1.230 │
│ [Ver tudo →]                          │
└───────────────────────────────────────┘
```

---

## 11. Relatórios e Filtros

### 11.1 Filtros Disponíveis

| Filtro | Tipo | Notas |
|--------|------|-------|
| Status | tabs + select | Includes status derivado VENCIDO |
| Vencimento | DateRangePicker | react-day-picker (já no projeto) |
| Data de Pagamento | DateRangePicker | Para filtrar pagas |
| Categoria | Select multi | Múltiplas categorias |
| Fornecedor | Select | Com busca |
| Forma de Pagamento | Select | |
| Valor mínimo/máximo | Range numérico | Futuramente |
| Busca texto | Input debounce | Título, fornecedor, nº documento |
| Urgentes apenas | Toggle | `isUrgent = true` |

### 11.2 Exportação CSV

Reutilizar o padrão de `xlsx` já instalado no projeto.

Colunas do CSV:
```
Título | Fornecedor | Categoria | Nº Documento | Emissão | Vencimento |
Valor Original | Juros | Desconto | Valor Final | Valor Pago |
Status | Forma de Pagamento | Data Pagamento | Observações
```

### 11.3 Relatório de Contas por Período

- Filtrar por mês/período
- Agrupar por categoria
- Subtotais por grupo
- Total geral
- Exportar para CSV ou imprimir (window.print())

### 11.4 Relatório de Fornecedor

- Selecionar fornecedor
- Ver histórico completo de contas
- Totais por status
- Média de prazo de pagamento

---

## 12. Integrações Futuras

### 12.1 Módulos Internos

| Integração | Descrição | Prioridade |
|-----------|-----------|------------|
| Dashboard Global | Card de resumo de contas a pagar no `/dashboard` | Alta |
| Fechamento Mensal | Contas pagas no mês podem aparecer no relatório de fechamento | Média |
| Notas de Entrada | Vincular conta a pagar a uma OS (ex: compra de peças da OS-0045) | Média |
| Fluxo de Caixa | Projeção de saídas por período combinando contas pendentes | Futura |
| Orçamento | Comparativo entre orçado e realizado por categoria | Futura |

### 12.2 Integrações Externas

| Integração | Descrição | Prioridade |
|-----------|-----------|------------|
| WhatsApp | Alertas de contas vencendo (via Evolution API ou similar) | Futura |
| E-mail | Notificação de vencimentos próximos | Futura |
| OCR/IA | Leitura automática de boletos/notas para preencher campos | Futura |
| Importação de boletos | Leitura de código de barras ou linha digitável | Futura |
| Open Banking | Conciliação automática com extrato bancário | Longo prazo |

### 12.3 Alertas Automáticos

Futura feature usando `localStorage` + service worker (ou cron job):
- Alerta in-app para contas vencendo em 3 dias
- Alerta para contas vencidas há mais de 5 dias sem pagamento
- Notificação no sino do sistema (já existe no AppLayout)

---

## 13. Plano Técnico de Implementação

### Fase 1 — Fundação de Tipos e Dados
**Objetivo:** Criar toda a estrutura de tipos, seeds e extensões no DataContext  
**Entregáveis:**
- Tipos TypeScript em `src/types/index.ts`
- `PayableCategory` seed em `src/data/seed.ts`
- Extensão do `DataContext` com payables, categories, suppliers, attachments, history
- `AppModuleKey` e `Permission` atualizados
- Permissões por role configuradas em `permissions.ts`

**Dependências:** Nenhuma  
**Riscos:** Nenhum — apenas tipos e dados  
**Prioridade:** Crítica

---

### Fase 2 — Rota e Página Base
**Objetivo:** Registrar o módulo no sistema e criar a página esqueleto  
**Entregáveis:**
- Rota `/contas-a-pagar` em `App.tsx`
- `ProtectedRoute` com roles corretos
- `src/pages/ContasAPagar.tsx` com layout base
- Item no `navItems` do `AppLayout.tsx`
- `preloadRouteModule` para a nova rota
- Acesso restrito a `ADMIN` e `FINANCEIRO`

**Dependências:** Fase 1  
**Riscos:** Possível conflito com ordenação visual do menu  
**Prioridade:** Crítica

---

### Fase 3 — Summary Cards e Filtros
**Objetivo:** Visualização inicial funcional mesmo sem dados  
**Entregáveis:**
- `PayableSummaryCards.tsx`
- `PayableFilters.tsx` com tabs de status e busca
- Hook `usePayableFilters()` para gerenciar estado de filtros
- `PayableEmptyState.tsx`
- `getPayableDisplayStatus()` e helpers em `src/services/domain/payables.ts`

**Dependências:** Fase 2  
**Riscos:** Baixo — componentes isolados  
**Prioridade:** Alta

---

### Fase 4 — Tabela e Listagem
**Objetivo:** Lista completa com paginação, ordenação e ações básicas  
**Entregáveis:**
- `PayableTable.tsx` com colunas completas
- `PayableTableRow.tsx`
- `PayableMobileCard.tsx`
- `PayableStatusBadge.tsx`
- `DueDateIndicator.tsx`
- `PayableActionsMenu.tsx`
- `PayableCategoryBadge.tsx`
- Paginação (reutilizar padrão existente)

**Dependências:** Fase 3  
**Riscos:** Responsividade no mobile — testar em telas pequenas  
**Prioridade:** Alta

---

### Fase 5 — Formulário de Cadastro
**Objetivo:** Criar e editar contas a pagar  
**Entregáveis:**
- `CurrencyInput.tsx` (componente reutilizável — útil em outros módulos)
- `PayableForm.tsx` com todas as seções
- `PayableFormModal.tsx` wrapper
- Validação Zod completa
- Lógica de cálculo `finalAmount` em tempo real
- Toggle de parcelamento (gera N contas)
- Detecção de duplicidade com AlertDialog
- Log de histórico na criação

**Dependências:** Fase 4  
**Riscos:** Complexidade do parcelamento — implementar com cuidado  
**Prioridade:** Alta

---

### Fase 6 — Drawer de Detalhe
**Objetivo:** Visualização completa de uma conta  
**Entregáveis:**
- `PayableDetailsDrawer.tsx` com Sheet
- Tabs: Detalhes | Anexos | Histórico
- Ações: Editar, Cancelar, Excluir (com AlertDialog de confirmação)
- Edição inline via `PayableFormModal` em modo edit
- Exibição de valores, datas e observações

**Dependências:** Fase 5  
**Riscos:** Gerenciamento de estado do drawer (aberto/fechado, conta selecionada)  
**Prioridade:** Alta

---

### Fase 7 — Registro de Pagamento (Baixa)
**Objetivo:** Funcionalidade central de marcar conta como paga  
**Entregáveis:**
- `PayablePaymentDialog.tsx`
- Lógica de pagamento parcial vs. total
- Atualização de status no DataContext
- Log automático no histórico
- Upload de comprovante (pode ser stub inicialmente)
- Toast de confirmação

**Dependências:** Fase 6  
**Riscos:** Tratamento correto de pagamento parcial (saldo devedor)  
**Prioridade:** Alta

---

### Fase 8 — Anexos
**Objetivo:** Upload e visualização de documentos  
**Entregáveis:**
- `PayableAttachmentUploader.tsx` (reutilizar padrão de `Attachment` existente)
- `PayableAttachmentList.tsx`
- Preview de imagens
- Preview de PDFs (iframe)
- Download de arquivos

**Dependências:** Fase 7  
**Riscos:** Upload é stub (sem backend) — deixar preparado para integração real  
**Prioridade:** Média

---

### Fase 9 — Histórico de Alterações
**Objetivo:** Rastreabilidade de todas as ações sobre uma conta  
**Entregáveis:**
- `PayableTimeline.tsx`
- Integração do log em: criar, editar, pagar, cancelar, excluir, anexar
- Tab "Histórico" no drawer com timeline completa

**Dependências:** Fase 8  
**Riscos:** Baixo — log passivo  
**Prioridade:** Média

---

### Fase 10 — Exportação e Relatórios Básicos
**Objetivo:** Exportar dados para análise externa  
**Entregáveis:**
- Exportação CSV com `xlsx` (já no projeto)
- Filtros aplicados ao export
- Botão "Exportar" no header da página

**Dependências:** Fase 9  
**Riscos:** Baixo  
**Prioridade:** Média

---

### Fase 11 — Recorrência e Parcelamento Avançado
**Objetivo:** Suporte completo a contas recorrentes e parcelamentos  
**Entregáveis:**
- Lógica de geração de série recorrente
- Badge de "Parcela X/Y" e "Recorrente"
- Edição de escopo: "só esta" vs. "esta e futuras"
- Visualização agrupada da série

**Dependências:** Fase 5  
**Riscos:** Complexidade de gerenciamento do grupo — testar casos de edge  
**Prioridade:** Baixa (pós-MVP)

---

### Fase 12 — Refinamento Visual e Qualidade
**Objetivo:** Polimento final para nível premium  
**Entregáveis:**
- Animações Framer Motion (stagger, fade, slide)
- Dark mode refinado para todos os componentes
- Testes de responsividade (mobile, tablet, desktop)
- Acessibilidade (labels, focus trap nos modais, ARIA)
- Performance (evitar re-renders desnecessários com `useMemo`)
- Testes unitários dos helpers de domain

**Dependências:** Fase 11  
**Riscos:** Baixo — refinamento  
**Prioridade:** Baixa

---

## 14. Backlog Priorizado

### MVP — Implementar primeiro

- [ ] Tipos e estrutura de dados completa
- [ ] Rota e página registrada no sistema
- [ ] Summary cards com totais em tempo real
- [ ] Filtros por status (tabs) + busca
- [ ] Tabela com listagem paginada
- [ ] Formulário de cadastro (sem parcelamento/recorrência)
- [ ] Drawer de detalhe com informações completas
- [ ] Registro de pagamento (baixa manual)
- [ ] Estados de vazio, loading e erro
- [ ] Toast de feedback em todas as ações

### Importante — Implementar logo após MVP

- [ ] Upload de boleto, nota e comprovante (stub funcional)
- [ ] Histórico de alterações (timeline)
- [ ] Edição de contas existentes
- [ ] Cancelamento com confirmação
- [ ] Exclusão lógica com confirmação dupla para contas pagas
- [ ] Exportação CSV
- [ ] DueDateIndicator com urgência visual
- [ ] Filtros avançados (categoria, fornecedor, período)
- [ ] Detecção de duplicidade

### Desejável — Segunda iteração

- [ ] Parcelamento (geração de série)
- [ ] Recorrência (mensal, semanal, etc.)
- [ ] Fornecedores cadastrados (CRUD)
- [ ] Categorias personalizáveis (CRUD)
- [ ] Pagamento parcial com saldo devedor
- [ ] Gráfico de barras por categoria
- [ ] Card no Dashboard Global com resumo do módulo
- [ ] Relatório de despesas por fornecedor

### Futuro — Planejamento a médio prazo

- [ ] Alertas de vencimento no sino do sistema
- [ ] Integração com fechamento mensal
- [ ] Vínculo com notas de entrada (OS)
- [ ] Previsão de fluxo de caixa
- [ ] Importação de boletos via OCR
- [ ] Alertas WhatsApp/e-mail
- [ ] Open Banking / conciliação automática

---

## 15. Riscos e Cuidados

### Riscos de Produto

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Duplicidade de contas | Alta | Médio | Validação por supplierId + docNumber + valor + vencimento com AlertDialog |
| Baixa incorreta | Média | Alto | AlertDialog de confirmação + histórico de auditoria |
| Confusão entre status PENDENTE e VENCIDO | Alta | Médio | VENCIDO derivado em runtime, bem documentado e destacado visualmente |
| Perda de dados no refresh | Alta | Alto | Persistência em localStorage (padrão do sistema) |
| Parcelamento inconsistente | Média | Alto | Geração atômica de todas as parcelas; testes unitários |
| Recorrência órfã (série parcialmente excluída) | Baixa | Médio | Lógica de escopo bem definida e testada |

### Riscos Técnicos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| DataContext ficando muito grande | Médio | Separar `PayableContext` independente |
| Performance com muitas contas | Médio | `useMemo` nos cálculos de summary; virtualização de lista se necessário |
| `CurrencyInput` com erros de parsing | Alto | Testar com valores edge: 0, negativos, strings vazias |
| Upload de arquivos sem backend | Baixo | Implementar como stub com URLs mock, pronto para integração real |
| Re-renders desnecessários no DataContext | Médio | Selectors específicos nos consumers; não consumir contexto inteiro |

### Cuidados de UX

- Não sobrecarregar a tela com informação — hierarquia clara
- Nunca deixar o usuário sem feedback (loading states, toasts)
- Confirmações para ações destrutivas (exclusão, cancelamento)
- Vencimentos em vermelho devem ser imediatamente visíveis sem precisar de legenda
- Formulário não deve perder dados ao fechar acidentalmente (confirmar descarte)

---

## 16. Sugestões de Produto

### "Semáforo de Caixa"
Mini dashboard semanal no topo da página mostrando os próximos 7 dias como uma linha do tempo com dots representando contas vencendo. Permite ver de uma vez "segunda: R$ 400, terça: R$ 0, quarta: R$ 1.200..." — visão operacional muito poderosa para a dona da retífica.

### "Modo Rápido" de Cadastro
Um botão secundário "Adicionar Rápido" que abre um formulário mínimo (só título + valor + vencimento + categoria) para registrar despesas pequenas sem fricção. Para detalhes, editar depois.

### Indicador de "Saída Prevista do Mês"
No topo da página, uma linha: "Saída prevista em Abril: R$ 8.420,00 — já pagou R$ 3.200,00 (38%)". Dá uma noção imediata do quanto falta.

### Alertas no Sino do Sistema
Reutilizar o `ActivityLog` e o sino de notificações do `AppLayout` para alertar de contas vencendo em 1 dia e contas vencidas. A infraestrutura já existe no sistema — basta adicionar a fonte de dados.

### Categorias com Orçamento Mensal
Cada categoria pode ter um valor de orçamento mensal. Uma barra de progresso no card da categoria mostra quanto já foi gasto vs. orçado. Ex: "Peças e Materiais — R$ 2.400 / R$ 3.000 (80%)". Simples de implementar, alto valor informativo.

### "Baixa Rápida" na Tabela
Botão de ação direta na linha da tabela (sem precisar abrir o drawer) para registrar pagamento com um clique quando valor e forma de pagamento são padrão. Ex: conta com `paymentMethod = PIX` e `finalAmount` definido → um clique → confirma → pago.

### Histórico de Padrões de Gasto
Ao cadastrar uma nova conta de "Água" para "Abril", o sistema sugere o valor com base na média dos últimos 3 meses. Pequena melhoria com grande impacto para contas recorrentes de valor variável.

### Integração com Notas de Entrada (OS)
Ao finalizar uma OS com compra de peças, oferecer atalho: "Deseja registrar o custo desta compra no Contas a Pagar?" — um clique preenche título, valor e fornecedor automaticamente. Fecha o loop operacional.

---

## 17. Pontos a Validar

> Questões abertas que precisam de validação com a dona da empresa antes ou durante a implementação.

- [ ] **Fornecedores cadastrados:** A usuária quer cadastrar fornecedores com CNPJ/dados completos, ou prefere digitar o nome livremente por enquanto?
- [ ] **Parcelamento:** Contas parceladas são comuns? Qual é o cenário típico (cartão, boleto?)
- [ ] **Recorrência:** Quais despesas são fixas/recorrentes? (aluguel, contador, etc.) — isso define a prioridade da feature
- [ ] **Comprovante obrigatório:** Precisa exigir comprovante para marcar como pago, ou é sempre opcional?
- [ ] **Quem acessa:** Só a dona (ADMIN) vai usar, ou a pessoa de confiança do financeiro também precisa de acesso?
- [ ] **Histórico de anos anteriores:** Precisa importar dados de planilhas/papéis existentes para o sistema?
- [ ] **Exportação:** Qual formato é mais útil — CSV para Excel, ou PDF formatado para imprimir?
- [ ] **Alertas:** O sistema precisa alertar vencimentos automaticamente (notificação no sistema) ou a usuária vai consultar ativamente?
- [ ] **Centro de custo:** Faz sentido para a operação atual ou é complexidade desnecessária?
- [ ] **Múltiplos bancos/contas:** A retífica paga de contas bancárias distintas? Isso afeta relatórios de fluxo de caixa futuro.

---

*Documento gerado em 2026-04-13 — Retífica Premium / Retiflow*  
*Próxima revisão recomendada: após conclusão do MVP (Fases 1–7)*
