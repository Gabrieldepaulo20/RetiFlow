---
id: TASK-1.1
title: '[E2E] Implement coverage for Intake Notes (Notas de Entrada)'
status: Done
assignee: []
created_date: '2026-04-28 17:16'
updated_date: '2026-04-28 18:46'
labels: []
dependencies: []
parent_task_id: TASK-1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement E2E tests for the Intake Notes module.
Files to cover:
- src/pages/IntakeNotes.tsx
- src/pages/IntakeNoteDetail.tsx
- src/pages/IntakeNoteForm.tsx
- src/components/notes/NoteFormCore.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Test case: Listing notes (ensure notes from seed or mock are visible).
- [ ] #2 Test case: Opening note details and verifying data consistency.
- [ ] #3 Test case: Creating a new intake note via NoteFormCore with valid data.
- [ ] #4 Test case: Editing an existing intake note and saving changes.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented comprehensive E2E tests for the Intake Notes (Notas de Entrada) module.
- Added tests/e2e/intake-notes.spec.ts with coverage for:
  - Listing notes from seed data.
  - Opening the detailed view modal for an OS.
  - Creating a new OS (including client selection, date picking, and item addition).
  - Editing an existing OS and verifying the update.
- Used E2E helpers for state management and hydration.
- Verified that all 5 tests passed successfully using Playwright.
<!-- SECTION:FINAL_SUMMARY:END -->
