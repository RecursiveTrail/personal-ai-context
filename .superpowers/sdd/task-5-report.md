# Task 5 report — Connect MCP full page (no approval copy)

**Status:** DONE_WITH_CONCERNS

**Commit:** `592d37e` Make Connect MCP a full page without approval copy.

## Changes
- `ConnectMcp.tsx`: replaced `<details className="connect-mcp">` with `<section className="connect-page" aria-label="Connect MCP">`. Lead copy, snippet `<pre>`, Copy button, and `role="alert"` errors kept. Removed the “MCP writes stay pending until you Approve them in the desk.” sentence.
- `ConnectMcp.test.tsx`: new “shows snippet and Copy without approval copy” case (exact brief assertions). Copy + error tests kept; expand/`details` clicks removed.
- `App.test.tsx`: nav test now asserts a `region` named “Connect MCP”, visible lead text, and no `<details>` (no collapsed-details DOM quirk).
- `App.css`: `.connect-page` centered `width: min(40rem, calc(100% - 64px)); margin: 0 auto; padding: 12px 0 48px` (capture desk content padding). Restored snippet/lead/actions styles on capture tokens (Task 4 had removed `.connect-mcp*`).

## TDD
- RED: `shows snippet and Copy without approval copy` failed on leftover Approve/pending copy; App nav test failed (`role="region"` missing while still a `<details>`). Copy/error tests already passed without expand.
- GREEN: `npm test -w @personal-os/desktop` — 11/11 pass.

## Self-review
- Matches brief UI contract: full page, no approval copy, centered content width.
- Heading omitted (optional).
- Extra CSS for `.connect-lead` / `.connect-snippet` / `.connect-actions` is required after Task 4 stripped strip styles; not in the brief’s CSS snippet but needed for a usable page.

## Concerns
- Not visually checked in a browser/Tauri window (invoke needs the host).
- Pre-existing: Copy “Copied” timeout is not cleared on unmount.
