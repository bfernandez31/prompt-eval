# Architecture

prompt-eval is a Claude Code plugin built around three layers:

1. **Skill** (`/prompt-eval`) — the user-facing entry point AND the team lead. It reads a profile, runs an interactive hypothesis loop, then dispatches all teammates directly at the top level (no nested teams). It also coordinates L1/L2 scoring, the pairwise bracket, and the per-round decision.
2. **Runner teammates** — one isolated Claude Code instance per `(hypothesis, run_index)`. Each runner runs a single headless `claude --print` invocation against its dedicated `git clone --shared` sandbox, captures the produced artifact, and reports back. All runners are visible in the Claude Code Agent Teams tmux split.
3. **Bun TypeScript library** (`lib/`) — pure logic (profile loading, state I/O, embedding, scoring, bracket, judge, reports). The skill and the runners shell out via `scripts/prompt-eval` (the bundled `dist/cli.js`).

The architecture is deliberately flat: the skill is the only orchestrator, and runners are the only teammate role. This avoids the nested-team limitation of Claude Code Agent Teams and keeps every parallel agent visible to the user.

State is filesystem-first under `~/.prompt-eval/runs/<run-id>/`. Clones are transient under `~/.prompt-eval/clones/<run-id>/` and are cleaned up at the end of each round.

See `docs/specs/2026-04-26-prompt-eval-framework-design.md` for the full architecture spec (the spec describes the original design with separate orchestrator/hypothesis-evaluator teammates; the implementation flattened this layer for visibility and to avoid nested-team dispatch).
