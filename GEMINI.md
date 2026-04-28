
<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->

---

## 🛠 Developer Guidelines (RetiFlow)

### 1. Architecture & Core Mandates

- **SPA Strictness**: This is a Vite + React 18 SPA. **NEVER** use Next.js, Server Components, or SSR patterns.
- **Supabase Gateway**: All DB writes and reads must go through RPCs in `src/api/supabase/`. 
  - Use `.schema('RetificaPremium').rpc('rpc_name', { params })`.
  - RPCs must be `SECURITY DEFINER` and validated on the DB side.
- **State Management**:
  - Global UI and non-DB state: `DataContext.tsx`.
  - Server-synchronized state: `React Query` + `Supabase RPCs`.
  - Persistent Local State: `localStorage` (via DataContext).

### 2. Coding Standards

- **TypeScript**: 100% type coverage. Centralize all interfaces in `src/types/index.ts`.
- **Naming**: 
  - Components: PascalCase (e.g., `NoteFormCore.tsx`).
  - Hooks: camelCase starting with `use` (e.g., `useOperationalQueries.ts`).
  - RPCs: snake_case (e.g., `get_notas_servico`).
- **UI & Styling**:
  - Follow the **shadcn/ui** pattern: Radix primitives + Tailwind CSS.
  - Primary Color: Teal `hsl(192, 70%, 38%)`.
  - Layouts: Use `AppLayout` for authenticated routes and `AdminLayout` for management pages.

### 3. Workflow & Maintenance

- **Session Context**: Always check and update `docs/contexto-sessao.md` at the end of every task or session. This is the source of truth for current project status.
- **Forms**: Use `react-hook-form` with `zod` for validation. Prefer a "Core" component for the form logic and "Modal" wrappers for Dialog usage.
- **Toasts**: Use the system's toast notification (top-right, teal for success, red for error, 5s duration).
- **Testing**:
  - **Logic/Unit**: Add or update tests in `src/test/` for any logic changes. Use `vitest`.
  - **E2E**: Add or update end-to-end tests in `tests/e2e/` for new features or critical bug fixes. Use `playwright`.
  - **E2E Helpers**: Always use `setupE2E(page)` in `beforeEach` to clear state and `ensureHydrated(page)` after navigations to handle loading screens.
  - **E2E Selectors**: Prefer `getByRole`, `getByText`, or `getByLabel` over CSS selectors.

### 4. Critical UI Patterns

- **Dialogs**: Ensure all Modals have a close (X) button and handle `onOpenChange` correctly.
- **Loading States**: Use `loading-screen.tsx` or skeleton patterns during async operations.
- **Validation**: Implement CPF/CNPJ and Plate validation using the algorithms provided in `services/domain/`.
