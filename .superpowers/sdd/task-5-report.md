# Task 5 report: Pending panel in the desk

- `lib/tauriApi.ts`: `PendingRecord` type + `listPending`, `approvePending(id)`, `rejectPending(id)` (invoke `list_pending`/`approve_pending`/`reject_pending`, arg `{ id }`).
- `components/PendingPanel.tsx`: badge count, list with title (note title or delete target), shelf, op, 120-char excerpt, Approve/Reject buttons (disabled while acting). Refreshes on mount, every 5s (`pollMs` prop), and after each action; calls `onResolved` so App reloads notes/shelves. Errors shown with `role="status"` (so App's `role="alert"` stays unique).
- `App.tsx`: panel mounted in `#pending-slot`; `App.css` styles added; `App.test.tsx` mock now answers `list_pending`.
- Tests (`PendingPanel.test.tsx`, mocked invoke): badge/details, approve, reject, polling. 9/9 desktop tests pass; `tsc --noEmit` OK.
