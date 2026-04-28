---
id: TASK-1.3
title: '[E2E] Implement coverage for Kanban board'
status: Done
assignee: []
created_date: '2026-04-28 17:16'
updated_date: '2026-04-28 17:49'
labels: []
dependencies: []
parent_task_id: TASK-1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement E2E tests for the Kanban module.
Files to cover:
- src/pages/Kanban.tsx
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Test case: Verify all expected columns are present.
- [ ] #2 Test case: Drag and drop a note between columns and verify status update.
- [ ] #3 Test case: Click on a card to open details.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented E2E tests for the Kanban module in `tests/e2e/kanban.spec.ts`.
Coverage includes:
- Verification of all Kanban columns and their labels.
- Interaction with cards to open the detail modal.
- Drag and drop functionality between columns with status update validation.
Fixed `setupE2E` helper to correctly handle storage clearing without breaking session persistence.
Optimized drag and drop using manual mouse events on the drag handle for improved reliability with @hello-pangea/dnd.
<!-- SECTION:FINAL_SUMMARY:END -->
