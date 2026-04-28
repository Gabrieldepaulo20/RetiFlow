---
id: TASK-1.5
title: '[E2E] Implement coverage for Settings & User Profile'
status: Done
assignee: []
created_date: '2026-04-28 17:16'
updated_date: '2026-04-28 18:49'
labels: []
dependencies: []
parent_task_id: TASK-1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement E2E tests for the Settings and Admin modules.
Files to cover:
- src/pages/Settings.tsx
- src/pages/admin/*
- src/hooks/useSystemUsersQuery.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Test case: Navigating through settings tabs.
- [ ] #2 Test case: Updating user profile information.
- [ ] #3 Test case: (Admin) Listing and managing system users.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented comprehensive E2E test coverage for Settings and User Profile modules.
- Created `tests/e2e/settings.spec.ts` covering settings tabs navigation, appearance/theme changes, and O.S. model previews.
- Implemented Admin User Management tests including listing, filtering, creating users, and managing module permissions.
- Added `data-testid` attributes to `Settings.tsx`, `AdminClients.tsx`, and `OSPreviewModal.tsx` to ensure reliable element targeting.
- Improved `ensureHydrated` helper in `tests/e2e/helpers/mock-rpc.ts` with better logging and robust wait conditions.
- Verified all 8 tests pass in serial mode.
<!-- SECTION:FINAL_SUMMARY:END -->
