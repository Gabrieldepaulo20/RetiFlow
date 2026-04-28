# RetiFlow

Smart workflow platform for engine head repair shops (Retíficas de Motores).

## 🚀 Project Overview

RetiFlow is a specialized SPA (Single Page Application) designed to manage the unique workflow of engine head repair shops. It handles everything from customer intake and service orders to financial management and monthly closing.

## 🛠 Tech Stack

- **Frontend**: React 18 (TypeScript) + Vite
- **Routing**: React Router v6
- **UI**: Tailwind CSS + Radix UI (shadcn/ui pattern)
- **Icons**: Lucide React
- **Backend/DB**: Supabase (Auth, Database, RPCs)
- **State Management**: DataContext (Context API) + localStorage + React Query
- **Validation**: Zod + React Hook Form
- **Testing**: Vitest + Testing Library (Unit/Logic) & Playwright (E2E)

## 📦 Key Modules

- **Dashboard**: High-level overview of shop performance and status.
- **Clients**: Complete CRM for managing repair shop customers (CPF/CNPJ validation).
- **Kanban (Notes)**: Visual workflow for managing service orders (Intake Notes) across different stages.
- **Intake Notes (OS)**: Detailed service order management with Supabase integration.
- **Invoices & Closing**: Monthly closing workflow and PDF generation for customers.
- **Accounts Payable**: Comprehensive financial module for managing expenses, suppliers, and payments.

## 📐 Project Structure

```
src/
  api/supabase/    - Supabase RPC gateways and adapters
  components/ui/   - Base UI components (Radix + Tailwind)
  contexts/        - Global state (DataContext, AuthContext)
  hooks/           - Custom hooks for data fetching and logic
  pages/           - Main application views
  services/domain/ - Business logic and domain helpers
  types/           - Centralized TypeScript definitions
docs/              - Project documentation and session context
tests/e2e/         - Playwright end-to-end tests
```

## 📜 Core Guidelines

- **SPA ONLY**: This is a pure Vite + React SPA. **DO NOT use Next.js patterns**.
- **Supabase Architecture**: All database interactions must go through RPCs (Remote Procedure Calls) with `SECURITY DEFINER`. Use the `.schema('RetificaPremium').rpc()` pattern.
- **Primary Color**: Teal `hsl(192, 70%, 38%)`.
- **Typing**: All types must be centralized in `src/types/index.ts`.
- **State**: Prefer `DataContext` for cross-cutting state and Supabase for persistent data.
- **Design Pattern**: Follow the shadcn/ui pattern for component structure and styling.
- **Testing**: 
  - Use **Vitest** for domain logic and component unit tests (`src/test/`).
  - Use **Playwright** for critical user flows and E2E validation (`tests/e2e/`).
  - All E2E tests should use the `VITE_AUTH_MODE=mock` for deterministic results.

## 🔧 Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up `.env` (use `.env.example` as reference)
4. Run dev server: `npm run dev`

## 🧪 Testing

### Unit & Logic (Vitest)
- Run tests: `npm run test`
- Watch mode: `npm run test:watch`

### End-to-End (Playwright)
- Run all tests: `npm run test:e2e`
- Open Playwright UI: `npx playwright test --ui`
- View report: `npx playwright show-report`

## 📖 Documentation

Detailed documentation is available in the `docs/` folder:
- `contexto-sessao.md`: Current project status, detailed architecture, and recent changes.
- `modulo-contas-a-pagar.md`: In-depth documentation for the Accounts Payable module.
