---
id: TASK-1
title: '[E2E] Expand test coverage across all application modules'
status: To Do
assignee: []
created_date: '2026-04-28 17:16'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Increase the E2E test coverage for the RetiFlow application using Playwright. The goal is to ensure all major functional modules and their main user flows are verified automatically, preventing regressions.

Modules to cover:
- Intake Notes (Notas de Entrada)
- Invoices (Faturas)
- Kanban
- Monthly Closing (Fechamento Mensal)
- Settings & User Management
- Client Portal
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All major modules listed in the dashboard have at least one E2E happy-path test.
- [ ] #2 Tests run successfully in the CI environment (or local equivalent).
- [ ] #3 E2E helpers (setupE2E, ensureHydrated) are used consistently.
<!-- AC:END -->
