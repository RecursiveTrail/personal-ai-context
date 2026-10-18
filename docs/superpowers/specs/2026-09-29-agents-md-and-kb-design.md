# AGENTS.md and Agent Knowledge Base — Design Spec

**Date:** 2026-09-29  
**Status:** Implemented  
**Scope:** Agent onboarding docs only; no application code changes.

## Problem

Agents working in this repo lack a short, durable entry point and agent-specific guidance. Existing docs (`README`, `docs/architecture.md`, etc.) are strong but not framed as “how an agent should operate here,” and there is no rule requiring agent-facing docs to stay current after substantive changes.

## Goals

- Add root `AGENTS.md` as the always-on agent entry point.
- Add `docs/agent-kb/` with focused supporting files (not a duplicate of product docs).
- Require that after substantive changes, agents **ask** whether to update `AGENTS.md` / agent-kb — never update those silently.
- Point into existing canonical docs instead of rewriting architecture, pack format, MCP, or development guides.

## Non-goals

- Creating `.cursor/rules/*.mdc` in this pass.
- Rewriting or relocating existing `docs/` product documentation.
- Automating doc updates or changelog enforcement beyond the ask-first policy.
- Committing unless the user explicitly requests a commit.

## Chosen approach

**Thin `AGENTS.md` + topic knowledge base** under `docs/agent-kb/`.

Update trigger: after **substantive** work (features, APIs, pack format, architecture, workflows), ask once at end of turn whether to update agent docs.

## File layout

```text
AGENTS.md
docs/agent-kb/
  README.md
  overview.md
  workflows.md
  conventions.md
  keeping-docs-current.md
```

| File | Role |
|------|------|
| `AGENTS.md` | Short entry: purpose, read order, repo map, commands, hard rules, doc-hygiene ask |
| `docs/agent-kb/README.md` | Index of kb files |
| `overview.md` | Components, files-as-contract, V1 boundaries; links to architecture/pack-format/spec |
| `workflows.md` | Capture→pack→MCP; pack-contract TDD; shelf/MCP op pointers to `docs/development.md` |
| `conventions.md` | Workspace commands, pack-core entry points, tests/fixtures/changelog habits |
| `keeping-docs-current.md` | What is substantive; end-of-turn ask; what not to touch without asking |

## Content requirements

### `AGENTS.md`

- 2–3 sentence product purpose (Personal Context OS).
- Explicit read order: this file → `docs/agent-kb/` → existing `docs/` as needed.
- Repo map: `packages/pack-core`, `apps/capture`, `apps/context-mcp`, `fixtures/personal-os`.
- Essential commands: `npm install`, `npm test`, `npm run build`, capture/MCP `dev`.
- Hard rules: local-first V1 boundaries; pack format is the contract; do not invent sync/accounts/embeddings.
- Doc hygiene: after substantive work, ask before updating `AGENTS.md` / `docs/agent-kb/`; never silent updates. Link to `keeping-docs-current.md`.

### Knowledge base

- Agent-facing guidance only; prefer links over copying long sections from `docs/`.
- `keeping-docs-current.md` defines substantive vs trivial, the ask-first ritual, and out-of-scope files (e.g. ideas backlog, historical design-spec edits unless requested).

### Cross-links

- Root `README.md` Documentation section should link to `AGENTS.md` (and optionally `docs/agent-kb/`) so humans find it too.

## Success criteria

1. A new agent session can orient from `AGENTS.md` alone enough to know packages, commands, and where to dig next.
2. The ask-before-update policy is stated in both `AGENTS.md` and `keeping-docs-current.md`.
3. No silent duplication of pack-format or architecture as a second source of truth.

## Implementation notes

- Implement as markdown-only edits matching this outline.
- Do not commit unless the user asks.
- After implementation, optionally offer to commit; do not auto-commit.
