# Keeping agent docs current

`AGENTS.md` and `docs/agent-kb/` exist so future agents can orient quickly. They drift if code or workflows change without a deliberate update.

## Rule

After **substantive** work, **ask** the user whether to update agent docs. Never edit `AGENTS.md` or `docs/agent-kb/` silently as a side effect of other work.

## What counts as substantive

Ask when the change affects any of:

- Features or product behavior agents should know about
- APIs (MCP tools, HTTP routes, env/CLI flags)
- Pack format, default shelves, or fixture contract
- Architecture or package boundaries
- Agent workflows (how to run, test, or ship changes)

Skip the ask for trivial work that does not change those surfaces (typo-only, comment-only, purely internal refactors with no agent-facing effect) unless the user asks for a doc pass.

## End-of-turn ritual

1. Finish the substantive code/doc work the user requested.
2. Briefly list what in `AGENTS.md` / `docs/agent-kb/` (and optionally which canonical `docs/` files) would need updating and why.
3. Ask something like: “Want me to update agent docs (`AGENTS.md` / `docs/agent-kb/`) for this?”
4. Only edit those files after an explicit yes.

## What not to touch without asking

- [`docs/ideas/`](../ideas/) backlog / idea notes
- Historical design or plan files under `docs/superpowers/` (except when the user asked for a new or revised design/plan)
- Unrelated READMEs or changelog noise beyond what the release/contract change requires

## Canonical vs agent docs

| Kind of truth | Edit |
|---------------|------|
| Architecture, pack format, MCP/HTTP, development procedures | Canonical files under `docs/` (and package READMEs) |
| How agents should start, hard rules, doc-hygiene policy | `AGENTS.md` + `docs/agent-kb/` |

When both need updates, prefer updating the canonical doc first, then ask about a short agent-kb / `AGENTS.md` pointer refresh.
