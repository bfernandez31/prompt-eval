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
- **Prompt best practices** (drives hypothesis generation + judge rubric): [`references/prompt-best-practices.md`](references/prompt-best-practices.md)

## Architecture

- **Entry point**: a Claude Code skill (`/prompt-eval`)
- **Orchestration**: Claude Code Agent Teams (1 lead + N hypothesis-evaluators with isolated context)
- **Per-variation runs**: standard Agent tool sub-agents over `git clone --shared` sandboxes
- **Profiles**: declarative YAML files describing a target prompt + how to evaluate it. Adding a new target = adding a new profile, no code changes.

## Install

```bash
# 1. Set the Mistral API key (used by the L1 stability evaluator)
export MISTRAL_API_KEY="..."

# 2. Make sure Agent Teams is enabled in ~/.claude/settings.json:
#    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

Then, in a Claude Code session:

```
/plugin marketplace add bfernandez31/prompt-eval
/plugin install prompt-eval@prompt-eval
```

Restart the session. The skill is now invoked as `/prompt-eval <profile>`.

The plugin ships a bundled `dist/cli.js` (yaml dependency embedded), so no `bun install` is required to use it. Bun itself is required at runtime to execute `dist/cli.js`.

## Usage

### Bootstrap a new profile (no YAML to write by hand)

```
/prompt-eval-init ai-board.compare
```

Interactive wizard that reads the target prompt, auto-detects fields where possible (output path, decision section, rubric criteria), asks you to confirm, and saves a validated `profiles/ai-board.compare.yml`. ~6 questions max.

### Run an evaluation

```
/prompt-eval ai-board.specify                    # semi-auto (default)
/prompt-eval ai-board.specify --mode auto        # zero intervention
/prompt-eval ai-board.specify --max-budget 20    # tighter cap
```

The skill dispatches an Agent Team to evaluate each hypothesis through the cascade and report back. See [`docs/adding-a-target.md`](docs/adding-a-target.md) for manual profile authoring details.

## Contributing / Dev Workflow

```bash
git clone https://github.com/bfernandez31/prompt-eval
cd prompt-eval
bun install              # only needed for development
bun test                 # 44 unit tests
bun run typecheck        # strict TS
bun run build            # rebuild dist/cli.js after editing lib/
```

When touching `lib/`, always rebuild `dist/cli.js` and commit it alongside the source change so end users get the updated logic without `bun install`.

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
