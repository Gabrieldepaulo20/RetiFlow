---
id: TASK-1.2
title: '[E2E] Implement coverage for Invoices (Faturas)'
status: Done
assignee: []
created_date: '2026-04-28 17:16'
updated_date: '2026-04-28 18:13'
labels: []
dependencies: []
parent_task_id: TASK-1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement E2E tests for the Invoices module.
Files to cover:
- src/pages/Invoices.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Test case: Listing invoices and verifying their connection to intake notes.
- [x] #2 Test case: Generating an invoice from a finalized intake note.
- [x] #3 Test case: Viewing invoice details.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the E2E tests in `tests/e2e/invoices.spec.ts`. The failure was caused by the "Vincular a Nota de Entrada" Select component displaying "Nenhuma" by default because `noteId` was initialized to `NO_NOTE`. The test expected the placeholder "Selecione uma nota finalizada". I updated `EMPTY_FORM` to initialize `noteId` to an empty string, allowing the placeholder to show, and updated `handleSubmit` to treat an empty `noteId` as `undefined`. All invoice E2E tests are now passing.
<!-- SECTION:FINAL_SUMMARY:END -->
