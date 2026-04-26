# Architecture

prompt-eval is a Claude Code plugin built around three layers:

1. **Skill** (`/prompt-eval`) — the user-facing entry point. Reads a profile, runs an interactive hypothesis loop, and dispatches a team.
2. **Agent Team** — one team lead (`eval-orchestrator`) and N teammates (`hypothesis-evaluator`), each in an isolated Claude Code instance.
3. **Bun TypeScript library** (`lib/`) — pure logic (profile loading, state I/O, embedding, scoring, bracket, judge, reports). Agents shell out via `scripts/prompt-eval`.

State is filesystem-first under `~/.prompt-eval/runs/<run-id>/`. Clones are transient under `~/.prompt-eval/clones/<run-id>/`.

See `docs/specs/2026-04-26-prompt-eval-framework-design.md` for the full architecture spec.
