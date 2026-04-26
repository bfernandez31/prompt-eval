# prompt-eval

A self-improvement framework for prompts (Claude Code commands, skills, agents).

Given a target prompt and a set of variations ("hypotheses"), runs each variation in isolated `git clone --shared` sandboxes, executes the prompt N times per variation, then evaluates the outputs across three cascading levels:

1. **Stability** — are the N runs of the same variation consistent? (embedding similarity, cheap)
2. **Decision consistency** — do the runs reach the same auto-resolved decisions? (structured parsing, free)
3. **Decision quality** — are the decisions defensible? (LLM-judge pairwise bracket, only run if 1 & 2 pass)

The cascade short-circuits: a variation that fails stability never pays for the LLM-judge.

## Status

MVP shipped — see commit history. All unit tests green.

- Design doc: [`docs/specs/2026-04-26-prompt-eval-framework-design.md`](docs/specs/2026-04-26-prompt-eval-framework-design.md)
- Implementation plan: [`docs/plans/2026-04-26-prompt-eval-mvp.md`](docs/plans/2026-04-26-prompt-eval-mvp.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Eval cascade: [`docs/eval-cascade.md`](docs/eval-cascade.md)
- Adding a new target: [`docs/adding-a-target.md`](docs/adding-a-target.md)

## Architecture

- **Entry point**: a Claude Code skill (`/prompt-eval`)
- **Orchestration**: Claude Code Agent Teams (1 lead + N hypothesis-evaluators with isolated context)
- **Per-variation runs**: standard Agent tool sub-agents over `git clone --shared` sandboxes
- **Profiles**: declarative YAML files describing a target prompt + how to evaluate it. Adding a new target = adding a new profile, no code changes.

## Usage

1. **Install**: clone this repo into `~/.claude/plugins/prompt-eval` (or another path your Claude Code installation reads plugins from).
2. **Set `MISTRAL_API_KEY`** in your environment.
3. **Enable Agent Teams**: ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in `~/.claude/settings.json`.
4. **Verify prerequisites**: `./scripts/check-prereqs.sh`
5. **From a Claude Code session**: `/prompt-eval ai-board.specify`

See [`docs/adding-a-target.md`](docs/adding-a-target.md) to evaluate other prompts.

## Tests

```bash
bun test         # full unit test suite
bun run typecheck
```

## Roadmap

- [x] Design doc
- [x] Plugin scaffolding (`.claude-plugin/`, skill, agent roles)
- [x] First profile: `ai-board.specify.yml`
- [x] L1 stability evaluator (embeddings)
- [x] L2 decision consistency parser
- [x] L3 LLM-judge bracket
- [x] Clone lifecycle management
- [x] Round + final report renderers
- [ ] End-to-end smoke run on `ai-board.specify`
- [ ] `--mode auto` end-to-end testing
- [ ] `prompt-eval resume` / `prompt-eval clean` CLI subcommands
- [ ] Additional profiles: `compare`, `review`, ...
